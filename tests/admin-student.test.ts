import { describe, expect, test } from 'bun:test';
import { editStudentAction, parseStudentEdit } from '../src/lib/server/admin-student';
import { filterStudents, type AdminStudent } from '../src/lib/admin/roster';
function studentForm(overrides: Record<string, string> = {}) {
	const form = new FormData();
	for (const [key, value] of Object.entries({ id: '00000000-0000-4000-8000-000000000001', firstName: ' Alicia ', lastName: ' Rivera ', email: ' ALICIA@EXAMPLE.TEST ', dateOfBirth: '', gender: '', classType: 'regular', status: 'invited', ar: '0', pc: '100', wk: '42', mk: '61', ...overrides })) form.set(key, value);
	return form;
}
describe('student editing', () => {
	test('normalizes email and names, nullable fields, invited state and boundary scores', () => {
		expect(parseStudentEdit(studentForm())).toMatchObject({ profile: { firstName: 'Alicia', lastName: 'Rivera', email: 'alicia@example.test', dateOfBirth: null, gender: null, status: 'invited' }, scores: { ar: 0, pc: 100, wk: 42, mk: 61 } });
	});
	test('accepts a real leap day and blank score set', () => {
		expect(parseStudentEdit(studentForm({ dateOfBirth: '2000-02-29', ar: '', pc: '', wk: '', mk: '' })).scores).toBeNull();
	});
	test('retains broad roster IDs and exact birth-date boundaries', () => {
		const today = '2026-10-08';
		for (const id of ['ABCDEF12-3456-0789-0ABC-DEF012345678', '00000000-0000-ffff-ffff-000000000001']) {
			for (const dateOfBirth of ['0001-01-01', '2000-02-29', today]) {
				expect(parseStudentEdit(studentForm({ id, dateOfBirth }), today)).toMatchObject({ id, profile: { dateOfBirth } });
			}
		}
		for (const dateOfBirth of ['1900-02-29', '2000-2-29', '2000-02-29T00:00:00Z', '2026-10-09']) {
			expect(() => parseStudentEdit(studentForm({ dateOfBirth }), today)).toThrow('invalid');
		}
	});
	const invalidInputs: Record<string, string>[] = [{ firstName: ' ' }, { email: 'bad@@example.test' }, { dateOfBirth: '2023-02-29' }, { dateOfBirth: '9999-01-01' }, { dateOfBirth: '0000-01-01' }, { gender: 'unknown' }, { classType: 'other' }, { status: 'paused' }, { ar: '-1' }, { ar: '1.5' }, { ar: '101' }, { ar: '' }, { id: 'wrong' }];
		for (const override of invalidInputs) {
		test(`rejects ${JSON.stringify(override)}`, () => expect(() => parseStudentEdit(studentForm(override))).toThrow('invalid'));
	}
	test('ignores attempts to edit system identifiers and markers', () => {
		const value = parseStudentEdit(studentForm({ createdAt: '1900-01-01', isFixture: 'false', studentId: 'other', isActive: 'true' }));
		expect(value.profile).not.toHaveProperty('isActive');
		expect(value.profile).not.toHaveProperty('createdAt');
		expect(value.scores).not.toHaveProperty('isFixture');
	});
	test('filters invited students distinctly', () => {
		const student = { name: 'Alicia', email: 'a@example.test', id: 'id', classType: 'basic', status: 'invited' } as AdminStudent;
		expect(filterStudents([student], '', 'invited')).toEqual([student]);
		expect(filterStudents([student], '', 'active')).toEqual([]);
	});
	test('denied writes never read the body or open the database', async () => {
		let bodyReads = 0, databaseCalls = 0;
		const admin = { user: { id: 'a', role: 'admin' }, session: { userId: 'a' } } as App.Locals;
		const cases = [
			{ locals: { user: null, session: null }, origin: 'https://example.test', status: 401 },
			{ locals: { ...admin, session: { userId: 'other' } } as App.Locals, origin: 'https://example.test', status: 401 },
			{ locals: { ...admin, user: { id: 'a', role: 'student' } } as App.Locals, origin: 'https://example.test', status: 403 },
			{ locals: admin, origin: undefined, status: 403 },
			{ locals: admin, origin: 'https://attacker.example.test', status: 403 }
		];
		for (const { locals, origin, status } of cases) {
			const request = new Request('https://example.test/admin', { method: 'POST', headers: origin ? { origin } : {} });
			Object.defineProperty(request, 'formData', { value() { bodyReads++; throw new Error('Body must not be read'); } });
			await expect(editStudentAction(locals, request, () => { databaseCalls++; throw new Error('Database must not be opened'); })).rejects.toMatchObject({ status });
		}
		expect(bodyReads).toBe(0);
		expect(databaseCalls).toBe(0);
	});
});
