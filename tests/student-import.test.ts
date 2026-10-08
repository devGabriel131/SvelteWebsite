import { beforeAll, describe, expect, test } from 'bun:test';
import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import { drizzle } from 'drizzle-orm/pg-proxy';
import ExcelJS from 'exceljs';
import type { Database } from '../src/lib/server/db/connection';
import { parseStudentImportOptions, resendInvitationAction, studentImportAction, type StudentImportDependencies } from '../src/lib/server/student-import';
import { MAX_IMPORT_BYTES } from '../src/lib/server/student-import-file';
import { createStudentImportReview, IMPORT_REVIEW_TTL_MS, verifyStudentImportReview, type StudentImportOptions } from '../src/lib/server/student-import-review';
import { StudentInvitationError } from '../src/lib/server/student-invitations';

const origin = 'https://students.example.test';
const secret = randomBytes(32).toString('hex');
const adminId = 'fixture-admin';
const studentId = '00000000-0000-4000-8000-000000000001';
const student = { row: 2, firstName: 'María José', lastName: 'Rivera', email: 'student@example.test', pin: '0042' };
const options: StudentImportOptions = { classType: 'regular', emailLanguage: 'es' };
type AuthLocals = Pick<App.Locals, 'user' | 'session'>;

function locals(role: 'student' | 'admin', id = adminId): AuthLocals {
	return { user: { id, role }, session: { userId: id } } as AuthLocals;
}

function importForm(file?: File, overrides: Record<string, string | File> = {}) {
	const form = new FormData();
	if (file) form.set('file', file);
	for (const [key, value] of Object.entries({ ...options, ...overrides })) form.set(key, value);
	return form;
}

function request(form: FormData) {
	return new Request(`${origin}/admin`, { method: 'POST', headers: { origin }, body: form });
}

type Query = { sql: string; params: unknown[] };
function dependencies(respond: (query: Query) => unknown[][] = () => []) {
	const queries: Query[] = [];
	const calls = { authentication: 0, database: 0, delivery: 0, hash: 0, send: 0 };
	// Preview compiles real Drizzle reads; transactions and persistence are covered in PostgreSQL.
	const db = drizzle(async (sql, params) => {
		const query = { sql, params };
		queries.push(query);
		if (!sql.startsWith('select')) throw new Error('Preview must not write');
		return { rows: respond(query) };
	}) as unknown as Database;
	const deps: StudentImportDependencies = {
		database() { calls.database++; return db; },
		async authentication() {
			calls.authentication++;
			return { secret, baseURL: origin, async hashPin() { calls.hash++; throw new Error('Preview must not hash PINs'); } };
		},
		delivery() {
			calls.delivery++;
			return { baseURL: origin, testMode: true, async send() { calls.send++; throw new Error('Preview must not send mail'); } };
		}
	};
	return { deps, calls, queries };
}

describe('signed student import review', () => {
	const now = Date.parse('2026-10-08T12:00:00Z');
	const input = { ...options, adminId, file: new Uint8Array([0, 1, 127, 128, 255]) };

	test('accepts an unchanged review only during its fifteen-minute lifetime', () => {
		const receipt = createStudentImportReview(secret, input, now);
		expect(IMPORT_REVIEW_TTL_MS).toBe(15 * 60 * 1000);
		expect(receipt).toMatch(/^\d{13}\.[0-9a-f]{64}$/);
		expect(verifyStudentImportReview(secret, receipt, input, now)).toBe(true);
		expect(verifyStudentImportReview(secret, receipt, input, now + IMPORT_REVIEW_TTL_MS - 1)).toBe(true);
		expect(verifyStudentImportReview(secret, receipt, input, now + IMPORT_REVIEW_TTL_MS)).toBe(false);
		expect(verifyStudentImportReview(secret, receipt, input, now + IMPORT_REVIEW_TTL_MS + 1)).toBe(false);
		expect(verifyStudentImportReview(secret, receipt, input, now - 1)).toBe(false);
	});

	test('binds every file byte, the administrator, class, language, signing secret, and expiry', () => {
		const receipt = createStudentImportReview(secret, input, now);
		for (const changed of [
			{ ...input, file: new Uint8Array([0, 1, 127, 128, 254]) },
			{ ...input, file: new Uint8Array([...input.file, 0]) },
			{ ...input, adminId: 'different-admin' },
			{ ...input, classType: 'basic' as const },
			{ ...input, emailLanguage: 'en' as const }
		]) expect(verifyStudentImportReview(secret, receipt, changed, now)).toBe(false);
		expect(verifyStudentImportReview(`${secret}-different`, receipt, input, now)).toBe(false);
		const [expiry, digest] = receipt.split('.');
		expect(verifyStudentImportReview(secret, `${Number(expiry) - 1}.${digest}`, input, now)).toBe(false);
		const mutatedDigest = `${digest[0] === '0' ? '1' : '0'}${digest.slice(1)}`;
		expect(verifyStudentImportReview(secret, `${expiry}.${mutatedDigest}`, input, now)).toBe(false);
	});

	test('fails closed for malformed, non-string, and excessively future receipts', () => {
		const receipt = createStudentImportReview(secret, input, now);
		for (const invalid of [undefined, null, 42, {}, new File([receipt], 'review.txt'), '', receipt.toUpperCase(), `${receipt}\n`, ` ${receipt}`,
			receipt.replace('.', '..'), `${now + IMPORT_REVIEW_TTL_MS}.${'g'.repeat(64)}`, `${now}.${'0'.repeat(63)}`,
			createStudentImportReview(secret, input, now + 1)]) {
			expect(verifyStudentImportReview(secret, invalid, input, now)).toBe(false);
		}
	});
});

describe('admin import and resend authorization', () => {
	const cases: { name: string; viewer: AuthLocals; requestOrigin?: string; status: number }[] = [
		{ name: 'anonymous', viewer: { user: null, session: null }, requestOrigin: origin, status: 401 },
		{ name: 'missing session', viewer: { ...locals('admin'), session: null }, requestOrigin: origin, status: 401 },
		{ name: 'mismatched session', viewer: { ...locals('admin'), session: { userId: 'other' } } as AuthLocals, requestOrigin: origin, status: 401 },
		{ name: 'student', viewer: locals('student'), requestOrigin: origin, status: 403 },
		{ name: 'missing Origin', viewer: locals('admin'), status: 403 },
		{ name: 'foreign Origin', viewer: locals('admin'), requestOrigin: 'https://attacker.example.test', status: 403 },
		{ name: 'wrong scheme', viewer: locals('admin'), requestOrigin: 'http://students.example.test', status: 403 }
	];
	for (const { name, viewer, requestOrigin, status } of cases) {
		test(`${name} is rejected before any dependency property or request body is read`, async () => {
			for (const phase of ['preview', 'import', 'resend'] as const) {
				let dependencyReads = 0, bodyReads = 0;
				const deps = Object.defineProperties({}, Object.fromEntries(['database', 'authentication', 'delivery'].map((key) => [key, {
					get() { dependencyReads++; throw new Error('Dependencies must not be read'); }
				}]))) as StudentImportDependencies;
				const input = new Request(`${origin}/admin`, { method: 'POST', headers: requestOrigin ? { origin: requestOrigin } : {} });
				Object.defineProperty(input, 'body', { get() { bodyReads++; throw new Error('Body must not be read'); } });
				Object.defineProperty(input, 'formData', { value() { bodyReads++; throw new Error('Body must not be parsed'); } });
				const result = phase === 'resend' ? resendInvitationAction(viewer, input, deps) : studentImportAction(viewer, input, phase, deps);
				await expect(result).rejects.toMatchObject({ status });
				expect(dependencyReads).toBe(0);
				expect(bodyReads).toBe(0);
			}
		});
	}
});

describe('student import actions', () => {
	let file: File, bytes: Uint8Array<ArrayBuffer>;
	beforeAll(async () => {
		const workbook = new ExcelJS.Workbook();
		const sheet = workbook.addWorksheet('Students');
		sheet.addRow(['firstName', 'lastName', 'email', 'pin']);
		sheet.addRow([student.firstName, student.lastName, student.email, student.pin]);
		bytes = Uint8Array.from(Buffer.from(await workbook.xlsx.writeBuffer()));
		file = new File([bytes], 'students.xlsx');
	});

	test('validates explicit import options and does not accept defaults or uploaded choices', () => {
		for (const classType of ['basic', 'regular'] as const) {
			for (const emailLanguage of ['en', 'es'] as const) expect(parseStudentImportOptions(importForm(undefined, { classType, emailLanguage }))).toEqual({ classType, emailLanguage });
		}
		for (const key of ['classType', 'emailLanguage']) {
			for (const value of [undefined, '', 'other', key === 'classType' ? ' REGULAR ' : 'ES', new File(['regular'], 'choice.txt')]) {
				const form = importForm();
				if (value === undefined) form.delete(key);
				else form.set(key, value);
				expect(() => parseStudentImportOptions(form)).toThrow('invalid');
			}
		}
	});

	test('preview performs conflict/configuration reads only, returns a signed digest and never exposes or hashes PINs', async () => {
		const { deps, calls, queries } = dependencies();
		const result = await studentImportAction(locals('admin'), request(importForm(file)), 'preview', deps);
		if ('status' in result) throw new Error('Expected a successful preview');
		const expected = { phase: 'preview' as const, success: true as const, rows: [{ row: student.row, firstName: student.firstName, lastName: student.lastName, email: student.email }],
			reviewToken: expect.stringMatching(/^\d{13}\.[0-9a-f]{64}$/), options, testMode: true };
		expect(result.studentImport).toEqual(expected);
		expect(verifyStudentImportReview(secret, result.studentImport.reviewToken, { ...options, adminId, file: bytes })).toBe(true);
		expect(calls).toEqual({ authentication: 1, database: 1, delivery: 1, hash: 0, send: 0 });
		expect(queries).toHaveLength(2);
		expect(queries.every((query) => query.sql.startsWith('select'))).toBe(true);
		expect(JSON.stringify(result)).not.toContain(`"${student.pin}"`);
		expect(result.studentImport.rows![0]).not.toHaveProperty('pin');
		expect(result.studentImport).not.toHaveProperty('token');
		expect(result.studentImport).not.toHaveProperty('tokenHash');
	});

	test('import rejects missing, mutated, expired, or differently scoped reviews before database or delivery access', async () => {
		const input = { ...options, adminId, file: bytes };
		const receipt = createStudentImportReview(secret, input);
		const cases = [
			{ viewer: locals('admin'), form: importForm(file) },
			{ viewer: locals('admin'), form: importForm(file, { reviewToken: 'bad-review' }) },
			{ viewer: locals('admin'), form: importForm(new File([bytes, new Uint8Array([0])], 'students.xlsx'), { reviewToken: receipt }) },
			{ viewer: locals('admin', 'different-admin'), form: importForm(file, { reviewToken: receipt }) },
			{ viewer: locals('admin'), form: importForm(file, { reviewToken: receipt, classType: 'basic' }) },
			{ viewer: locals('admin'), form: importForm(file, { reviewToken: receipt, emailLanguage: 'en' }) },
			{ viewer: locals('admin'), form: importForm(file, { reviewToken: createStudentImportReview(secret, input, Date.now() - IMPORT_REVIEW_TTL_MS - 1) }) },
			{ viewer: locals('admin'), form: importForm(file, { reviewToken: createStudentImportReview('wrong-secret', input) }) }
		];
		for (const { viewer, form } of cases) {
			const { deps, calls, queries } = dependencies();
			const result = await studentImportAction(viewer, request(form), 'import', deps);
			expect(result).toMatchObject({ status: 400, data: { studentImport: { phase: 'import', success: false, error: 'review' } } });
			expect(calls).toEqual({ authentication: 1, database: 0, delivery: 0, hash: 0, send: 0 });
			expect(queries).toHaveLength(0);
			expect(JSON.stringify(result)).not.toContain(receipt);
			expect(JSON.stringify(result)).not.toContain(student.pin);
		}
	});

	test('reports existing profiles/identities as one row conflict without preparing accounts or sending mail', async () => {
		for (const phase of ['preview', 'import'] as const) {
			const { deps, calls } = dependencies(() => [[` ${student.email.toUpperCase()} `]]);
			const result = await studentImportAction(locals('admin'), request(importForm(file, { reviewToken: createStudentImportReview(secret, { ...options, adminId, file: bytes }) })), phase, deps);
			expect(result).toMatchObject({ status: 400, data: { studentImport: { phase, success: false, issues: [{ row: 2, code: 'exists' }], error: 'invalid' } } });
			expect(calls).toEqual({ authentication: 1, database: 1, delivery: 0, hash: 0, send: 0 });
			expect(JSON.stringify(result)).not.toContain(`"${student.pin}"`);
		}
	});

	test('missing files and invalid options fail before authentication, storage, or mail configuration', async () => {
		for (const [form, code] of [[importForm(), 'file'], [importForm(file, { classType: 'forged' }), 'invalid']] as const) {
			const { deps, calls } = dependencies();
			expect(await studentImportAction(locals('admin'), request(form), 'preview', deps)).toMatchObject({ status: 400, data: { studentImport: { success: false, error: code } } });
			expect(Object.values(calls)).toEqual([0, 0, 0, 0, 0]);
		}
	});

	test('caps the actual streamed HTTP body despite a lying Content-Length and cancels the reader', async () => {
		for (const phase of ['preview', 'import', 'resend'] as const) {
			let canceled = false, chunk = 0;
			const body = new ReadableStream<Uint8Array>({
				pull(controller) { controller.enqueue(new Uint8Array(chunk++ === 0 ? MAX_IMPORT_BYTES + 64 * 1024 : 1)); },
				cancel() { canceled = true; }
			});
			const input = new Request(`${origin}/admin`, { method: 'POST', headers: { origin, 'content-type': 'multipart/form-data; boundary=test', 'content-length': '1' }, body });
			const { deps, calls } = dependencies();
			const result = phase === 'resend' ? await resendInvitationAction(locals('admin'), input, deps) : await studentImportAction(locals('admin'), input, phase, deps);
			expect(result).toMatchObject({ status: 400, data: phase === 'resend' ? { invitationResend: { success: false, error: 'invalid' } } : { studentImport: { phase, success: false, error: 'limit' } } });
			expect(canceled).toBe(true);
			expect(Object.values(calls)).toEqual([0, 0, 0, 0, 0]);
		}
	});

	test('mail/auth origin disagreement fails before hashing, account writes, or sends', async () => {
		const { deps, calls, queries } = dependencies();
		deps.delivery = () => ({ baseURL: 'https://different.example.test', testMode: true, async send() { throw new Error('Must not send'); } });
		expect(await studentImportAction(locals('admin'), request(importForm(file)), 'preview', deps)).toMatchObject({ status: 503, data: { studentImport: { success: false, error: 'unavailable' } } });
		expect(queries).toHaveLength(2);
		expect(calls.hash).toBe(0);
		expect(calls.send).toBe(0);
	});

	test('maps configuration, unique, and storage errors to safe codes without serializing secrets', async () => {
		for (const [cause, status, code] of [
			[new StudentInvitationError('unavailable'), 503, 'unavailable'],
			[{ code: '23505', detail: `0042 ${secret}` }, 400, 'conflict'],
			[{ cause: { code: '23505' }, detail: `0042 ${secret}` }, 400, 'conflict'],
			[new Error(`0042 ${secret}`), 500, 'storage']
		] as const) {
			const { deps } = dependencies();
			deps.authentication = async () => { throw cause; };
			const result = await studentImportAction(locals('admin'), request(importForm(file)), 'preview', deps);
			expect(result).toMatchObject({ status, data: { studentImport: { phase: 'preview', success: false, error: code } } });
			expect(JSON.stringify(result)).not.toContain(student.pin);
			expect(JSON.stringify(result)).not.toContain(secret);
		}
	});

	test('resend validates the student identifier before any dependency and serializes only safe failures', async () => {
		for (const value of [undefined, '', 'bad-id', `${studentId}\n`, new File([studentId], 'id.txt')]) {
			const form = new FormData();
			if (value !== undefined) form.set('studentId', value);
			const { deps, calls } = dependencies();
			expect(await resendInvitationAction(locals('admin'), request(form), deps)).toMatchObject({ status: 400, data: { invitationResend: { success: false, error: 'invalid' } } });
			expect(Object.values(calls)).toEqual([0, 0, 0, 0, 0]);
		}
		for (const [cause, status, code] of [[new StudentInvitationError('unavailable'), 503, 'unavailable'], [new Error(`0042 ${secret}`), 500, 'storage']] as const) {
			const { deps } = dependencies();
			deps.delivery = () => { throw cause; };
			const form = new FormData();
			form.set('studentId', studentId);
			const result = await resendInvitationAction(locals('admin'), request(form), deps);
			expect(result).toMatchObject({ status, data: { invitationResend: { studentId, success: false, error: code } } });
			expect(JSON.stringify(result)).not.toContain(student.pin);
			expect(JSON.stringify(result)).not.toContain(secret);
		}
	});
});
