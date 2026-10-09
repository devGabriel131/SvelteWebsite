import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import type { DatabaseConnection } from '../src/lib/server/db/connection';
import { openLocalDatabase } from '../scripts/db/local-target';
import { migrateDatabase } from '../scripts/db/migrate';
import { seedSubjectScores, fixtureEmails } from '../scripts/db/seed-subject-scores';

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
suite('isolated subject-score storage', () => {
	let connection: DatabaseConnection;
	beforeAll(async () => {
		connection = await openLocalDatabase(url, 'test');
		await migrateDatabase(connection.db);
	}, 30000);
	afterAll(async () => { await connection?.client.end(); });

	test('enforces the student FK', async () => {
		await expect(Promise.resolve(connection.client`INSERT INTO student_subject_scores (student_id, ar, pc, wk, mk) VALUES (${randomUUID()}, 0, 100, 42, 61)`))
			.rejects.toMatchObject({ code: '23503' });
	});

	for (const column of ['ar', 'pc', 'wk', 'mk']) {
		test(`rejects out-of-range ${column}`, async () => {
			const rollback = new Error('rollback');
			try {
				await connection.client.begin(async (tx) => {
					const id = randomUUID();
					await tx`INSERT INTO students (id, first_name, last_name, email, class_type) VALUES (${id}, 'Score', 'Test', ${`${id}@example.test`}, 'basic')`;
					const scores = { ar: 1, pc: 2, wk: 3, mk: 4, [column]: 101 };
					await expect(Promise.resolve(tx`INSERT INTO student_subject_scores (student_id, ar, pc, wk, mk) VALUES (${id}, ${scores.ar}, ${scores.pc}, ${scores.wk}, ${scores.mk})`)).rejects.toMatchObject({ code: '23514' });
					throw rollback;
				});
			} catch (error) { if (error !== rollback) throw error; }
		});
	}

	test('stores boundary values, forbids duplicates/nonfixtures, and cascades deletion', async () => {
		const rollback = new Error('rollback');
		try {
			await connection.client.begin(async (tx) => {
				const id = randomUUID();
				await tx`INSERT INTO students (id, first_name, last_name, email, class_type) VALUES (${id}, 'Score', 'Test', ${`${id}@example.test`}, 'regular')`;
				await tx`INSERT INTO student_subject_scores (student_id, ar, pc, wk, mk) VALUES (${id}, 0, 100, 0, 100)`;
				for (const [value, code] of [[true, '23505'], [false, '23514']] as const) {
					await tx.savepoint(async (savepoint) => {
						await expect(Promise.resolve(savepoint`INSERT INTO student_subject_scores (student_id, ar, pc, wk, mk, is_fixture) VALUES (${id}, 0, 100, 0, 100, ${value})`)).rejects.toMatchObject({ code });
						throw rollback;
					}).catch((error) => { if (error !== rollback) throw error; });
				}
				await tx`DELETE FROM students WHERE id = ${id}`;
				expect(await tx`SELECT * FROM student_subject_scores WHERE student_id = ${id}`).toHaveLength(0);
				throw rollback;
			});
		} catch (error) { if (error !== rollback) throw error; }
	});

	test('requires the complete exact fixture roster and leaves unrelated students untouched', async () => {
		expect(fixtureEmails).toHaveLength(100);
		expect(new Set(fixtureEmails).size).toBe(100);
		const before = await connection.client`SELECT * FROM student_subject_scores ORDER BY student_id`;
		await expect(seedSubjectScores(url)).rejects.toThrow('Expected all 100 fictional Test students');
		expect(JSON.stringify(await connection.client`SELECT * FROM student_subject_scores ORDER BY student_id`)).toBe(JSON.stringify(before));
	});
});
