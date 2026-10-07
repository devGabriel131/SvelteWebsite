import { createHash } from 'node:crypto';
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { Database } from '../db/connection';
import { students, type Student } from '../db/schema';
import { bootcampAccounts as accounts, bootcampDocuments as documents, bootcampEvents as events, bootcampPayments as payments, bootcampRegistrations as registrations } from '../db/bootcamp-schema';
import { isAdult, registrationAvailable, validBirthDate } from '../../bootcamp/rules';
import { sectionKeys, type BootcampEvent, type LetterSnapshot, type StudentBootcampPage, type StudentSnapshot, type WaiverSnapshot } from '../../bootcamp/types';
import { BootcampError, employerFields, field, id, languageField, revisionField } from './validation';
import { validateSignature } from './signatures';
import { renderLetterPdf, renderWaiverPdf } from './pdf';
import { createPreviewProof, studentIdentityVersion } from './signing';

export function eventView(event: typeof events.$inferSelect): BootcampEvent {
	return {
		id: event.id, revision: event.revision, title: event.title, venue: event.venue,
		startsAt: event.startsAt.toISOString(), endsAt: event.endsAt.toISOString(), arrivalAt: event.arrivalAt.toISOString(),
		registrationClosesAt: event.registrationClosesAt.toISOString(), legal: event.legal,
		legalApproved: event.legalApproved, registrationOpen: event.registrationOpen
	};
}
export async function linkedStudent(db: Database, userId: string): Promise<Student | null> {
	const [row] = await db.select({ student: students }).from(accounts).innerJoin(students, eq(students.id, accounts.studentId)).where(eq(accounts.userId, userId));
	return row?.student ?? null;
}
function eligible(student: Student, now: Date, requireDob = false) {
	if (!student.isActive || (student.dateOfBirth ? !isAdult(student.dateOfBirth, now) : requireDob)) throw new BootcampError('ineligible');
}
function openEvent(event: typeof events.$inferSelect | undefined, now: Date) {
	if (!event || !registrationAvailable(eventView(event), now)) throw new BootcampError('closed');
	return event;
}

export async function studentPage(db: Database, userId: string, paymentEnabled: boolean, now = new Date()): Promise<StudentBootcampPage> {
	const student = await linkedStudent(db, userId);
	if (!student) return { student: null, events: [], registrations: [], paymentEnabled };
	const own = await db.select().from(registrations).where(eq(registrations.studentId, student.id));
	const visible = (await db.select().from(events).orderBy(desc(events.startsAt))).filter((event) =>
		event.endsAt >= now && ((student.isActive && (!student.dateOfBirth || isAdult(student.dateOfBirth, now)) && registrationAvailable(eventView(event), now)) || own.some((r) => r.eventId === event.id)));
	const ownVisible = own.filter((r) => visible.some((e) => e.id === r.eventId));
	const ids = ownVisible.map((r) => r.id);
	const docs = ids.length ? await db.select({ id: documents.id, registrationId: documents.registrationId, kind: documents.kind, language: documents.language }).from(documents).where(inArray(documents.registrationId, ids)) : [];
	const attempts = ids.length ? await db.select({ id: payments.id, registrationId: payments.registrationId, status: payments.status, amountCents: payments.amountCents, lastError: payments.lastError }).from(payments).where(inArray(payments.registrationId, ids)).orderBy(desc(payments.createdAt)) : [];
	return {
		student: { id: student.id, name: `${student.firstName} ${student.lastName}`, email: student.email, dateOfBirth: student.dateOfBirth, identityVersion: studentIdentityVersion(student) },
		events: visible.map((e) => ({ ...eventView(e), registrationOpen: e.registrationOpen && student.isActive && (!student.dateOfBirth || isAdult(student.dateOfBirth, now)) })),
		registrations: ownVisible.map((r) => {
			const payment = attempts.find((p) => p.registrationId === r.id);
			return { id: r.id, eventId: r.eventId, waiver: r.waiver, letterChoice: r.letterChoice,
				paidCents: attempts.filter((p) => p.registrationId === r.id && p.status === 'completed').reduce((sum, p) => sum + p.amountCents, 0),
				payment: payment ? { id: payment.id, status: payment.status, uncertain: payment.lastError !== null } : undefined,
				documents: docs.filter((d) => d.registrationId === r.id).map(({ id, kind, language }) => ({ id, kind, language })) };
		}), paymentEnabled
	};
}

export function createRegistrationService(db: Database, backupDocument: (id: string) => Promise<unknown> = async () => {}, previewSecret?: string) {
	const proof = createPreviewProof(previewSecret);
	async function context(userId: string, eventId: string, now = new Date()) {
		const student = await linkedStudent(db, userId);
		if (!student) throw new BootcampError('notLinked');
		eligible(student, now);
		const [event] = await db.select().from(events).where(eq(events.id, id(eventId)));
		return { student, event: openEvent(event, now) };
	}
	async function start(userId: string, eventId: string) {
		const { student } = await context(userId, eventId);
		return db.transaction(async (tx) => {
			const [event] = await tx.select().from(events).where(eq(events.id, eventId)).for('update');
			openEvent(event, new Date());
			const [currentStudent] = await tx.select().from(students).where(eq(students.id, student.id)).for('update');
			eligible(currentStudent, new Date());
			await tx.insert(registrations).values({ eventId, studentId: student.id }).onConflictDoNothing();
			const [registration] = await tx.select().from(registrations).where(and(eq(registrations.eventId, eventId), eq(registrations.studentId, student.id)));
			return registration.id;
		});
	}
	async function prepareWaiver(userId: string, form: FormData) {
		const eventId = id(form.get('eventId'));
		const now = new Date();
		const { student, event } = await context(userId, eventId, now);
		if (event.revision !== revisionField(form) || form.get('identityVersion') !== studentIdentityVersion(student)) throw new BootcampError('stale');
		const dateOfBirth = field(form, 'dateOfBirth', 10);
		if (!validBirthDate(dateOfBirth, now) || !isAdult(dateOfBirth, now)) throw new BootcampError('ineligible');
		if (student.dateOfBirth && dateOfBirth !== student.dateOfBirth) throw new BootcampError('stale');
		const signatures = {} as WaiverSnapshot['signatures'];
		for (const section of sectionKeys) {
			const readKey = `read${section[0].toUpperCase()}${section.slice(1)}`;
			if (form.get(readKey) !== 'true') throw new BootcampError('invalid');
			try { signatures[section] = validateSignature(form.get(section)); } catch { throw new BootcampError('invalid'); }
		}
		const info: StudentSnapshot = { name: `${student.firstName} ${student.lastName}`, email: student.email, dateOfBirth,
			phone: field(form, 'phone', 40), municipality: field(form, 'municipality', 100), signingCity: field(form, 'signingCity', 100) };
		const previewToken = form.get('previewToken');
		if (previewToken !== null && typeof previewToken !== 'string') throw new BootcampError('invalid');
		const signedAt = previewToken ? proof.signedAt(previewToken) : now.toISOString();
		if (!isAdult(dateOfBirth, new Date(signedAt))) throw new BootcampError('ineligible');
		if (languageField(form) !== 'es') throw new BootcampError('invalid');
		const snapshot: WaiverSnapshot = { event: eventView(event), student: info, language: 'es', signedAt, signatures };
		if (previewToken) proof.verify(previewToken, userId, snapshot, studentIdentityVersion(student));
		let pdf: Buffer;
		try { pdf = await renderWaiverPdf(snapshot); } catch { throw new BootcampError('invalid'); }
		return { snapshot, pdf, student };
	}
	async function preview(userId: string, form: FormData) { return (await prepareWaiver(userId, form)).pdf; }
	async function previewDocument(userId: string, form: FormData) {
		const { snapshot, pdf, student } = await prepareWaiver(userId, form);
		return { pdf, token: proof.sign(userId, snapshot, studentIdentityVersion(student)) };
	}
	async function submitWaiver(userId: string, form: FormData) {
		const eventId = id(form.get('eventId'));
		const { student: owner } = await context(userId, eventId);
		const [completed] = await db.select({ id: documents.id }).from(documents)
			.innerJoin(registrations, eq(registrations.id, documents.registrationId))
			.where(and(eq(registrations.eventId, eventId), eq(registrations.studentId, owner.id), isNotNull(registrations.waiver), eq(documents.kind, 'waiver')));
		// A lost response can be retried even if the first save filled in DOB/updated_at.
		// Return existing evidence; never apply the retried form to an already-signed document.
		if (completed) {
			try { await backupDocument(completed.id); } catch { /* The stored document remains retryable. */ }
			return completed.id;
		}
		const { snapshot, pdf, student } = await prepareWaiver(userId, form);
		const documentId = await db.transaction(async (tx) => {
			const [event] = await tx.select().from(events).where(eq(events.id, snapshot.event.id)).for('update');
			openEvent(event, new Date());
			if (event.revision !== snapshot.event.revision) throw new BootcampError('stale');
			const [currentStudent] = await tx.select().from(students).where(eq(students.id, student.id)).for('update');
			eligible(currentStudent, new Date());
			if (studentIdentityVersion(currentStudent) !== studentIdentityVersion(student) || `${currentStudent.firstName} ${currentStudent.lastName}` !== snapshot.student.name || currentStudent.email !== snapshot.student.email ||
				(currentStudent.dateOfBirth && currentStudent.dateOfBirth !== snapshot.student.dateOfBirth)) throw new BootcampError('stale');
			await tx.insert(registrations).values({ eventId: event.id, studentId: student.id }).onConflictDoNothing();
			const [registration] = await tx.select().from(registrations).where(and(eq(registrations.eventId, event.id), eq(registrations.studentId, student.id))).for('update');
			if (registration.waiver) {
				const [existing] = await tx.select({ id: documents.id }).from(documents).where(and(eq(documents.registrationId, registration.id), eq(documents.kind, 'waiver')));
				return existing.id;
			}
			if (!currentStudent.dateOfBirth) await tx.update(students).set({ dateOfBirth: snapshot.student.dateOfBirth, updatedAt: new Date() }).where(eq(students.id, student.id));
			await tx.update(registrations).set({ waiver: snapshot, updatedAt: new Date() }).where(eq(registrations.id, registration.id));
			const [saved] = await tx.insert(documents).values({ registrationId: registration.id, kind: 'waiver', language: snapshot.language, snapshot, pdf, sha256: createHash('sha256').update(pdf).digest('hex') }).returning({ id: documents.id });
			return saved.id;
		});
		// Persistence already committed. Backup outages cannot undo a signature or force re-signing.
		try { await backupDocument(documentId); } catch { /* The durable document row remains queued. */ }
		return documentId;
	}
	async function submitLetter(userId: string, form: FormData) {
		const eventId = id(form.get('eventId'));
		const { student, event: currentEvent } = await context(userId, eventId);
		const choice = form.get('needsLetter');
		if (choice !== 'true' && choice !== 'false') throw new BootcampError('invalid');
		const [registration] = await db.select().from(registrations).where(and(eq(registrations.eventId, eventId), eq(registrations.studentId, student.id)));
		if (!registration?.waiver) throw new BootcampError('invalid');
		if (choice === 'true' && currentEvent.revision !== revisionField(form)) throw new BootcampError('stale');
		const snapshot: LetterSnapshot | null = choice === 'true' ? {
			event: eventView(currentEvent), student: registration.waiver.student, language: languageField(form), issuedAt: new Date().toISOString(), employer: employerFields(form)
		} : null;
		let pdf: Buffer | null = null;
		if (snapshot) { try { pdf = await renderLetterPdf(snapshot); } catch { throw new BootcampError('invalid'); } }
		const documentId = await db.transaction(async (tx) => {
			const [event] = await tx.select().from(events).where(eq(events.id, eventId)).for('update');
			openEvent(event, new Date());
			if (snapshot && event.revision !== snapshot.event.revision) throw new BootcampError('stale');
			const [currentStudent] = await tx.select().from(students).where(eq(students.id, student.id)).for('update');
			eligible(currentStudent, new Date(), true);
			const [current] = await tx.select().from(registrations).where(eq(registrations.id, registration.id)).for('update');
			if (current.letterChoice !== null) return null;
			await tx.update(registrations).set({ letterChoice: choice === 'true', updatedAt: new Date() }).where(eq(registrations.id, current.id));
			if (!snapshot || !pdf) return null;
			const [saved] = await tx.insert(documents).values({ registrationId: current.id, kind: 'letter', language: snapshot.language, snapshot, pdf, sha256: createHash('sha256').update(pdf).digest('hex') }).returning({ id: documents.id });
			return saved.id;
		});
		if (documentId) { try { await backupDocument(documentId); } catch { /* Retry from the persisted document. */ } }
		return documentId;
	}
	async function ownedRegistration(userId: string, eventId: string, requireActive = true) {
		const student = await linkedStudent(db, userId);
		if (!student) throw new BootcampError('notLinked');
		if (requireActive) eligible(student, new Date(), true);
		const [registration] = await db.select().from(registrations).where(and(eq(registrations.eventId, id(eventId)), eq(registrations.studentId, student.id)));
		if (!registration) throw new BootcampError('invalid');
		return registration;
	}
	return { start, preview, previewDocument, submitWaiver, submitLetter, ownedRegistration };
}

export async function documentForViewer(db: Database, documentId: string, viewer: { id: string; role: string }, now = new Date()) {
	id(documentId);
	// Access predicates execute in SQL; unauthorized requests never load another student's PDF bytes.
	const ownership = viewer.role === 'admin' ? sql`true` : and(
		sql`${registrations.studentId} IN (SELECT student_id FROM bootcamp_accounts WHERE user_id = ${viewer.id})`,
		sql`${events.endsAt} >= ${now.toISOString()}::timestamptz`
	);
	const [doc] = await db.select({ id: documents.id, pdf: documents.pdf, kind: documents.kind, sha256: documents.sha256, language: documents.language }).from(documents)
		.innerJoin(registrations, eq(registrations.id, documents.registrationId)).innerJoin(events, eq(events.id, registrations.eventId))
		.where(and(eq(documents.id, documentId), ownership));
	return doc ?? null;
}
