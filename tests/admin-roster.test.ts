import { describe, expect, test } from 'bun:test';
import { drizzle } from 'drizzle-orm/pg-proxy';
import { filterStudents, subjects, type AdminStudent } from '../src/lib/admin/roster';
import { readAdminRoster } from '../src/lib/server/admin-roster';
import type { Database } from '../src/lib/server/db/connection';

const student: AdminStudent = {
	id: '00000000-0000-4000-8000-000000000001', name: 'Alicia Rivera (Test)',
	firstName: 'Alicia', lastName: 'Rivera (Test)', dateOfBirth: null, gender: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
	email: 'fake.student.001@example.test', classType: 'basic', status: 'active', hasAccount: false,
	subjectScores: { ar: 0, pc: 100, wk: 42, mk: 61, isFixture: true }
};

describe('database-backed admin roster', () => {
	test('searches names, emails, IDs and class types without mutating records', () => {
		for (const query of ['  ALICIA  ', 'FAKE.STUDENT.001', student.id, 'basic']) {
			expect(filterStudents([student], query, 'all')).toEqual([student]);
		}
		expect(filterStudents([student], '', 'inactive')).toEqual([]);
		expect(filterStudents([student], 'unknown', 'all')).toEqual([]);
		expect(filterStudents([], '', 'all')).toEqual([]);
		expect(filterStudents([student], '', 'active')[0]).toBe(student);
	});

	test('left joins scores, retains ungraded students, and maps only actual roster fields', async () => {
		const queries: string[] = [];
		const db = drizzle(async (sql) => {
			queries.push(sql);
			return { rows: [
				[student.id, 'Alicia', 'Rivera (Test)', student.email, 'basic', 'active', null, null, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', student.id, 0, 100, 42, 61, true, '2026-01-01T00:00:00Z', false],
				['00000000-0000-4000-8000-000000000002', 'Mateo', 'Test', 'ungraded@example.test', 'regular', 'inactive', null, null, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', null, null, null, null, null, null, null, true]
			] };
		}) as unknown as Database;
		const roster = await readAdminRoster(db);
		expect(queries).toHaveLength(1);
		expect(queries[0]).toContain('left join "student_subject_scores"');
		expect(queries[0]).toContain('order by');
		expect(roster[0]).toEqual(student);
		expect(roster[1].subjectScores).toBeNull();
		expect(roster[1].status).toBe('inactive');
				expect(roster[1].hasAccount).toBe(true);
				expect(roster[0]).not.toHaveProperty('authUserId');
		expect(roster[0]).not.toHaveProperty('score');
		expect(roster[0]).not.toHaveProperty('progress');
		expect(subjects).toEqual(['ar', 'pc', 'wk', 'mk']);
	});
});
