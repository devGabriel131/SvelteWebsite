import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { formatMessage, translations, type Language } from '../i18n/translations';
import { INVITATIONS_PAGE_SIZE, MAX_IMPORT_ROWS, type EnrollmentData, type EnrollmentProfile, type StudentInvitation } from '../student-invitations';
import { isValidPin } from './auth/pin';
import { account, user } from './db/auth-schema';
import type { Database } from './db/connection';
import { studentInvitations, students } from './db/schema';
import { parseMailbox, type Email } from './gmail/message';
import type { ImportedStudent } from './student-import-file';
import type { StudentImportOptions } from './student-import-review';

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const controls = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;

export class StudentInvitationError extends Error {
	constructor(public code: 'invalid' | 'conflict' | 'invitation' | 'unavailable') { super(code); }
}

export type InvitationDelivery = {
	baseURL: string;
	testMode: boolean;
	send(email: Email, signal?: AbortSignal): Promise<string>;
};
export type PreparedInvitation = { studentId: string; token: string; tokenHash: string };
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export function isInvitationToken(token: unknown): token is string {
	return typeof token === 'string' && /^[0-9a-f]{64}$/.test(token);
}
export function hashInvitationToken(token: string) {
	return createHash('sha256').update(token).digest('hex');
}
function newInvitationToken() {
	const token = randomBytes(32).toString('hex');
	return { token, tokenHash: hashInvitationToken(token) };
}

export function studentInvitationEmail(language: Language, name: string, email: string, token: string, baseURL: string): Email {
	const origin = new URL(baseURL);
	if (origin.origin !== baseURL || (origin.protocol !== 'https:' &&
		!(origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)))) {
		throw new StudentInvitationError('unavailable');
	}
	if (!isInvitationToken(token)) throw new StudentInvitationError('invalid');
	const url = new URL('/enroll', origin);
	url.searchParams.set('token', token);
	const messages = translations[language].admin.studentImport.email;
	return { to: [email], subject: messages.subject, body: formatMessage(messages.body, { name, url: url.href }) };
}

async function requireStoredAdmin(tx: Transaction, adminId: string) {
	const [admin] = await tx.select({ role: user.role }).from(user).where(eq(user.id, adminId)).for('share');
	if (admin?.role !== 'admin') throw new StudentInvitationError('invalid');
}

export async function findStudentImportConflicts(db: Database | Transaction, rows: ImportedStudent[]) {
	if (!rows.length) return [];
	const emails = rows.map((row) => row.email);
	const [profiles, identities] = await Promise.all([
		db.select({ email: students.email }).from(students).where(inArray(sql<string>`lower(btrim(${students.email}))`, emails)),
		db.select({ email: user.email }).from(user).where(inArray(sql<string>`lower(btrim(${user.email}))`, emails))
	]);
	const existing = new Set([...profiles, ...identities].map((row) => row.email.trim().toLowerCase()));
	return rows.filter((row) => existing.has(row.email)).map((row) => ({ row: row.row, code: 'exists' as const }));
}

function validateImportedRows(rows: ImportedStudent[], options: StudentImportOptions) {
	if (!rows.length || rows.length > MAX_IMPORT_ROWS || !['basic', 'regular'].includes(options.classType) ||
		!['en', 'es'].includes(options.emailLanguage)) throw new StudentInvitationError('invalid');
	const emails = new Set<string>();
	for (const row of rows) {
		if (!isValidStudentName(row.firstName) || !isValidStudentName(row.lastName) || !isValidPin(row.pin)) throw new StudentInvitationError('invalid');
		try {
			const mailbox = parseMailbox(row.email);
			if (mailbox.name || mailbox.address !== row.email || row.email !== row.email.trim().toLowerCase() || emails.has(row.email)) throw new Error();
		} catch { throw new StudentInvitationError('invalid'); }
		emails.add(row.email);
	}
}

export async function provisionImportedStudents(
	db: Database, adminId: string, rows: ImportedStudent[], options: StudentImportOptions,
	hashPin: (pin: string) => Promise<string>, testMode: boolean
): Promise<PreparedInvitation[]> {
	validateImportedRows(rows, options);
	// Hash before taking database locks, sequentially to bound scrypt memory for large batches.
	const prepared: (PreparedInvitation & { row: ImportedStudent; userId: string; password: string })[] = [];
	for (const row of rows) {
		prepared.push({ row, studentId: randomUUID(), userId: randomUUID(), password: await hashPin(row.pin), ...newInvitationToken() });
	}
	return db.transaction(async (tx) => {
		await requireStoredAdmin(tx, adminId);
		if ((await findStudentImportConflicts(tx, rows)).length) throw new StudentInvitationError('conflict');
		const now = new Date();
		await tx.insert(user).values(prepared.map(({ row, userId }) => ({ id: userId, name: `${row.firstName} ${row.lastName}`, email: row.email, role: 'student' as const, emailVerified: false })));
		await tx.insert(account).values(prepared.map(({ userId, password }) => ({ id: randomUUID(), userId, accountId: userId, providerId: 'credential', password, updatedAt: now })));
		await tx.insert(students).values(prepared.map(({ row, studentId, userId }) => ({ id: studentId, authUserId: userId, firstName: row.firstName, lastName: row.lastName, email: row.email, classType: options.classType, status: 'invited' as const })));
		await tx.insert(studentInvitations).values(prepared.map(({ row, studentId, tokenHash }) => ({ studentId, tokenHash, recipientEmail: row.email, language: options.emailLanguage, expiresAt: new Date(now.getTime() + INVITATION_TTL_MS), createdBy: adminId, testMode })));
		return prepared.map(({ studentId, token, tokenHash }) => ({ studentId, token, tokenHash }));
	});
}

async function lockInvitedStudent(tx: Transaction, studentId: string) {
	// All invitation mutations lock profile, then invitation, then identity in this order.
	const [student] = await tx.select().from(students).where(eq(students.id, studentId)).for('update');
	const [invitation] = await tx.select().from(studentInvitations).where(eq(studentInvitations.studentId, studentId)).for('update');
	if (!student || !invitation || !student.authUserId) throw new StudentInvitationError('invitation');
	const [identity] = await tx.select().from(user).where(eq(user.id, student.authUserId)).for('update');
	if (student.status !== 'invited' || invitation.acceptedAt || identity?.role !== 'student' ||
		student.email.trim().toLowerCase() !== invitation.recipientEmail || identity.email.trim().toLowerCase() !== invitation.recipientEmail) {
		throw new StudentInvitationError('invitation');
	}
	return { student, invitation, identity };
}

export async function sendPreparedStudentInvitation(db: Database, prepared: PreparedInvitation, delivery: InvitationDelivery, signal?: AbortSignal): Promise<boolean> {
	const pending = and(eq(studentInvitations.studentId, prepared.studentId), eq(studentInvitations.tokenHash, prepared.tokenHash));
	let email: Email;
	let claimed = false;
	try {
		if (!isInvitationToken(prepared.token) || hashInvitationToken(prepared.token) !== prepared.tokenHash) return false;
		email = await db.transaction(async (tx) => {
			const { student, invitation } = await lockInvitedStudent(tx, prepared.studentId);
			if (invitation.tokenHash !== prepared.tokenHash || invitation.deliveryState !== 'pending' || invitation.expiresAt <= new Date()) throw new StudentInvitationError('invitation');
			const message = studentInvitationEmail(invitation.language, `${student.firstName} ${student.lastName}`, invitation.recipientEmail, prepared.token, delivery.baseURL);
			await tx.update(studentInvitations).set({ deliveryState: 'sending', lastAttemptAt: new Date(), testMode: delivery.testMode }).where(pending);
			return message;
		});
		claimed = true;
		await delivery.send(email, signal);
		const [saved] = await db.update(studentInvitations).set({ deliveryState: 'sent', sentAt: new Date() })
			.where(and(pending, eq(studentInvitations.deliveryState, 'sending'))).returning({ id: studentInvitations.studentId });
		return !!saved;
	} catch {
		// Network errors can follow an accepted send. Never replay automatically; an admin may rotate and resend explicitly.
		if (!claimed) return false;
		try {
			await db.update(studentInvitations).set({ deliveryState: 'failed' })
				.where(and(pending, eq(studentInvitations.deliveryState, 'sending')));
		} catch { /* An interrupted send remains visible as 'sending' for manual recovery. */ }
		return false;
	}
}

export async function sendImportedStudentInvitations(db: Database, invitations: PreparedInvitation[], delivery: InvitationDelivery) {
	let sent = 0;
	const signal = AbortSignal.timeout(60_000);
	for (let index = 0; index < invitations.length; index += 4) {
		const results = await Promise.all(invitations.slice(index, index + 4).map((invitation) => sendPreparedStudentInvitation(db, invitation, delivery, signal)));
		sent += results.filter(Boolean).length;
	}
	return { sent, failed: invitations.length - sent };
}

export async function resendStudentInvitation(db: Database, adminId: string, studentId: string, delivery: InvitationDelivery) {
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(studentId)) throw new StudentInvitationError('invalid');
	const prepared = await db.transaction(async (tx) => {
		await requireStoredAdmin(tx, adminId);
		const { invitation } = await lockInvitedStudent(tx, studentId);
		const now = new Date();
		if (invitation.lastAttemptAt && now.getTime() - invitation.lastAttemptAt.getTime() < RESEND_COOLDOWN_MS) throw new StudentInvitationError('invalid');
		const next = { studentId, ...newInvitationToken() };
		await tx.update(studentInvitations).set({ tokenHash: next.tokenHash, expiresAt: new Date(now.getTime() + INVITATION_TTL_MS), deliveryState: 'pending', sentAt: null, lastAttemptAt: now, testMode: delivery.testMode })
			.where(eq(studentInvitations.studentId, studentId));
		return next;
	});
	return sendPreparedStudentInvitation(db, prepared, delivery, AbortSignal.timeout(30_000));
}

export function parseInvitationPage(value: string | null): number {
	const page = Number(value);
	return Number.isSafeInteger(page) && page >= 1 && page <= 1_000_000 ? page : 1;
}

export async function readAdminStudentInvitations(db: Database, page = 1): Promise<StudentInvitation[]> {
	const rows = await db.select({ studentId: students.id, firstName: students.firstName, lastName: students.lastName, email: studentInvitations.recipientEmail,
		status: students.status, language: studentInvitations.language, expiresAt: studentInvitations.expiresAt, acceptedAt: studentInvitations.acceptedAt,
		sentAt: studentInvitations.sentAt, deliveryState: studentInvitations.deliveryState, testMode: studentInvitations.testMode })
		.from(studentInvitations).innerJoin(students, eq(students.id, studentInvitations.studentId))
		.orderBy(desc(studentInvitations.createdAt), desc(students.id))
		.limit(INVITATIONS_PAGE_SIZE + 1).offset((parseInvitationPage(String(page)) - 1) * INVITATIONS_PAGE_SIZE);
	return rows.map((row) => ({ ...row, expiresAt: row.expiresAt.toISOString(), acceptedAt: row.acceptedAt?.toISOString() ?? null, sentAt: row.sentAt?.toISOString() ?? null }));
}

export function isValidStudentName(value: string) {
	return value.length > 0 && value.length <= 100 && value === value.trim() && !controls.test(value);
}
export function parseEnrollmentProfile(form: FormData, today = new Date().toISOString().slice(0, 10)): EnrollmentProfile {
	const text = (key: string) => { const value = form.get(key); return typeof value === 'string' ? value.trim() : ''; };
	const firstName = text('firstName'), lastName = text('lastName'), dateOfBirth = text('dateOfBirth'), gender = text('gender');
	if (!isValidStudentName(firstName) || !isValidStudentName(lastName) || !['male', 'female'].includes(gender) ||
		!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || dateOfBirth < '0001-01-01' || dateOfBirth > today || !Number.isFinite(Date.parse(dateOfBirth)) ||
		new Date(dateOfBirth).toISOString().slice(0, 10) !== dateOfBirth) throw new StudentInvitationError('invalid');
	return { firstName, lastName, dateOfBirth, gender: gender as EnrollmentProfile['gender'] };
}

export async function readStudentEnrollment(db: Database, userId: string, token: string, now = new Date()): Promise<Pick<EnrollmentData, 'state' | 'student'>> {
	if (!isInvitationToken(token)) return { state: 'invalid', student: null };
	const [row] = await db.select({ student: students, invitation: studentInvitations, identity: { email: user.email, role: user.role } })
		.from(studentInvitations).innerJoin(students, eq(students.id, studentInvitations.studentId))
		.innerJoin(user, eq(user.id, students.authUserId))
		.where(and(eq(studentInvitations.tokenHash, hashInvitationToken(token)), eq(user.id, userId)));
	if (!row || row.identity.role !== 'student' || row.student.email.trim().toLowerCase() !== row.invitation.recipientEmail ||
		row.identity.email.trim().toLowerCase() !== row.invitation.recipientEmail) return { state: 'invalid', student: null };
	if (row.invitation.acceptedAt && row.student.status === 'active') return { state: 'complete', student: null };
	if (row.invitation.acceptedAt || row.invitation.expiresAt <= now || row.student.status !== 'invited') return { state: 'invalid', student: null };
	const { firstName, lastName, email, classType, dateOfBirth, gender } = row.student;
	return { state: 'ready', student: { firstName, lastName, email, classType, dateOfBirth, gender } };
}

export async function completeStudentEnrollment(db: Database, userId: string, token: string, profile: EnrollmentProfile) {
	if (!isInvitationToken(token)) throw new StudentInvitationError('invitation');
	const form = new FormData();
	for (const [field, value] of Object.entries(profile)) form.set(field, value);
	const values = parseEnrollmentProfile(form);
	return db.transaction(async (tx) => {
		const tokenHash = hashInvitationToken(token);
		const [found] = await tx.select({ studentId: studentInvitations.studentId }).from(studentInvitations).where(eq(studentInvitations.tokenHash, tokenHash));
		if (!found) throw new StudentInvitationError('invitation');
		const { student, invitation, identity } = await lockInvitedStudent(tx, found.studentId);
		const now = new Date();
		if (identity.id !== userId || invitation.tokenHash !== tokenHash || invitation.expiresAt <= now) throw new StudentInvitationError('invitation');
		await tx.update(students).set({ ...values, status: 'active' }).where(eq(students.id, student.id));
		await tx.update(user).set({ name: `${values.firstName} ${values.lastName}`, emailVerified: true }).where(eq(user.id, userId));
		await tx.update(studentInvitations).set({ acceptedAt: now }).where(eq(studentInvitations.studentId, student.id));
	});
}
