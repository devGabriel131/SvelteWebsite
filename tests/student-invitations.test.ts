import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { drizzle } from 'drizzle-orm/pg-proxy';
import { translations } from '../src/lib/i18n/translations';
import { INVITATIONS_PAGE_SIZE, type EnrollmentProfile } from '../src/lib/student-invitations';
import type { Database } from '../src/lib/server/db/connection';
import { completeEnrollmentAction, loadStudentEnrollment } from '../src/lib/server/student-enrollment';
import {
	hashInvitationToken, INVITATION_TTL_MS, isInvitationToken, isValidStudentName,
	parseEnrollmentProfile, parseInvitationPage, provisionImportedStudents, readAdminStudentInvitations, readStudentEnrollment,
	studentInvitationEmail, StudentInvitationError
} from '../src/lib/server/student-invitations';
import { MAX_IMPORT_ROWS, type ImportedStudent } from '../src/lib/server/student-import-file';
import type { StudentImportOptions } from '../src/lib/server/student-import-review';

const origin = 'https://students.example.test';
const token = 'ab'.repeat(32);
const today = '2026-10-08';
const profile: EnrollmentProfile = { firstName: 'María José', lastName: 'O’Neill-Rivera', dateOfBirth: '2000-02-29', gender: 'female' };
const row: ImportedStudent = { row: 2, firstName: profile.firstName, lastName: profile.lastName, email: 'student@example.test', pin: '0042' };
const options: StudentImportOptions = { classType: 'regular', emailLanguage: 'es' };
type AuthLocals = Pick<App.Locals, 'user' | 'session'>;

function locals(role: 'student' | 'admin', id = 'fixture-student'): AuthLocals {
	return { user: { id, role }, session: { userId: id } } as AuthLocals;
}

function enrollmentForm(overrides: Record<string, string | File> = {}) {
	const form = new FormData();
	for (const [key, value] of Object.entries({ token, ...profile, ...overrides })) form.set(key, value);
	return form;
}

describe('student invitation tokens and email', () => {
	test('accepts only a complete lowercase 256-bit token and stores its SHA-256 digest', () => {
		expect(isInvitationToken(token)).toBe(true);
		expect(hashInvitationToken(token)).toBe(createHash('sha256').update(token).digest('hex'));
		expect(hashInvitationToken(token)).toMatch(/^[0-9a-f]{64}$/);
		expect(hashInvitationToken(token)).not.toBe(token);
		expect(INVITATION_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
		for (const value of [null, undefined, 42, new File([token], 'token.txt'), '', 'a'.repeat(63), 'a'.repeat(65), token.toUpperCase(), 'g'.repeat(64), `${token}\n`, ` ${token}`]) {
			expect(isInvitationToken(value)).toBe(false);
		}
	});

	for (const language of ['en', 'es'] as const) {
		test(`${language} mail has one recipient, the enrollment link, and no student PIN`, () => {
			const message = studentInvitationEmail(language, `${row.firstName} ${row.lastName}`, row.email, token, origin);
			expect(message.to).toEqual([row.email]);
			expect(message.subject).toBe(translations[language].admin.studentImport.email.subject);
			expect(message.body).toContain(`${row.firstName} ${row.lastName}`);
			if (typeof message.body !== 'string') throw new Error('Expected a plain-text invitation body');
			const urls = message.body.match(/https:\/\/\S+/g);
			expect(urls).toEqual([`${origin}/enroll?token=${token}`]);
			expect(new URL(urls![0]).searchParams.get('token')).toBe(token);
			expect(JSON.stringify(message)).not.toContain(row.pin);
			expect(message).not.toHaveProperty('attachments');
		});
	}

	test('allows HTTP only for explicit loopback origins and rejects paths or unsafe origins', () => {
		for (const baseURL of ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://[::1]:5173']) {
			expect(studentInvitationEmail('en', 'Student', row.email, token, baseURL).body).toContain(`${baseURL}/enroll?token=${token}`);
		}
		for (const baseURL of ['http://students.example.test', `${origin}/`, `${origin}/admin`, `${origin}?redirect=evil`, `${origin}#fragment`, 'https://user:password@students.example.test', 'ftp://students.example.test']) {
			expect(() => studentInvitationEmail('en', 'Student', row.email, token, baseURL)).toThrow('unavailable');
		}
		expect(() => studentInvitationEmail('en', 'Student', row.email, 'bad-token', origin)).toThrow('invalid');
	});
});

describe('bounded invitation pagination', () => {
	test('accepts page boundaries from one through one million', () => {
		expect(INVITATIONS_PAGE_SIZE).toBe(200);
		for (const [value, expected] of [['1', 1], ['2', 2], ['200', 200], ['1000000', 1_000_000]] as const) {
			expect(parseInvitationPage(value)).toBe(expected);
		}
	});

	test('malformed, fractional, unsafe, and out-of-range pages fall back to the first page', () => {
		for (const value of [null, '', ' ', '0', '-1', '1.5', 'NaN', 'Infinity', '-Infinity', '1/2', '2pages', '2\n3',
			'1000001', '1000000.5', '9007199254740992', '9'.repeat(40), '2;DROP TABLE students']) {
			expect(parseInvitationPage(value)).toBe(1);
		}
	});

	test('reads at most 201 rows with stable ordering and a validated, bounded offset', async () => {
		const queries: { sql: string; params: unknown[] }[] = [];
		const db = drizzle(async (sql, params) => { queries.push({ sql, params }); return { rows: [] }; }) as unknown as Database;
		const cases = [
			{ page: undefined, offset: 0 }, { page: 1, offset: 0 }, { page: 2, offset: 200 },
			{ page: 1_000_000, offset: 199_999_800 }, { page: 0, offset: 0 }, { page: -1, offset: 0 },
			{ page: 1.5, offset: 0 }, { page: NaN, offset: 0 }, { page: Infinity, offset: 0 },
			{ page: 1_000_001, offset: 0 }, { page: Number.MAX_SAFE_INTEGER + 1, offset: 0 }
		];
		for (const [index, { page, offset }] of cases.entries()) {
			expect(await readAdminStudentInvitations(db, page)).toEqual([]);
			const query = queries[index];
			expect(query.sql).toContain('order by "student_invitations"."created_at" desc, "students"."id" desc');
			expect(query.sql).toContain(' limit ');
			if (offset) expect(query.sql).toContain(' offset ');
			expect(query.params).toEqual(query.sql.includes(' offset ') ? [INVITATIONS_PAGE_SIZE + 1, offset] : [INVITATIONS_PAGE_SIZE + 1]);
		}
		expect(queries).toHaveLength(cases.length);
	});
});

describe('required enrollment profile', () => {
	test('trims editable names, accepts a real leap day, and ignores all system fields without mutating the form', () => {
		const form = enrollmentForm({ firstName: `  ${profile.firstName}  `, lastName: ` ${profile.lastName} `,
			email: 'attacker@example.test', classType: 'basic', status: 'active', isActive: 'true',
			id: 'forged-student', authUserId: 'forged-user', role: 'admin', emailVerified: 'true',
			createdAt: '1900-01-01', acceptedAt: '1900-01-01', tokenHash: 'forged', pin: '9999' });
		const before = [...form.entries()];
		expect(parseEnrollmentProfile(form, today)).toEqual(profile);
		expect([...form.entries()]).toEqual(before);
		expect(parseEnrollmentProfile(enrollmentForm({ dateOfBirth: today, gender: 'male' }), today)).toMatchObject({ dateOfBirth: today, gender: 'male' });
	});

	for (const field of ['firstName', 'lastName', 'dateOfBirth', 'gender']) {
		test(`requires ${field}, rejecting missing, blank, or uploaded values`, () => {
			for (const value of [undefined, '', '   ', new File([profile[field as keyof typeof profile]], 'field.txt')]) {
				const form = enrollmentForm();
				if (value === undefined) form.delete(field);
				else form.set(field, value);
				expect(() => parseEnrollmentProfile(form, today)).toThrow('invalid');
			}
		});
	}

	test('rejects impossible/future dates, unsupported gender, long names, and embedded controls', () => {
		const invalid: Record<string, string>[] = [
			{ dateOfBirth: '2023-02-29' }, { dateOfBirth: '2000-02-30' }, { dateOfBirth: '2026-10-09' },
			{ dateOfBirth: '0000-01-01' }, { dateOfBirth: '2000-2-29' }, { dateOfBirth: '2000-02-29T00:00:00Z' },
			{ gender: 'other' }, { gender: 'FEMALE' }, { firstName: 'a'.repeat(101) },
			{ firstName: 'María\nJosé' }, { lastName: 'Rivera\u0000' }, { firstName: 'A\u2028B' }
		];
		for (const overrides of invalid) expect(() => parseEnrollmentProfile(enrollmentForm(overrides), today)).toThrow('invalid');
		expect(isValidStudentName('a'.repeat(100))).toBe(true);
		for (const name of ['', '  ', ' Student', 'Student ', 'A\tB', 'A\u007fB', 'A\u0085B', 'A\u2029B']) expect(isValidStudentName(name)).toBe(false);
	});
});

describe('provisioning guards before database writes', () => {
	test('revalidates service inputs before hashing or opening a transaction', async () => {
		let databaseReads = 0, hashCalls = 0;
		const db = new Proxy({}, { get() { databaseReads++; throw new Error('Database must not be read'); } }) as Database;
		const hash = async () => { hashCalls++; return 'unused'; };
		const invalidRows: ImportedStudent[][] = [[], Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, index) => ({ ...row, email: `student-${index}@example.test` })),
			[{ ...row, firstName: '' }], [{ ...row, lastName: 'a'.repeat(101) }], [{ ...row, pin: '42' }],
			[{ ...row, email: 'STUDENT@example.test' }], [{ ...row, email: ' student@example.test ' }],
			[{ ...row, email: 'Student <student@example.test>' }], [{ ...row, email: 'bad@@example.test' }], [row, { ...row, row: 3 }]];
		for (const rows of invalidRows) await expect(provisionImportedStudents(db, 'admin', rows, options, hash, true)).rejects.toMatchObject({ code: 'invalid' });
		for (const invalid of [{ ...options, classType: 'other' }, { ...options, emailLanguage: 'fr' }]) {
			await expect(provisionImportedStudents(db, 'admin', [row], invalid as StudentImportOptions, hash, true)).rejects.toMatchObject({ code: 'invalid' });
		}
		expect(hashCalls).toBe(0);
		expect(databaseReads).toBe(0);
	});

	test('a later hash failure never opens the transaction or exposes partially prepared accounts', async () => {
		let databaseReads = 0;
		const db = new Proxy({}, { get() { databaseReads++; throw new Error('Database must not be read'); } }) as Database;
		const pins: string[] = [];
		await expect(provisionImportedStudents(db, 'admin', [row, { ...row, row: 3, email: 'other@example.test', pin: '0007' }], options, async (pin) => {
			pins.push(pin);
			if (pins.length === 2) throw new Error('Hash failure');
			return 'salted-hash';
		}, true)).rejects.toThrow('Hash failure');
		expect(pins).toEqual(['0042', '0007']);
		expect(databaseReads).toBe(0);
	});
});

describe('enrollment load and action boundaries', () => {
	test('anonymous, invalid-token, non-student, and mismatched-session loads never open the database', async () => {
		let databaseCalls = 0;
		const database = () => { databaseCalls++; throw new Error('Database must not be opened'); };
		const anonymous = { user: null, session: null };
		for (const viewer of [anonymous, locals('student'), locals('admin')]) {
			for (const invalid of [null, '', 'bad-token', `${token}\n`]) {
				expect(await loadStudentEnrollment(viewer, invalid, database)).toEqual({ state: 'invalid', student: null, returnTo: '/enroll' });
			}
		}
		expect(await loadStudentEnrollment(anonymous, token, database)).toMatchObject({ state: 'signIn', student: null });
		expect(await loadStudentEnrollment({ ...locals('student'), session: { userId: 'other' } } as AuthLocals, token, database)).toMatchObject({ state: 'signIn', student: null });
		expect(await loadStudentEnrollment(locals('admin'), token, database)).toMatchObject({ state: 'invalid', student: null });
		expect(await readStudentEnrollment({} as Database, 'student', 'bad-token')).toEqual({ state: 'invalid', student: null });
		expect(databaseCalls).toBe(0);
	});

	test('serialized public load data does not disclose the raw invitation token', async () => {
		const result = await loadStudentEnrollment({ user: null, session: null }, token, () => { throw new Error('Database must not be opened'); });
		expect(JSON.stringify(result)).not.toContain(token);
	});

	test('checks authentication, student role, session identity, and Origin before parsing the body or reading dependencies', async () => {
		const cases: { viewer: AuthLocals; requestOrigin?: string; status: number }[] = [
			{ viewer: { user: null, session: null }, requestOrigin: origin, status: 401 },
			{ viewer: { ...locals('student'), session: null }, requestOrigin: origin, status: 401 },
			{ viewer: { ...locals('student'), session: { userId: 'other' } } as AuthLocals, requestOrigin: origin, status: 401 },
			{ viewer: locals('admin'), requestOrigin: origin, status: 403 },
			{ viewer: locals('student'), status: 403 },
			{ viewer: locals('student'), requestOrigin: 'https://attacker.example.test', status: 403 },
			{ viewer: locals('student'), requestOrigin: 'http://students.example.test', status: 403 }
		];
		for (const { viewer, requestOrigin, status } of cases) {
			let parsed = 0, databaseCalls = 0;
			const request = new Request(`${origin}/enroll`, { method: 'POST', headers: requestOrigin ? { origin: requestOrigin } : {} });
			Object.defineProperty(request, 'formData', { value() { parsed++; throw new Error('Body must not be parsed'); } });
			await expect(completeEnrollmentAction(viewer, request, () => { databaseCalls++; throw new Error('Database must not be opened'); })).rejects.toMatchObject({ status });
			expect(parsed).toBe(0);
			expect(databaseCalls).toBe(0);
		}
	});

	test('invalid enrollment returns only safe failure codes and never consults storage', async () => {
		let databaseCalls = 0;
		const invalid: Record<string, string>[] = [{ token: 'bad-token' }, { firstName: '' }, { dateOfBirth: '' }, { gender: '' }];
		for (const overrides of invalid) {
			const request = new Request(`${origin}/enroll`, { method: 'POST', headers: { origin }, body: enrollmentForm({ ...overrides,
				email: 'attacker@example.test', classType: 'basic', role: 'admin', pin: '0042', tokenHash: 'forged-hash' }) });
			const result = await completeEnrollmentAction(locals('student'), request, () => { databaseCalls++; throw new Error('Database must not be opened'); });
			expect(result).toMatchObject({ status: 400, data: { enrollment: { success: false, error: 'token' in overrides ? 'invitation' : 'invalid' } } });
			const serialized = JSON.stringify(result);
			for (const privateValue of [token, '0042', 'attacker@example.test', 'forged-hash']) expect(serialized).not.toContain(privateValue);
		}
		expect(databaseCalls).toBe(0);
	});

	test('storage exceptions are not serialized, even if they contain credentials or tokens', async () => {
		const request = new Request(`${origin}/enroll`, { method: 'POST', headers: { origin }, body: enrollmentForm() });
		const result = await completeEnrollmentAction(locals('student'), request, () => { throw new StudentInvitationError('unavailable'); });
		expect(result).toMatchObject({ status: 400, data: { enrollment: { success: false, error: 'invitation' } } });
		const storageRequest = new Request(`${origin}/enroll`, { method: 'POST', headers: { origin }, body: enrollmentForm() });
		const failure = await completeEnrollmentAction(locals('student'), storageRequest, () => { throw new Error(`0042 ${token}`); });
		expect(failure).toMatchObject({ status: 500, data: { enrollment: { success: false, error: 'storage' } } });
		expect(JSON.stringify(failure)).not.toContain('0042');
		expect(JSON.stringify(failure)).not.toContain(token);
	});
});
