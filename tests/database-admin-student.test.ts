import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { DatabaseConnection } from '../src/lib/server/db/connection';
import { students, studentSubjectScores } from '../src/lib/server/db/schema';
import { openLocalDatabase } from '../scripts/db/local-target';
import { migrateDatabase } from '../scripts/db/migrate';
import { updateAdminStudent } from '../src/lib/server/admin-student';
const url = process.env.TEST_DATABASE_URL;

function studentForm(overrides: Record<string, string> = {}) {
	const form = new FormData();
	for (const [key, value] of Object.entries({ id: '00000000-0000-4000-8000-000000000001', firstName: ' Alicia ', lastName: ' Rivera ', email: ' ALICIA@EXAMPLE.TEST ', dateOfBirth: '', gender: '', classType: 'regular', status: 'invited', ar: '0', pc: '100', wk: '42', mk: '61', ...overrides })) form.set(key, value);
	return form;
}

(url ? describe : describe.skip)('durable admin student edits', () => {
	let connection: DatabaseConnection;
	beforeAll(async () => {
		connection = await openLocalDatabase(url, 'test');
		await migrateDatabase(connection.db);
	}, 30000);
	afterAll(async () => { await connection?.client.end(); });
	test('lifecycle, profile and score persistence, uniqueness rollback, deletion and missing records', async () => {
		const id = randomUUID(), other = randomUUID();
		try {
			await connection.db.insert(students).values([
				{ id, firstName: 'Old', lastName: 'Test', email: `${id}@example.test`, classType: 'basic', status: 'inactive' },
				{ id: other, firstName: 'Other', lastName: 'Test', email: `${other}@example.test`, classType: 'basic' }
			]);
			const read = async () => (await connection.db.select().from(students).where(eq(students.id, id)))[0];
			expect(await read()).toMatchObject({ status: 'inactive' });
			const original = await read();
			await updateAdminStudent(connection.db, studentForm({ id, email: ` ${id.toUpperCase()}@EXAMPLE.TEST `, gender: 'female', dateOfBirth: '2000-02-29' }));
			expect(await read()).toMatchObject({ firstName: 'Alicia', lastName: 'Rivera', gender: 'female', dateOfBirth: '2000-02-29', classType: 'regular', status: 'invited', email: `${id}@example.test`, createdAt: original.createdAt });
			const score = async () => (await connection.db.select().from(studentSubjectScores).where(eq(studentSubjectScores.studentId, id)))[0];
			const before = await score();
			expect(before).toMatchObject({ studentId: id, ar: 0, pc: 100, isFixture: true });
			await expect(updateAdminStudent(connection.db, studentForm({ id, email: `${other}@EXAMPLE.TEST`, ar: '99' }))).rejects.toThrow();
			expect((await score()).ar).toBe(0);
			expect((await read()).email).toBe(`${id}@example.test`);
			await updateAdminStudent(connection.db, studentForm({ id, email: `${id}@example.test`, status: 'active', ar: '99' }));
			expect(await read()).toMatchObject({ status: 'active' });
			expect(await score()).toMatchObject({ ar: 99, createdAt: before.createdAt, isFixture: true });
			await connection.db.update(students).set({ status: 'inactive' }).where(eq(students.id, id));
			expect(await read()).toMatchObject({ status: 'inactive' });
			await updateAdminStudent(connection.db, studentForm({ id, email: `${id}@example.test`, ar: '', pc: '', wk: '', mk: '' }));
			expect(await score()).toBeUndefined();
			await expect(updateAdminStudent(connection.db, studentForm({ id: randomUUID() }))).rejects.toThrow('missing');
		} finally {
			await connection.db.delete(students).where(eq(students.id, id));
			await connection.db.delete(students).where(eq(students.id, other));
		}
	});
});
