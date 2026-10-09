import { and, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import type { Database } from '../db/connection';
import { students } from '../db/schema';
import { bootcampDocuments as documents, bootcampEvents as events, bootcampPayments as payments, bootcampRegistrations as registrations } from '../db/bootcamp-schema';
import { balance, csvCell, isAdult, registrationStatus } from '../../bootcamp/rules';
import { creditedCents, paymentNeedsAttention } from '../../bootcamp/payment-rules';
import type { ReportRow } from '../../bootcamp/types';
import { translations, type Language } from '../../i18n/translations';
import { eventView } from './registration';
import { BootcampError, eventFields, id, revisionField, uuidPattern } from './validation';

export async function eventReport(db: Database, eventId: string, now = new Date()): Promise<ReportRow[]> {
	id(eventId);
	const [event] = await db.select().from(events).where(eq(events.id, eventId));
	if (!event) throw new BootcampError('invalid');
	const roster = await db.select().from(students).orderBy(students.lastName, students.firstName);
	const registered = await db.select().from(registrations).where(eq(registrations.eventId, eventId));
	const ids = registered.map((r) => r.id);
	const docs = ids.length ? await db.select({ id: documents.id, registrationId: documents.registrationId, kind: documents.kind, backupStatus: documents.backupStatus }).from(documents).where(inArray(documents.registrationId, ids)) : [];
	const attempts = ids.length ? await db.select({ registrationId: payments.registrationId, status: payments.status, amountCents: payments.amountCents, lastError: payments.lastError }).from(payments).where(inArray(payments.registrationId, ids)).orderBy(desc(payments.createdAt)) : [];
	const asOf = now < event.registrationClosesAt ? now : event.registrationClosesAt;
	return roster.filter((student) => student.status === 'active' || registered.some((r) => r.studentId === student.id)).map((student) => {
		const registration = registered.find((r) => r.studentId === student.id);
		const ownPayments = attempts.filter((p) => p.registrationId === registration?.id);
		const paidCents = creditedCents(ownPayments);
		return { studentId: student.id, classType: student.classType, name: registration?.waiver?.student.name ?? `${student.firstName} ${student.lastName}`, email: registration?.waiver?.student.email ?? student.email,
			eligibility: student.status !== 'active' ? 'inactive' : !student.dateOfBirth ? 'unknown' : isAdult(student.dateOfBirth, asOf) ? 'eligible' : 'underage',
			status: registrationStatus(!!registration, !!registration?.waiver, registration?.letterChoice ?? null, paidCents),
			paidCents, remainingCents: balance(paidCents), paymentStatus: ownPayments[0]?.status, paymentUncertain: ownPayments[0] ? paymentNeedsAttention(ownPayments[0]) : false,
			documents: docs.filter((d) => d.registrationId === registration?.id).map(({ id, kind, backupStatus }) => ({ id, kind, backupStatus })) };
	});
}

export async function listEvents(db: Database) {
	return (await db.select().from(events).orderBy(desc(events.startsAt))).map(eventView);
}

export async function getEvent(db: Database, eventId: unknown) {
	if (typeof eventId !== 'string' || !uuidPattern.test(eventId)) return null;
	const [event] = await db.select().from(events).where(eq(events.id, eventId));
	return event ? eventView(event) : null;
}

// Drizzle wraps driver errors; only this named constraint represents an active-event conflict.
function openingError(cause: unknown): never {
	let current = cause;
	while (current && typeof current === 'object') {
		const error = current as { code?: string; constraint_name?: string; cause?: unknown };
		if (error.code === '23505' && error.constraint_name === 'bootcamp_event_single_open') throw new BootcampError('activeEvent');
		current = error.cause;
	}
	throw cause;
}

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
async function closeExpiredOpenEvents(tx: Transaction) {
	await tx.update(events).set({ registrationOpen: false, updatedAt: new Date() })
		.where(and(eq(events.registrationOpen, true), lte(events.registrationClosesAt, sql`clock_timestamp()`)));
}

export async function activateEvent(db: Database, adminId: string, form: FormData, ready: boolean) {
	const values = eventFields(form);

	if (!ready || values.registrationClosesAt <= new Date()) throw new BootcampError('unavailable');
	try {
		return await db.transaction(async (tx) => {
			await closeExpiredOpenEvents(tx);
			const [created] = await tx.insert(events).values({ ...values, registrationOpen: true, createdBy: adminId }).returning({ id: events.id });
			return created.id;
		});
	} catch (cause) { openingError(cause); }
}

export async function updateEvent(db: Database, eventId: unknown, form: FormData) {
	const routeId = id(eventId);
	if (id(form.get('id')) !== routeId) throw new BootcampError('invalid');
	const values = eventFields(form);
	const [saved] = await db.update(events).set({
		...values,
		// Check both deadlines: moving an expired event forward must not implicitly reopen it.
		registrationOpen: sql`${events.registrationOpen} AND ${events.registrationClosesAt} > clock_timestamp() AND ${values.registrationClosesAt.toISOString()}::timestamptz > clock_timestamp()`,
		revision: sql`${events.revision} + 1`, updatedAt: new Date()
	})
		.where(and(eq(events.id, routeId), eq(events.revision, revisionField(form)))).returning({ id: events.id });
	if (!saved) throw new BootcampError('stale');
	return saved.id;
}
export async function toggleEvent(db: Database, form: FormData, ready: boolean) {
	const eventId = id(form.get('eventId'));
	const open = form.get('open');
	if (open !== 'true' && open !== 'false') throw new BootcampError('invalid');
	try {
		await db.transaction(async (tx) => {
			const [event] = await tx.select().from(events).where(eq(events.id, eventId)).for('update');
			if (!event || event.revision !== revisionField(form)) throw new BootcampError('stale');
			if (open === 'true' && (!ready || event.registrationClosesAt <= new Date())) throw new BootcampError('unavailable');
			if (open === 'true') await closeExpiredOpenEvents(tx);
			await tx.update(events).set({ registrationOpen: open === 'true', updatedAt: new Date() }).where(eq(events.id, eventId));
		});
	} catch (cause) { openingError(cause); }
}

export function reportCsv(rows: ReportRow[], language: Language): string {
	const m = translations[language].bootcamp;
	const headers = [m.admin.name, m.admin.email, m.admin.classType, m.admin.eligibility, m.admin.status, m.admin.paymentStatus, m.payment.verificationAttention, m.payment.paid, m.payment.remaining, m.event.documentKinds.waiver, m.event.documentKinds.letter];
	const lines = rows.map((row) => [row.name, row.email, m.admin.classTypes[row.classType], m.admin.eligibilities[row.eligibility], m.admin.statuses[row.status],
		row.paymentStatus ? m.payment.statuses[row.paymentStatus as keyof typeof m.payment.statuses] ?? row.paymentStatus : m.payment.statuses.not_started,
		row.paymentUncertain ? m.common.yes : m.common.no,
		(row.paidCents / 100).toFixed(2), (row.remainingCents / 100).toFixed(2),
		...(['waiver', 'letter'] as const).map((kind) => row.documents.some((d) => d.kind === kind) ? m.common.yes : m.common.no)]);
	return '\uFEFF' + [headers, ...lines].map((cells) => cells.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
