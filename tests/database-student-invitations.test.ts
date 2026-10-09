import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Buffer } from 'node:buffer';
import { randomBytes, randomUUID } from 'node:crypto';
import { getIP } from 'better-auth/api';
import { desc, eq, inArray, or } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import { openLocalDatabase } from '../scripts/db/local-target';
import { migrateDatabase } from '../scripts/db/migrate';
import { INVITATIONS_PAGE_SIZE, type EnrollmentProfile, type StudentImportOptions } from '../src/lib/student-invitations';
import { updateAdminStudent } from '../src/lib/server/admin-student';
import { AUTH_IP_HEADER, createAuth, type Auth } from '../src/lib/server/auth/core';
import { account, rateLimit, session, user } from '../src/lib/server/db/auth-schema';
import type { DatabaseConnection } from '../src/lib/server/db/connection';
import { studentAccounts, studentInvitations, students, studentSubjectScores } from '../src/lib/server/db/schema';
import type { Email } from '../src/lib/server/gmail/message';
import { completeEnrollmentAction, loadStudentEnrollment } from '../src/lib/server/student-enrollment';
import { resendInvitationAction, studentImportAction, type StudentImportDependencies } from '../src/lib/server/student-import';
import type { ImportedStudent } from '../src/lib/server/student-import-file';
import { verifyStudentImportReview } from '../src/lib/server/student-import-review';
import {
	completeStudentEnrollment, findStudentImportConflicts, hashInvitationToken, INVITATION_TTL_MS,
	isInvitationToken, provisionImportedStudents, readAdminStudentInvitations, readStudentEnrollment,
	resendStudentInvitation, sendImportedStudentInvitations, sendPreparedStudentInvitation,
	StudentInvitationError, type InvitationDelivery, type PreparedInvitation
} from '../src/lib/server/student-invitations';

const databaseUrl = process.env.TEST_DATABASE_URL;
const config = { secret: randomBytes(32).toString('hex'), baseURL: 'https://students.example.test', trustedOrigins: ['https://students.example.test'] };
const options: StudentImportOptions = { classType: 'regular', emailLanguage: 'es' };
const profile: EnrollmentProfile = { firstName: 'María José', lastName: 'Rivera O’Neill', dateOfBirth: '2000-02-29', gender: 'female' };
type AuthLocals = Pick<App.Locals, 'user' | 'session'>;

function locals(id: string, role: 'student' | 'admin' = 'student'): AuthLocals {
	return { user: { id, role }, session: { userId: id } } as AuthLocals;
}

function form(values: Record<string, string | File>) {
	const result = new FormData();
	for (const [key, value] of Object.entries(values)) result.set(key, value);
	return result;
}

function request(data: FormData, path = '/admin') {
	return new Request(`${config.baseURL}${path}`, { method: 'POST', headers: { origin: config.baseURL }, body: data });
}

async function workbook(rows: ImportedStudent[]) {
	const book = new ExcelJS.Workbook();
	const sheet = book.addWorksheet('Students');
	sheet.addRow(['firstName', 'lastName', 'email', 'pin']);
	for (const row of rows) sheet.addRow([row.firstName, row.lastName, row.email, row.pin]);
	return new File([Uint8Array.from(Buffer.from(await book.xlsx.writeBuffer()))], 'students.xlsx');
}

function trackedDelivery(send?: (email: Email) => Promise<string>, testMode = true) {
	const mail: { email: Email; signal?: AbortSignal }[] = [];
	const delivery: InvitationDelivery = {
		baseURL: config.baseURL, testMode,
		async send(email, signal) { mail.push({ email, signal }); return send ? send(email) : randomUUID(); }
	};
	return { delivery, mail };
}

function emailToken(email: Email) {
	if (typeof email.body !== 'string') throw new Error('Expected a plain-text invitation body');
	const urls = email.body.match(/https:\/\/\S+/g);
	expect(urls).toHaveLength(1);
	const url = new URL(urls![0]);
	expect(url.origin).toBe(config.baseURL);
	expect(url.pathname).toBe('/enroll');
	const token = url.searchParams.get('token');
	expect(isInvitationToken(token)).toBe(true);
	return token!;
}

(databaseUrl ? describe : describe.skip)('durable student invitations with isolated local PostgreSQL fixtures', () => {
	let connection: DatabaseConnection;
	let auth: Auth;
	let context: Awaited<Auth['$context']>;
	const adminId = randomUUID();
	const emails = new Set<string>();
	const studentIds = new Set<string>();
	const identityIds = new Set<string>();
	const rateKeys = new Set<string>();

	beforeAll(async () => {
		if (!await Bun.file(new URL('../drizzle/0010_student_invitations.sql', import.meta.url)).exists()) {
			throw new Error('Student invitation migration 0010 must exist before running database tests.');
		}
		connection = await openLocalDatabase(databaseUrl, 'test');
		await migrateDatabase(connection.db);
		auth = createAuth(connection.db, config);
		context = await auth.$context;
		await connection.db.insert(user).values({ id: adminId, name: 'Student invitation fixture admin', email: `${adminId}@example.test`, role: 'admin' });
	}, 30000);

	afterAll(async () => {
		if (!connection) return;
		try {
			// Unlink fixture accounts before deleting their restrictive student/user targets.
			// Invitations still cascade from students and restrict creator deletion.
			if (emails.size || studentIds.size) {
				const profiles = connection.db.select({ id: students.id }).from(students)
					.where(or(inArray(students.email, [...emails]), inArray(students.id, [...studentIds])));
				await connection.db.delete(studentAccounts).where(inArray(studentAccounts.studentId, profiles));
				await connection.db.delete(students).where(or(inArray(students.email, [...emails]), inArray(students.id, [...studentIds])));
			}
			if (emails.size || identityIds.size) await connection.db.delete(user).where(or(inArray(user.email, [...emails]), inArray(user.id, [...identityIds])));
			await connection.db.delete(user).where(eq(user.id, adminId));
			if (rateKeys.size) await connection.db.delete(rateLimit).where(inArray(rateLimit.key, [...rateKeys]));
		} finally {
			await connection.client.end();
		}
	});

	function fixtureEmail() {
		const email = `student-invitation-${randomUUID()}@example.test`;
		emails.add(email);
		return email;
	}

	function fixtureRow(pin = '0042', row = 2): ImportedStudent {
		return { row, firstName: 'Imported', lastName: 'Student', email: fixtureEmail(), pin };
	}

	async function provision(rows = [fixtureRow()], importOptions = options) {
		const invitations = await provisionImportedStudents(connection.db, adminId, rows, importOptions, context.password.hash, true);
		for (const invitation of invitations) studentIds.add(invitation.studentId);
		return invitations;
	}

	async function stored(prepared: Pick<PreparedInvitation, 'studentId'>) {
		studentIds.add(prepared.studentId);
		const [student] = await connection.db.select().from(students).where(eq(students.id, prepared.studentId));
		expect(student).toBeDefined();
		const [association] = await connection.db.select().from(studentAccounts).where(eq(studentAccounts.studentId, student.id));
		expect(association).toBeDefined();
		identityIds.add(association.userId);
		const [[invitation], [identity], credentials] = await Promise.all([
			connection.db.select().from(studentInvitations).where(eq(studentInvitations.studentId, student.id)),
			connection.db.select().from(user).where(eq(user.id, association.userId)),
			connection.db.select().from(account).where(eq(account.userId, association.userId))
		]);
		return { student, association, invitation, identity, credentials };
	}

	async function counts(rows: ImportedStudent[]) {
		const addresses = rows.map((row) => row.email);
		const [identities, credentials, profiles, invitations] = await Promise.all([
			connection.db.select({ id: user.id }).from(user).where(inArray(user.email, addresses)),
			connection.db.select({ id: account.id }).from(account).innerJoin(user, eq(account.userId, user.id)).where(inArray(user.email, addresses)),
			connection.db.select({ id: students.id }).from(students).where(inArray(students.email, addresses)),
			connection.db.select({ id: studentInvitations.studentId }).from(studentInvitations).innerJoin(students, eq(studentInvitations.studentId, students.id)).where(inArray(students.email, addresses))
		]);
		return { users: identities.length, credentials: credentials.length, students: profiles.length, invitations: invitations.length };
	}

	async function assertNoWrites(rows: ImportedStudent[]) {
		expect(await counts(rows)).toEqual({ users: 0, credentials: 0, students: 0, invitations: 0 });
	}

	async function databaseFailure(query: PromiseLike<unknown>) {
		let caught: unknown;
		try { await query; } catch (cause) { caught = cause; }
		expect(caught).toBeDefined();
		return (caught as { cause?: unknown })?.cause ?? caught;
	}

	function actionDependencies(delivery: InvitationDelivery): StudentImportDependencies {
		return {
			database: () => connection.db,
			async authentication() { return { secret: config.secret, hashPin: context.password.hash }; },
			delivery: () => delivery
		};
	}

	test('signed preview creates nothing; import atomically creates linked credentials/profiles/invitations and sends one PIN-free email each', async () => {
		const rows = [fixtureRow('0042', 2), fixtureRow('0007', 3)];
		const file = await workbook(rows);
		const { delivery, mail } = trackedDelivery(async (email) => {
			if (email.to![0] === rows[1].email) throw new Error(`Uncertain Gmail response for ${emailToken(email)} with PIN 0007`);
			return 'accepted-gmail-id';
		}, false);
		const dependencies = actionDependencies(delivery);
		let hashes = 0;
		dependencies.authentication = async () => ({ secret: config.secret, hashPin: async (pin) => { hashes++; return context.password.hash(pin); } });
		const preview = await studentImportAction(locals(adminId, 'admin'), request(form({ file, ...options })), 'preview', dependencies);
		if ('status' in preview) throw new Error('Expected successful preview');
		expect(preview.studentImport).toMatchObject({ phase: 'preview', success: true, testMode: false });
		expect(preview.studentImport.rows).toEqual(rows.map(({ pin: _pin, ...row }) => row));
		expect(verifyStudentImportReview(config.secret, preview.studentImport.reviewToken, { ...options, adminId, file: new Uint8Array(await file.arrayBuffer()) })).toBe(true);
		await assertNoWrites(rows);
		expect(hashes).toBe(0);
		expect(mail).toHaveLength(0);
		const before = Date.now();
		const result = await studentImportAction(locals(adminId, 'admin'), request(form({ file, ...options, reviewToken: preview.studentImport.reviewToken!,
			email: 'forged@example.test', authUserId: 'forged-user', status: 'active', role: 'admin' })), 'import', dependencies);
		expect(result).toEqual({ studentImport: { phase: 'import', success: true, created: 2, sent: 1, failed: 1, testMode: false } });
		expect(await counts(rows)).toEqual({ users: 2, credentials: 2, students: 2, invitations: 2 });
		expect(hashes).toBe(2);
		expect(mail).toHaveLength(2);
		expect(mail.map(({ email }) => email.to![0]).sort()).toEqual(rows.map((row) => row.email).sort());
		for (const row of rows) {
			const sent = mail.find(({ email }) => email.to![0] === row.email)!;
			expect(sent.email.to).toEqual([row.email]);
			expect(sent.email.body).not.toMatch(/\b(?:0042|0007)\b/);
			expect(sent.email).not.toHaveProperty('attachments');
			expect(sent.signal).toBeInstanceOf(AbortSignal);
			const token = emailToken(sent.email);
			const [student] = await connection.db.select().from(students).where(eq(students.email, row.email));
			const state = await stored({ studentId: student.id });
			expect(state.student).toMatchObject({ email: row.email, classType: 'regular', status: 'invited', dateOfBirth: null, gender: null });
			expect(state.association).toMatchObject({ studentId: student.id, linkedBy: adminId, createdAt: expect.any(Date) });
			expect(state.identity).toMatchObject({ id: state.association.userId, email: row.email, role: 'student', emailVerified: false });
			expect(state.credentials).toHaveLength(1);
			expect(state.credentials[0]).toMatchObject({ userId: state.identity.id, accountId: state.identity.id, providerId: 'credential' });
			expect(await context.password.verify({ hash: state.credentials[0].password!, password: row.pin })).toBe(true);
			expect(state.credentials[0].password).not.toBe(row.pin);
			expect(state.invitation).toMatchObject({ tokenHash: hashInvitationToken(token), recipientEmail: row.email, language: 'es', createdBy: adminId, acceptedAt: null, testMode: false,
				deliveryState: row.row === 2 ? 'sent' : 'failed' });
			expect(state.invitation).not.toHaveProperty('token');
			expect(state.invitation.expiresAt.getTime()).toBeGreaterThanOrEqual(before + INVITATION_TTL_MS);
			expect(state.invitation.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + INVITATION_TTL_MS);
			expect(state.invitation.lastAttemptAt).toBeInstanceOf(Date);
			expect(state.invitation.sentAt).toEqual(row.row === 2 ? expect.any(Date) : null);
			expect(await readStudentEnrollment(connection.db, state.identity.id, token)).toEqual({ state: 'ready', student: {
				firstName: row.firstName, lastName: row.lastName, email: row.email, classType: 'regular', dateOfBirth: null, gender: null
			} });
			const adminView = (await readAdminStudentInvitations(connection.db)).find((invitation) => invitation.studentId === student.id)!;
			expect(adminView.expiresAt).toBe(state.invitation.expiresAt.toISOString());
			for (const publicData of [preview, result, adminView]) {
				expect(JSON.stringify(publicData)).not.toContain(token);
				expect(JSON.stringify(publicData)).not.toContain(`"${row.pin}"`);
				for (const field of ['pin', 'password', 'token', 'tokenHash']) expect(adminView).not.toHaveProperty(field);
			}
		}
		const replay = await studentImportAction(locals(adminId, 'admin'), request(form({ file, ...options, reviewToken: preview.studentImport.reviewToken! })), 'import', dependencies);
		expect(replay).toMatchObject({ status: 400, data: { studentImport: { success: false, error: 'invalid', issues: [{ row: 2, code: 'exists' }, { row: 3, code: 'exists' }] } } });
		expect(hashes).toBe(2);
		expect(mail).toHaveLength(2);
		expect(await counts(rows)).toEqual({ users: 2, credentials: 2, students: 2, invitations: 2 });
	});

	test('imported 0042 credentials work through native Better Auth signInEmail, preserve leading zeros, and cannot enable signup', async () => {
		const row = fixtureRow();
		const [prepared] = await provision([row]);
		const state = await stored(prepared);
		expect(await context.password.verify({ hash: state.credentials[0].password!, password: '42' })).toBe(false);
		const subnet = randomBytes(7).toString('hex');
		const headers = new Headers({ origin: config.baseURL, [AUTH_IP_HEADER]: `fd${subnet.slice(0, 2)}:${subnet.slice(2, 6)}:${subnet.slice(6, 10)}:${subnet.slice(10, 14)}::1` });
		const ip = getIP(headers, auth.options);
		for (const path of ['/sign-in/email', '/sign-up/email']) rateKeys.add(`${ip}|${path}`);
		for (const password of ['42', '0043']) {
			await expect(auth.api.signInEmail({ headers, body: { email: row.email, password } })).rejects.toMatchObject({ status: 'UNAUTHORIZED' });
		}
		expect(await connection.db.select().from(session).where(eq(session.userId, state.identity.id))).toHaveLength(0);
		const signedIn = await auth.api.signInEmail({ headers, body: { email: row.email, password: '0042' } });
		expect(signedIn.user).toMatchObject({ id: state.identity.id, email: row.email, role: 'student' });
		const sessions = await connection.db.select().from(session).where(eq(session.userId, state.identity.id));
		expect(sessions).toHaveLength(1);
		expect(sessions[0].token).toBe(signedIn.token);
		expect(sessions[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
		expect(auth.options.emailAndPassword?.disableSignUp).toBe(true);
		const email = fixtureEmail();
		await expect(auth.api.signUpEmail({ headers, body: { name: 'Forbidden signup', email, password: '0042' } })).rejects.toMatchObject({ status: 'NOT_FOUND' });
		const response = await auth.handler(new Request(`${config.baseURL}/api/auth/sign-up/email`, { method: 'POST', headers: { ...Object.fromEntries(headers), 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Forbidden signup', email, password: '0042' }) }));
		expect(response.status).toBe(404);
		await assertNoWrites([{ ...row, email }]);
	});

	test('email conflicts include normalized legacy profiles and auth-only identities without overwriting either', async () => {
		const profileRow = fixtureRow(), identityRow = fixtureRow();
		const legacyId = randomUUID(), identityId = randomUUID();
		studentIds.add(legacyId); identityIds.add(identityId);
		await connection.db.insert(students).values({ id: legacyId, firstName: 'Legacy', lastName: 'Profile', email: profileRow.email.toUpperCase(), classType: 'basic' });
		await connection.db.insert(user).values({ id: identityId, name: 'Auth-only identity', email: ` ${identityRow.email.toUpperCase()} `, role: 'student' });
		const rows = [{ ...profileRow, row: 2 }, { ...identityRow, row: 3 }];
		expect(await findStudentImportConflicts(connection.db, rows)).toEqual([{ row: 2, code: 'exists' }, { row: 3, code: 'exists' }]);
		await expect(provision(rows)).rejects.toMatchObject({ code: 'conflict' });
		expect((await connection.db.select().from(students).where(eq(students.id, legacyId)))[0]).toMatchObject({ firstName: 'Legacy', classType: 'basic' });
		expect(await connection.db.select().from(studentAccounts).where(eq(studentAccounts.studentId, legacyId))).toHaveLength(0);
		expect(await connection.db.select().from(account).where(eq(account.userId, identityId))).toHaveLength(0);
	});

	test('hash failures and absent/non-admin creators produce no account, profile, or invitation writes', async () => {
		const rows = [fixtureRow(), fixtureRow('0007', 3)];
		let hashes = 0;
		await expect(provisionImportedStudents(connection.db, adminId, rows, options, async (pin) => {
			if (++hashes === 2) throw new Error('Second PIN hash failed');
			return context.password.hash(pin);
		}, true)).rejects.toThrow('Second PIN hash failed');
		expect(hashes).toBe(2);
		await assertNoWrites(rows);
		await expect(provisionImportedStudents(connection.db, randomUUID(), rows, options, context.password.hash, true)).rejects.toMatchObject({ code: 'invalid' });
		await assertNoWrites(rows);
		const creatorId = randomUUID(); identityIds.add(creatorId);
		await connection.db.insert(user).values({ id: creatorId, name: 'Not an admin', email: fixtureEmail(), role: 'student' });
		await expect(provisionImportedStudents(connection.db, creatorId, rows, options, context.password.hash, true)).rejects.toMatchObject({ code: 'invalid' });
		await assertNoWrites(rows);
	});

	test('a failure at the final invitation insert rolls back users, credential accounts, and students together', async () => {
		const rows = [fixtureRow(), fixtureRow('0007', 3)];
		// Inject a final-table NOT NULL violation through a runtime argument, without changing database DDL.
		await expect(provisionImportedStudents(connection.db, adminId, rows, options, context.password.hash, null as unknown as boolean)).rejects.toMatchObject({ cause: { code: '23502' } });
		await assertNoWrites(rows);
	});

	test('simultaneous overlapping imports create exactly one batch and leave no accounts from the losing batch', async () => {
		const shared = fixtureRow(), firstOnly = fixtureRow('0007', 3), secondOnly = fixtureRow('0099', 3);
		const results = await Promise.allSettled([provision([shared, firstOnly]), provision([shared, secondOnly])]);
		expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
		expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
		const winner = results[0].status === 'fulfilled' ? firstOnly : secondOnly;
		const loser = winner === firstOnly ? secondOnly : firstOnly;
		expect(await counts([shared, winner])).toEqual({ users: 2, credentials: 2, students: 2, invitations: 2 });
		await assertNoWrites([loser]);
		const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
		const cause = rejected.reason;
		expect(cause instanceof StudentInvitationError ? cause.code === 'conflict' : (cause.cause?.code ?? cause.code) === '23505').toBe(true);
		await expect(provision([shared])).rejects.toMatchObject({ code: 'conflict' });
		expect(await counts([shared])).toEqual({ users: 1, credentials: 1, students: 1, invitations: 1 });
	});

	test('delivery claims pending once, exposes durable sending state, and marks sent only after API acceptance', async () => {
		const [prepared] = await provision();
		expect((await stored(prepared)).invitation).toMatchObject({ deliveryState: 'pending', lastAttemptAt: null, sentAt: null });
		const started = Promise.withResolvers<void>(), accepted = Promise.withResolvers<void>();
		const { delivery, mail } = trackedDelivery(async () => { started.resolve(); await accepted.promise; return 'accepted-gmail-id'; });
		const first = sendPreparedStudentInvitation(connection.db, prepared, delivery);
		let inFlightState: string | undefined;
		try {
			await started.promise;
			expect((await stored(prepared)).invitation).toMatchObject({ deliveryState: 'sending', sentAt: null, lastAttemptAt: expect.any(Date) });
			expect(await sendPreparedStudentInvitation(connection.db, prepared, delivery)).toBe(false);
			inFlightState = (await stored(prepared)).invitation.deliveryState;
			expect(mail).toHaveLength(1);
		} finally { accepted.resolve(); }
		const delivered = await first;
		expect(inFlightState).toBe('sending');
		expect(delivered).toBe(true);
		expect((await stored(prepared)).invitation).toMatchObject({ deliveryState: 'sent', sentAt: expect.any(Date), acceptedAt: null });
		expect(await sendPreparedStudentInvitation(connection.db, prepared, delivery)).toBe(false);
		expect(mail).toHaveLength(1);
	});

	test('uncertain Gmail failure is durable and never automatically retried; explicit resend rotates after the 60-second cooldown', async () => {
		const [prepared] = await provision();
		const initial = await stored(prepared);
		const { delivery, mail } = trackedDelivery(async () => { throw new Error('Send may have been accepted before connection loss'); });
		expect(await sendImportedStudentInvitations(connection.db, [prepared], delivery)).toEqual({ sent: 0, failed: 1 });
		const failure = await stored(prepared);
		expect(failure.invitation).toMatchObject({ deliveryState: 'failed', sentAt: null, tokenHash: hashInvitationToken(prepared.token), lastAttemptAt: expect.any(Date) });
		expect(failure.student).toEqual(initial.student);
		expect(failure.identity).toEqual(initial.identity);
		expect(failure.credentials).toEqual(initial.credentials);
		expect(await sendPreparedStudentInvitation(connection.db, prepared, delivery)).toBe(false);
		await expect(resendStudentInvitation(connection.db, adminId, prepared.studentId, delivery)).rejects.toMatchObject({ code: 'invalid' });
		expect(mail).toHaveLength(1);
		expect((await stored(prepared)).invitation.tokenHash).toBe(hashInvitationToken(prepared.token));
		await connection.db.update(studentInvitations).set({ lastAttemptAt: new Date(Date.now() - 61_000), expiresAt: new Date(Date.now() - 1_000) }).where(eq(studentInvitations.studentId, prepared.studentId));
		const next = trackedDelivery();
		const before = Date.now();
		const result = await resendInvitationAction(locals(adminId, 'admin'), request(form({ studentId: prepared.studentId })), actionDependencies(next.delivery));
		expect(result).toEqual({ invitationResend: { studentId: prepared.studentId, success: true, testMode: true } });
		expect(next.mail).toHaveLength(1);
		const token = emailToken(next.mail[0].email);
		expect(token).not.toBe(prepared.token);
		const saved = await stored(prepared);
		expect(saved.invitation).toMatchObject({ deliveryState: 'sent', tokenHash: hashInvitationToken(token), acceptedAt: null, sentAt: expect.any(Date) });
		expect(saved.invitation.expiresAt.getTime()).toBeGreaterThanOrEqual(before + INVITATION_TTL_MS);
		expect(saved.credentials).toEqual(initial.credentials);
		expect(await readStudentEnrollment(connection.db, saved.identity.id, prepared.token)).toEqual({ state: 'invalid', student: null });
		expect((await readStudentEnrollment(connection.db, saved.identity.id, token)).state).toBe('ready');
		for (const privateValue of [prepared.token, token, initial.credentials[0].password!]) expect(JSON.stringify(result)).not.toContain(privateValue);
		await expect(resendStudentInvitation(connection.db, adminId, prepared.studentId, next.delivery)).rejects.toMatchObject({ code: 'invalid' });
		expect(next.mail).toHaveLength(1);
	});

	test('a failed resend clears the previous accepted-send timestamp and reports uncertainty without rolling back rotation', async () => {
		const [prepared] = await provision();
		const initial = await stored(prepared);
		const accepted = trackedDelivery();
		expect(await sendPreparedStudentInvitation(connection.db, prepared, accepted.delivery)).toBe(true);
		expect((await stored(prepared)).invitation.sentAt).toBeInstanceOf(Date);
		await connection.db.update(studentInvitations).set({ lastAttemptAt: new Date(Date.now() - 61_000) }).where(eq(studentInvitations.studentId, prepared.studentId));
		const failed = trackedDelivery(async (email) => { throw new Error(`Uncertain send for ${emailToken(email)} and PIN 0042`); });
		const result = await resendInvitationAction(locals(adminId, 'admin'), request(form({ studentId: prepared.studentId })), actionDependencies(failed.delivery));
		expect(result).toMatchObject({ status: 503, data: { invitationResend: { studentId: prepared.studentId, success: false, error: 'unavailable', testMode: true } } });
		expect(failed.mail).toHaveLength(1);
		const token = emailToken(failed.mail[0].email);
		const saved = await stored(prepared);
		expect(saved.invitation).toMatchObject({ tokenHash: hashInvitationToken(token), deliveryState: 'failed', sentAt: null, lastAttemptAt: expect.any(Date), acceptedAt: null });
		expect(saved.student).toEqual(initial.student);
		expect(saved.identity).toEqual(initial.identity);
		expect(saved.credentials).toEqual(initial.credentials);
		expect(await readStudentEnrollment(connection.db, initial.identity.id, prepared.token)).toEqual({ state: 'invalid', student: null });
		expect((await readStudentEnrollment(connection.db, initial.identity.id, token)).state).toBe('ready');
		for (const privateValue of [prepared.token, token, initial.credentials[0].password!]) expect(JSON.stringify(result)).not.toContain(privateValue);
		expect(JSON.stringify(result)).not.toContain('"0042"');
		await expect(resendStudentInvitation(connection.db, adminId, prepared.studentId, failed.delivery)).rejects.toMatchObject({ code: 'invalid' });
		expect(failed.mail).toHaveLength(1);
	});

	test('concurrent resends rotate once, send one email, and invalidate the original link', async () => {
		const [prepared] = await provision();
		const initial = await stored(prepared);
		const { delivery, mail } = trackedDelivery();
		const results = await Promise.allSettled([resendStudentInvitation(connection.db, adminId, prepared.studentId, delivery), resendStudentInvitation(connection.db, adminId, prepared.studentId, delivery)]);
		expect(results.filter((result) => result.status === 'fulfilled')).toEqual([{ status: 'fulfilled', value: true }]);
		const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
		expect(rejected.reason).toMatchObject({ code: 'invalid' });
		expect(mail).toHaveLength(1);
		const token = emailToken(mail[0].email);
		const saved = await stored(prepared);
		expect(saved.invitation.tokenHash).toBe(hashInvitationToken(token));
		expect(saved.credentials).toEqual(initial.credentials);
		expect(await readStudentEnrollment(connection.db, saved.identity.id, prepared.token)).toEqual({ state: 'invalid', student: null });
		await expect(completeStudentEnrollment(connection.db, saved.identity.id, prepared.token, profile)).rejects.toMatchObject({ code: 'invitation' });
		expect((await readStudentEnrollment(connection.db, saved.identity.id, token)).state).toBe('ready');
	});

	test('enrollment requires an explicit student account; matching email never claims a legacy profile', async () => {
		const id = randomUUID(), userId = randomUUID(), email = fixtureEmail(), token = randomBytes(32).toString('hex');
		studentIds.add(id); identityIds.add(userId);
		await connection.db.insert(user).values({ id: userId, name: 'Legacy identity', email, role: 'student' });
		await connection.db.insert(students).values({ id, firstName: 'Legacy', lastName: 'Student', email, classType: 'basic', status: 'invited' });
		await connection.db.insert(studentInvitations).values({ studentId: id, tokenHash: hashInvitationToken(token), recipientEmail: email, language: 'en', expiresAt: new Date(Date.now() + INVITATION_TTL_MS), createdBy: adminId });
		expect(await readStudentEnrollment(connection.db, userId, token)).toEqual({ state: 'invalid', student: null });
		await expect(completeStudentEnrollment(connection.db, userId, token, profile)).rejects.toMatchObject({ code: 'invitation' });
		const { delivery, mail } = trackedDelivery();
		await expect(resendStudentInvitation(connection.db, adminId, id, delivery)).rejects.toMatchObject({ code: 'invitation' });
		expect(mail).toHaveLength(0);
		expect(await databaseFailure(connection.db.delete(user).where(eq(user.id, adminId)))).toMatchObject({
			constraint_name: expect.stringMatching(/^(student_accounts_linked_by|student_invitations_created_by)_auth_user_id_fk$/)
		});
		await connection.db.insert(studentAccounts).values({ userId, studentId: id, linkedBy: adminId, createdAt: new Date() });
		expect((await readStudentEnrollment(connection.db, userId, token)).state).toBe('ready');
		expect(await databaseFailure(connection.db.delete(user).where(eq(user.id, userId)))).toMatchObject({ constraint_name: 'student_accounts_user_id_auth_user_id_fk' });
		expect(await databaseFailure(connection.db.delete(students).where(eq(students.id, id)))).toMatchObject({ constraint_name: 'student_accounts_student_id_students_id_fk' });
		expect(await connection.db.select().from(studentInvitations).where(eq(studentInvitations.studentId, id))).toHaveLength(1);
		const otherId = randomUUID(); studentIds.add(otherId);
		await connection.db.insert(students).values({ id: otherId, firstName: 'Duplicate', lastName: 'Link', email: fixtureEmail(), classType: 'basic' });
		expect(await databaseFailure(connection.db.insert(studentAccounts).values({ userId, studentId: otherId, linkedBy: adminId, createdAt: new Date() }))).toMatchObject({ code: '23505' });
		await connection.db.delete(studentAccounts).where(eq(studentAccounts.studentId, id));
		await connection.db.delete(students).where(eq(students.id, id));
		expect(await connection.db.select().from(studentInvitations).where(eq(studentInvitations.studentId, id))).toHaveLength(0);
		await connection.db.delete(user).where(eq(user.id, userId));
	});

	test('expiry rejects load, completion, and initial delivery at the deadline without changing accounts', async () => {
		const [prepared] = await provision();
		const initial = await stored(prepared);
		expect((await readStudentEnrollment(connection.db, initial.identity.id, prepared.token, new Date(initial.invitation.expiresAt.getTime() - 1))).state).toBe('ready');
		expect(await readStudentEnrollment(connection.db, initial.identity.id, prepared.token, initial.invitation.expiresAt)).toEqual({ state: 'invalid', student: null });
		await connection.db.update(studentInvitations).set({ expiresAt: new Date(Date.now() - 1_000) }).where(eq(studentInvitations.studentId, prepared.studentId));
		await expect(completeStudentEnrollment(connection.db, initial.identity.id, prepared.token, profile)).rejects.toMatchObject({ code: 'invitation' });
		const { delivery, mail } = trackedDelivery();
		expect(await sendPreparedStudentInvitation(connection.db, prepared, delivery)).toBe(false);
		expect(mail).toHaveLength(0);
		const saved = await stored(prepared);
		expect(saved.student).toEqual(initial.student);
		expect(saved.identity).toEqual(initial.identity);
		expect(saved.invitation).toMatchObject({ deliveryState: 'pending', sentAt: null, acceptedAt: null });
	});

	for (const scenario of ['wrong identity', 'wrong token', 'inactive', 'wrong role', 'student email mismatch', 'identity email mismatch', 'recipient mismatch'] as const) {
		test(`${scenario} cannot load, accept, or send an invitation`, async () => {
			const [prepared] = await provision();
			const initial = await stored(prepared);
			const userId = scenario === 'wrong identity' ? randomUUID() : initial.identity.id;
			const token = scenario === 'wrong token' ? randomBytes(32).toString('hex') : prepared.token;
			if (scenario === 'inactive') await connection.db.update(students).set({ status: 'inactive' }).where(eq(students.id, prepared.studentId));
			if (scenario === 'wrong role') await connection.db.update(user).set({ role: 'admin' }).where(eq(user.id, initial.identity.id));
			if (scenario === 'student email mismatch') await connection.db.update(students).set({ email: fixtureEmail() }).where(eq(students.id, prepared.studentId));
			if (scenario === 'identity email mismatch') await connection.db.update(user).set({ email: fixtureEmail() }).where(eq(user.id, initial.identity.id));
			if (scenario === 'recipient mismatch') await connection.db.update(studentInvitations).set({ recipientEmail: fixtureEmail() }).where(eq(studentInvitations.studentId, prepared.studentId));
			const before = await stored(prepared);
			expect(await readStudentEnrollment(connection.db, userId, token)).toEqual({ state: 'invalid', student: null });
			await expect(completeStudentEnrollment(connection.db, userId, token, profile)).rejects.toMatchObject({ code: 'invitation' });
			if (!['wrong identity', 'wrong token'].includes(scenario)) {
				const { delivery, mail } = trackedDelivery();
				expect(await sendPreparedStudentInvitation(connection.db, prepared, delivery)).toBe(false);
				await expect(resendStudentInvitation(connection.db, adminId, prepared.studentId, delivery)).rejects.toMatchObject({ code: 'invitation' });
				expect(mail).toHaveLength(0);
			}
			expect(await stored(prepared)).toEqual(before);
		});
	}

	test('completion persists required DOB/gender and editable names but ignores forged email, class, identity, lifecycle, and credentials', async () => {
		const [prepared] = await provision();
		const initial = await stored(prepared);
		const actor = locals(initial.identity.id);
		const invalid = await completeEnrollmentAction(actor, request(form({ token: prepared.token, ...profile, dateOfBirth: '', gender: '', email: 'forged@example.test', classType: 'basic', role: 'admin' }), '/enroll'), () => connection.db);
		expect(invalid).toMatchObject({ status: 400, data: { enrollment: { success: false, error: 'invalid' } } });
		expect(await stored(prepared)).toEqual(initial);
		const ready = await loadStudentEnrollment(actor, prepared.token, () => connection.db);
		expect(ready).toMatchObject({ state: 'ready', student: { firstName: initial.student.firstName, email: initial.student.email, classType: 'regular', dateOfBirth: null, gender: null } });
		for (const privateField of ['pin', 'password', 'token', 'tokenHash', 'authUserId']) expect(ready.student).not.toHaveProperty(privateField);
		const result = await completeEnrollmentAction(actor, request(form({ token: prepared.token, ...profile,
			firstName: ` ${profile.firstName} `, lastName: ` ${profile.lastName} `, email: 'forged@example.test', classType: 'basic',
			id: randomUUID(), studentId: randomUUID(), authUserId: adminId, role: 'admin', status: 'inactive', isActive: 'false',
			password: '9999', pin: '9999', createdAt: '1900-01-01', acceptedAt: '1900-01-01', createdBy: 'forged-creator', tokenHash: 'forged-hash' }), '/enroll'), () => connection.db);
		expect(result).toEqual({ enrollment: { success: true } });
		expect(JSON.stringify(result)).not.toContain(prepared.token);
		const saved = await stored(prepared);
		expect(saved.student).toMatchObject({ ...profile, id: initial.student.id, email: initial.student.email,
			classType: 'regular', status: 'active', createdAt: initial.student.createdAt });
		expect(saved.association).toEqual(initial.association);
		expect(saved.identity).toMatchObject({ name: `${profile.firstName} ${profile.lastName}`, email: initial.identity.email, role: 'student', emailVerified: true });
		expect(saved.credentials).toEqual(initial.credentials);
		expect(saved.invitation).toMatchObject({ tokenHash: hashInvitationToken(prepared.token), acceptedAt: expect.any(Date), createdBy: adminId, createdAt: initial.invitation.createdAt });
		expect(await readStudentEnrollment(connection.db, initial.identity.id, prepared.token)).toEqual({ state: 'complete', student: null });
		await expect(completeStudentEnrollment(connection.db, initial.identity.id, prepared.token, { ...profile, firstName: 'Replay' })).rejects.toMatchObject({ code: 'invitation' });
		const { delivery, mail } = trackedDelivery();
		await expect(resendStudentInvitation(connection.db, adminId, prepared.studentId, delivery)).rejects.toMatchObject({ code: 'invitation' });
		expect(await sendPreparedStudentInvitation(connection.db, prepared, delivery)).toBe(false);
		expect(mail).toHaveLength(0);
		expect(await stored(prepared)).toEqual(saved);
	});

	test('concurrent completions accept once and never merge the losing profile into the winning transaction', async () => {
		const [prepared] = await provision();
		const initial = await stored(prepared);
		const profiles: EnrollmentProfile[] = [profile, { firstName: 'Other', lastName: 'Contender', dateOfBirth: '1999-01-02', gender: 'male' }];
		const results = await Promise.allSettled(profiles.map((values) => completeStudentEnrollment(connection.db, initial.identity.id, prepared.token, values)));
		expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
		expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
		expect((results.find((result) => result.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ code: 'invitation' });
		const winner = profiles[results.findIndex((result) => result.status === 'fulfilled')];
		const saved = await stored(prepared);
		expect(saved.student).toMatchObject({ ...winner, status: 'active' });
		expect(saved.identity).toMatchObject({ name: `${winner.firstName} ${winner.lastName}`, emailVerified: true });
		expect(saved.invitation.acceptedAt).toBeInstanceOf(Date);
		expect(saved.credentials).toEqual(initial.credentials);
	});

	test('concurrent completion versus resend yields either acceptance or rotation, never a stale accepted link', async () => {
		const [prepared] = await provision();
		const initial = await stored(prepared);
		const { delivery, mail } = trackedDelivery();
		const results = await Promise.allSettled([
			completeStudentEnrollment(connection.db, initial.identity.id, prepared.token, profile),
			resendStudentInvitation(connection.db, adminId, prepared.studentId, delivery)
		]);
		expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
		expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
		expect((results.find((result) => result.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ code: 'invitation' });
		const saved = await stored(prepared);
		if (results[0].status === 'fulfilled') {
			expect(saved.student).toMatchObject({ ...profile, status: 'active' });
			expect(saved.invitation).toMatchObject({ acceptedAt: expect.any(Date), tokenHash: hashInvitationToken(prepared.token) });
			expect(mail).toHaveLength(0);
		} else {
			expect(results[1]).toEqual({ status: 'fulfilled', value: true });
			expect(saved.student).toEqual(initial.student);
			expect(saved.invitation).toMatchObject({ acceptedAt: null, deliveryState: 'sent' });
			expect(mail).toHaveLength(1);
			const token = emailToken(mail[0].email);
			expect(saved.invitation.tokenHash).toBe(hashInvitationToken(token));
			expect(await readStudentEnrollment(connection.db, initial.identity.id, prepared.token)).toEqual({ state: 'invalid', student: null });
			expect((await readStudentEnrollment(connection.db, initial.identity.id, token)).state).toBe('ready');
		}
		expect(saved.credentials).toEqual(initial.credentials);
	});

	test('linked email edits preserve every record and the old invitation, while casing-only and legacy email edits remain allowed', async () => {
		const row = fixtureRow();
		const [prepared] = await provision([row]);
		const initial = await stored(prepared);
		await connection.db.insert(studentSubjectScores).values({ studentId: prepared.studentId, ar: 42, pc: 43, wk: 44, mk: 45 });
		const score = async () => (await connection.db.select().from(studentSubjectScores).where(eq(studentSubjectScores.studentId, prepared.studentId)))[0];
		const initialScore = await score();
		const changedEmail = fixtureEmail();
		await expect(updateAdminStudent(connection.db, form({ id: prepared.studentId, firstName: 'Uncommitted', lastName: 'Edit', email: changedEmail,
			dateOfBirth: '1999-01-01', gender: 'male', classType: 'basic', status: 'inactive', ar: '99', pc: '99', wk: '99', mk: '99' }))).rejects.toMatchObject({ code: 'linkedEmail' });
		expect(await stored(prepared)).toEqual(initial);
		expect(await score()).toEqual(initialScore);
		await assertNoWrites([{ ...row, email: changedEmail }]);
		expect(await readStudentEnrollment(connection.db, initial.identity.id, prepared.token)).toEqual({ state: 'ready', student: {
			firstName: row.firstName, lastName: row.lastName, email: row.email, classType: 'regular', dateOfBirth: null, gender: null
		} });

		await updateAdminStudent(connection.db, form({ id: prepared.studentId, firstName: row.firstName, lastName: row.lastName,
			email: ` ${row.email.toUpperCase()} `, dateOfBirth: '', gender: '', classType: 'regular', status: 'invited', ar: '42', pc: '43', wk: '44', mk: '45' }));
		const normalized = await stored(prepared);
		expect(normalized.student).toMatchObject({ email: row.email, firstName: row.firstName, lastName: row.lastName,
			dateOfBirth: null, gender: null, classType: 'regular', status: 'invited', createdAt: initial.student.createdAt });
		expect(normalized.association).toEqual(initial.association);
		expect(normalized.invitation).toEqual(initial.invitation);
		expect(normalized.identity).toEqual(initial.identity);
		expect(normalized.credentials).toEqual(initial.credentials);
		expect(await score()).toEqual(initialScore);
		expect((await readStudentEnrollment(connection.db, initial.identity.id, prepared.token)).state).toBe('ready');

		const legacyId = randomUUID(), legacyEmail = fixtureEmail(), replacementEmail = fixtureEmail();
		studentIds.add(legacyId);
		await connection.db.insert(students).values({ id: legacyId, firstName: 'Legacy', lastName: 'Student', email: legacyEmail, classType: 'basic' });
		await updateAdminStudent(connection.db, form({ id: legacyId, firstName: 'Legacy', lastName: 'Edited', email: replacementEmail,
			dateOfBirth: '', gender: '', classType: 'basic', status: 'active', ar: '', pc: '', wk: '', mk: '' }));
		expect((await connection.db.select().from(students).where(eq(students.id, legacyId)))[0]).toMatchObject({ email: replacementEmail, lastName: 'Edited' });
		expect(await connection.db.select().from(studentAccounts).where(eq(studentAccounts.studentId, legacyId))).toHaveLength(0);
	});

	test('201-row lookahead keeps an older unresolved imported invitation recoverable on pages two and three', async () => {
		const [prepared] = await provision();
		const initial = await stored(prepared);
		const failed = trackedDelivery(async () => { throw new Error('Uncertain initial send'); });
		expect(await sendPreparedStudentInvitation(connection.db, prepared, failed.delivery)).toBe(false);
		const [latest] = await connection.db.select({ createdAt: studentInvitations.createdAt }).from(studentInvitations).orderBy(desc(studentInvitations.createdAt)).limit(1);
		const olderCreatedAt = new Date(Math.max(Date.now(), latest.createdAt.getTime()) + 1_000);
		await connection.db.update(studentInvitations).set({ createdAt: olderCreatedAt, lastAttemptAt: new Date(Date.now() - 61_000) }).where(eq(studentInvitations.studentId, prepared.studentId));
		const manualIds: string[] = [], manualEmails: string[] = [];
		async function addNewerPage(timestamp: number) {
			const batch = Array.from({ length: INVITATIONS_PAGE_SIZE }, () => {
				const id = randomUUID(), email = fixtureEmail();
				studentIds.add(id); manualIds.push(id); manualEmails.push(email);
				return { id, email, firstName: 'Pagination', lastName: 'Fixture', classType: 'basic' as const, status: 'invited' as const };
			});
			await connection.db.insert(students).values(batch);
			await connection.db.insert(studentInvitations).values(batch.map(({ id, email }) => ({ studentId: id,
				tokenHash: hashInvitationToken(randomBytes(32).toString('hex')), recipientEmail: email, language: 'en' as const,
				createdAt: new Date(timestamp), expiresAt: new Date(Date.now() + INVITATION_TTL_MS), createdBy: adminId, testMode: true })));
			return batch.map(({ id }) => id).sort().reverse();
		}
		try {
			const firstBatch = await addNewerPage(olderCreatedAt.getTime() + 1_000);
			const first = await readAdminStudentInvitations(connection.db);
			expect(first).toHaveLength(INVITATIONS_PAGE_SIZE + 1);
			expect(first.map(({ studentId }) => studentId)).toEqual([...firstBatch, prepared.studentId]);
			expect(first.slice(0, INVITATIONS_PAGE_SIZE).some(({ studentId }) => studentId === prepared.studentId)).toBe(false);
			const second = await readAdminStudentInvitations(connection.db, 2);
			expect(second[0]).toMatchObject({ studentId: prepared.studentId, deliveryState: 'failed', status: 'invited' });
			expect(second.length).toBeLessThanOrEqual(INVITATIONS_PAGE_SIZE + 1);

			const secondBatch = await addNewerPage(olderCreatedAt.getTime() + 2_000);
			const [pageOne, pageTwo, pageThree] = await Promise.all([1, 2, 3].map((page) => readAdminStudentInvitations(connection.db, page)));
			expect(pageOne.map(({ studentId }) => studentId)).toEqual([...secondBatch, firstBatch[0]]);
			expect(pageTwo.map(({ studentId }) => studentId)).toEqual([...firstBatch, prepared.studentId]);
			expect(pageThree[0]).toMatchObject({ studentId: prepared.studentId, deliveryState: 'failed', acceptedAt: null });
			expect(pageThree.length).toBeLessThanOrEqual(INVITATIONS_PAGE_SIZE + 1);
			const visibleIds = [...pageOne.slice(0, INVITATIONS_PAGE_SIZE), ...pageTwo.slice(0, INVITATIONS_PAGE_SIZE)].map(({ studentId }) => studentId);
			expect(new Set(visibleIds).size).toBe(INVITATIONS_PAGE_SIZE * 2);
			expect(visibleIds).not.toContain(prepared.studentId);
			expect(await readAdminStudentInvitations(connection.db, -1)).toEqual(pageOne);
			expect(await readAdminStudentInvitations(connection.db, 1_000_000)).toEqual([]);
			expect(await connection.db.select({ id: user.id }).from(user).where(inArray(user.email, manualEmails))).toHaveLength(0);
			expect(await connection.db.select({ id: students.id }).from(students).where(inArray(students.id, manualIds)))
				.toHaveLength(INVITATIONS_PAGE_SIZE * 2);
			expect(await connection.db.select().from(studentAccounts).where(inArray(studentAccounts.studentId, manualIds))).toHaveLength(0);

			const next = trackedDelivery();
			const result = await resendInvitationAction(locals(adminId, 'admin'), request(form({ studentId: pageThree[0].studentId })), actionDependencies(next.delivery));
			expect(result).toEqual({ invitationResend: { studentId: prepared.studentId, success: true, testMode: true } });
			expect(next.mail).toHaveLength(1);
			expect(next.mail[0].email.to).toEqual([initial.student.email]);
			const token = emailToken(next.mail[0].email);
			const saved = await stored(prepared);
			expect(saved.invitation).toMatchObject({ createdAt: olderCreatedAt, tokenHash: hashInvitationToken(token), deliveryState: 'sent', sentAt: expect.any(Date), acceptedAt: null });
			expect(saved.student).toEqual(initial.student);
			expect(saved.identity).toEqual(initial.identity);
			expect(saved.credentials).toEqual(initial.credentials);
			expect(await readStudentEnrollment(connection.db, initial.identity.id, prepared.token)).toEqual({ state: 'invalid', student: null });
			expect((await readStudentEnrollment(connection.db, initial.identity.id, token)).state).toBe('ready');
		} finally {
			if (manualIds.length) await connection.db.delete(students).where(inArray(students.id, manualIds));
		}
	});
});
