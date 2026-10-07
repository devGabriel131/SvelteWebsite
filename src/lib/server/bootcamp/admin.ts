import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../db/connection';
import { user } from '../db/auth-schema';
import { students } from '../db/schema';
import { bootcampAccounts as accounts, bootcampDocuments as documents, bootcampEvents as events, bootcampPayments as payments, bootcampRegistrations as registrations } from '../db/bootcamp-schema';
import { balance, csvCell, isAdult, registrationStatus } from '../../bootcamp/rules';
import type { AdminBootcampPage, ReportRow } from '../../bootcamp/types';
import { translations, type Language } from '../../i18n/translations';
import { eventView } from './registration';
import { BootcampError, eventFields, field, id, revisionField } from './validation';

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
	return roster.filter((student) => student.isActive || registered.some((r) => r.studentId === student.id)).map((student) => {
		const registration = registered.find((r) => r.studentId === student.id);
		const ownPayments = attempts.filter((p) => p.registrationId === registration?.id);
		const paidCents = ownPayments.filter((p) => p.status === 'completed').reduce((sum, p) => sum + p.amountCents, 0);
		return { studentId: student.id, name: registration?.waiver?.student.name ?? `${student.firstName} ${student.lastName}`, email: registration?.waiver?.student.email ?? student.email,
			eligibility: !student.isActive ? 'inactive' : !student.dateOfBirth ? 'unknown' : isAdult(student.dateOfBirth, asOf) ? 'eligible' : 'underage',
			status: registrationStatus(!!registration, !!registration?.waiver, registration?.letterChoice ?? null, paidCents),
			paidCents, remainingCents: balance(paidCents), paymentStatus: ownPayments[0]?.status, paymentUncertain: !!ownPayments[0]?.lastError,
			documents: docs.filter((d) => d.registrationId === registration?.id).map(({ id, kind, backupStatus }) => ({ id, kind, backupStatus })) };
	});
}

export async function adminPage(db: Database, eventId: string | null, paymentEnabled: boolean, driveEnabled: boolean): Promise<AdminBootcampPage> {
	const all = await db.select().from(events).orderBy(desc(events.startsAt));
	const selected = eventId ? all.find((e) => e.id === eventId) : all[0];
	return { events: all.map(eventView), selectedEventId: selected?.id ?? null, report: selected ? await eventReport(db, selected.id) : [], paymentEnabled, driveEnabled };
}

export async function saveEvent(db: Database, adminId: string, form: FormData) {
	const values = eventFields(form);
	const approvedBy = values.legalApproved ? adminId : null;
	const eventId = form.get('id');
	if (!eventId) {
		const [created] = await db.insert(events).values({ ...values, approvedBy, createdBy: adminId }).returning({ id: events.id });
		return created.id;
	}
	const [saved] = await db.update(events).set({ ...values, approvedBy, registrationOpen: false, revision: sql`${events.revision} + 1`, updatedAt: new Date() })
		.where(and(eq(events.id, id(eventId)), eq(events.revision, revisionField(form)))).returning({ id: events.id });
	if (!saved) throw new BootcampError('stale');
	return saved.id;
}
export async function toggleEvent(db: Database, form: FormData, ready: boolean) {
	const eventId = id(form.get('eventId'));
	const open = form.get('open');
	if (open !== 'true' && open !== 'false') throw new BootcampError('invalid');
	await db.transaction(async (tx) => {
		const [event] = await tx.select().from(events).where(eq(events.id, eventId)).for('update');
		if (!event || event.revision !== revisionField(form)) throw new BootcampError('stale');
		if (open === 'true' && (!ready || !event.legalApproved || event.registrationClosesAt <= new Date())) throw new BootcampError('unavailable');
		await tx.update(events).set({ registrationOpen: open === 'true', updatedAt: new Date() }).where(eq(events.id, eventId));
	});
}
export async function linkStudent(db: Database, adminId: string, form: FormData) {
	const studentEmail = field(form, 'studentEmail', 254).toLowerCase();
	const accountEmail = field(form, 'accountEmail', 254).toLowerCase();
	await db.transaction(async (tx) => {
		const [student] = await tx.select().from(students).where(sql`lower(btrim(${students.email})) = ${studentEmail}`).for('update');
		const [account] = await tx.select().from(user).where(and(sql`lower(btrim(${user.email})) = ${accountEmail}`, eq(user.role, 'student'))).for('update');
		if (!student || !account) throw new BootcampError('invalid');
		const [existing] = await tx.select().from(accounts).where(eq(accounts.userId, account.id));
		if (existing) { if (existing.studentId === student.id) return; throw new BootcampError('invalid'); }
		const [used] = await tx.select().from(accounts).where(eq(accounts.studentId, student.id));
		if (used) throw new BootcampError('invalid');
		await tx.insert(accounts).values({ userId: account.id, studentId: student.id, linkedBy: adminId });
	});
}

export function reportCsv(rows: ReportRow[], language: Language): string {
	const m = translations[language].bootcamp;
	const headers = [m.admin.name, m.admin.email, m.admin.eligibility, m.admin.status, m.admin.paymentStatus, m.payment.verificationAttention, m.payment.paid, m.payment.remaining, m.event.documentKinds.waiver, m.event.documentKinds.letter];
	const lines = rows.map((row) => [row.name, row.email, m.admin.eligibilities[row.eligibility], m.admin.statuses[row.status],
		row.paymentStatus ? m.payment.statuses[row.paymentStatus as keyof typeof m.payment.statuses] ?? row.paymentStatus : m.payment.statuses.not_started,
		row.paymentUncertain ? m.common.yes : m.common.no,
		(row.paidCents / 100).toFixed(2), (row.remainingCents / 100).toFixed(2),
		...(['waiver', 'letter'] as const).map((kind) => row.documents.some((d) => d.kind === kind) ? m.common.yes : m.common.no)]);
	return '\uFEFF' + [headers, ...lines].map((cells) => cells.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
