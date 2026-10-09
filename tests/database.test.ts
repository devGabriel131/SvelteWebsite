import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import type { TransactionSql } from 'postgres';
import type { DatabaseConnection } from '../src/lib/server/db/connection';
import { students, type NewStudent } from '../src/lib/server/db/schema';
import { openLocalDatabase, verifyLocalDatabase } from '../scripts/db/local-target';
import { migrateDatabase } from '../scripts/db/migrate';
import { fictitiousStudents, seedStudents } from '../scripts/db/seed';

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase('isolated PostgreSQL student schema', () => {
	let connection: DatabaseConnection;

	beforeAll(async () => {
		connection = await openLocalDatabase(databaseUrl, 'test');
		await migrateDatabase(connection.db);
	}, 30000);

	afterAll(async () => {
		await connection?.client.end();
	});

	async function withRollback(run: (transaction: TransactionSql) => Promise<void>) {
		const rollback = new Error('Roll back this test only');
		try {
			await connection.client.begin(async (transaction) => {
				await run(transaction);
				throw rollback;
			});
		} catch (error) {
			if (error !== rollback) throw error;
		}
	}

	async function insertRoster(transaction: TransactionSql, overrides: Partial<NewStudent> = {}) {
		const values = {
			firstName: 'María Elena',
			lastName: 'Del Río de Prueba',
			email: `db-test-${randomUUID()}@example.test`,
			classType: 'basic',
			status: 'active',
			dateOfBirth: null,
			gender: null,
			...overrides
		};
		const [student] = await transaction`
			INSERT INTO public.students
				(first_name, last_name, email, class_type, status, date_of_birth, gender)
			VALUES (${values.firstName}, ${values.lastName}, ${values.email}, ${values.classType},
				${values.status}, ${values.dateOfBirth}, ${values.gender})
			RETURNING *, created_at::text AS creation_text, updated_at::text AS update_text
		`;
		return student;
	}

	test('migrations apply and can be rerun without duplicate journal entries', async () => {
		const before = await connection.client`
			SELECT id, hash, created_at::text FROM drizzle.__drizzle_migrations ORDER BY id
		`;
		expect(before.length).toBeGreaterThanOrEqual(2);
		await migrateDatabase(connection.db);
		const after = await connection.client`
			SELECT id, hash, created_at::text FROM drizzle.__drizzle_migrations ORDER BY id
		`;
		expect([...after]).toEqual([...before]);
	});

	test('roster creation defaults to active and permits incomplete signup fields', async () => {
		await withRollback(async (transaction) => {
			const [student] = await transaction`
				INSERT INTO public.students (first_name, last_name, email, class_type)
				VALUES ('María Elena', 'Del Río de Prueba', ${`db-test-${randomUUID()}@example.test`}, 'basic')
				RETURNING *
			`;
			expect(student.id).toMatch(/^[0-9a-f-]{36}$/);
			expect(student.first_name).toBe('María Elena');
			expect(student.last_name).toBe('Del Río de Prueba');
			expect(student.status).toBe('active');
			expect(student.date_of_birth).toBeNull();
			expect(student.gender).toBeNull();
			expect(student.created_at).not.toBeNull();
			expect(student.updated_at).not.toBeNull();
		});
	});

	for (const field of ['firstName', 'lastName'] as const) {
		for (const blank of ['', ' \t\n ']) {
			test(`rejects blank ${field}: ${JSON.stringify(blank)}`, async () => {
				await withRollback(async (transaction) => {
					await expect(insertRoster(transaction, { [field]: blank })).rejects.toMatchObject({
						code: '23514'
					});
				});
			});
		}
	}

	for (const email of ['', ' \t ', 'missing-at', 'two@@example.test', 'a b@example.test', ' a@example.test ']) {
		test(`rejects structurally invalid email: ${JSON.stringify(email)}`, async () => {
			await withRollback(async (transaction) => {
				await expect(insertRoster(transaction, { email })).rejects.toMatchObject({ code: '23514' });
			});
		});
	}

	// postgres.js queries are lazy; convert them to promises before Bun's rejection matcher.
	for (const column of ['first_name', 'last_name', 'email', 'class_type', 'status', 'created_at'] as const) {
		test(`requires ${column}`, async () => {
			await withRollback(async (transaction) => {
				const student = await insertRoster(transaction);
				await expect(
					Promise.resolve(transaction.unsafe(
						`UPDATE public.students SET "${column}" = NULL WHERE id = $1`, [student.id]
					))
				).rejects.toMatchObject({ code: '23502' });
			});
		});
	}

	test('email uniqueness includes inactive profiles and compares case-insensitively', async () => {
		await withRollback(async (transaction) => {
			const email = `MixedCase-${randomUUID()}@Example.Test`;
			const student = await insertRoster(transaction, { email, status: 'inactive' });
			expect(student.email).toBe(email);
			await expect(insertRoster(transaction, { email: email.toLowerCase() })).rejects.toMatchObject({
				code: '23505',
				constraint_name: 'students_email_normalized_unique'
			});
		});
	});

	test('does not collapse plus-addresses or dots in distinct emails', async () => {
		await withRollback(async (transaction) => {
			const prefix = randomUUID();
			for (const suffix of ['student', 'stu.dent', 'student+practice']) {
				await insertRoster(transaction, { email: `${prefix}-${suffix}@example.test` });
			}
		});
	});

	for (const gender of ['male', 'female'] as const) {
		test(`accepts gender ${gender}`, async () => {
			await withRollback(async (transaction) => {
				expect((await insertRoster(transaction, { gender })).gender).toBe(gender);
			});
		});
	}

	for (const gender of ['', 'other', 'prefer_not_to_say']) {
		test(`rejects unapproved gender ${JSON.stringify(gender)}`, async () => {
			await withRollback(async (transaction) => {
				const student = await insertRoster(transaction);
				await expect(Promise.resolve(
					transaction`UPDATE public.students SET gender = ${gender} WHERE id = ${student.id}`
				)).rejects.toMatchObject({ code: '23514', constraint_name: 'students_gender_valid' });
			});
		});
	}

	test('rejects class types other than basic/regular', async () => {
		await withRollback(async (transaction) => {
			const student = await insertRoster(transaction);
			await expect(Promise.resolve(
				transaction`UPDATE public.students SET class_type = 'admin' WHERE id = ${student.id}`
			)).rejects.toMatchObject({ code: '23514', constraint_name: 'students_class_type_valid' });
		});
	});

	test('accepts a real leap-day birthday and today without imposing an age policy', async () => {
		await withRollback(async (transaction) => {
			const student = await insertRoster(transaction, { dateOfBirth: '2024-02-29' });
			await transaction`UPDATE public.students SET date_of_birth = CURRENT_DATE WHERE id = ${student.id}`;
		});
	});

	test('rejects impossible calendar dates', async () => {
		await withRollback(async (transaction) => {
			await expect(insertRoster(transaction, { dateOfBirth: '2023-02-29' })).rejects.toMatchObject({
				code: '22008'
			});
		});
	});

	test('rejects future birthdays', async () => {
		await withRollback(async (transaction) => {
			const student = await insertRoster(transaction);
			await expect(Promise.resolve(transaction`
				UPDATE public.students SET date_of_birth = CURRENT_DATE + 1 WHERE id = ${student.id}
			`)).rejects.toMatchObject({ code: '23514', constraint_name: 'students_date_of_birth_valid' });
		});
	});

	for (const dateOfBirth of ['infinity', '-infinity']) {
		test(`rejects nonfinite birthday ${dateOfBirth}`, async () => {
			await withRollback(async (transaction) => {
				await expect(insertRoster(transaction, { dateOfBirth })).rejects.toMatchObject({ code: '23514' });
			});
		});
	}

	test('raw SQL updates refresh updated_at, even within the insertion transaction', async () => {
		await withRollback(async (transaction) => {
			const student = await insertRoster(transaction);
			await transaction`SELECT pg_sleep(0.02)`;
			const [updated] = await transaction`
				UPDATE public.students SET class_type = 'regular', updated_at = '2000-01-01'
				WHERE id = ${student.id}
				RETURNING updated_at > ${student.update_text}::timestamptz AS timestamp_advanced,
					created_at = ${student.creation_text}::timestamptz AS creation_preserved
			`;
			expect(updated.timestamp_advanced).toBe(true);
			expect(updated.creation_preserved).toBe(true);
		});
	});

	test('status is the sole lifecycle field and preserves roster identity and fields', async () => {
		await withRollback(async (transaction) => {
			const student = await insertRoster(transaction, { dateOfBirth: '2000-01-01', gender: 'female' });
			for (const status of ['inactive', 'invited', 'active']) {
				const [updated] = await transaction`
					UPDATE public.students SET status = ${status} WHERE id = ${student.id} RETURNING *
				`;
				expect(updated.id).toBe(student.id);
				expect(updated.first_name).toBe(student.first_name);
				expect(updated.email).toBe(student.email);
				expect(updated.date_of_birth).toEqual(student.date_of_birth);
				expect(updated.gender).toBe(student.gender);
				expect(updated.status).toBe(status);
			}
			expect(await transaction`
				SELECT column_name FROM information_schema.columns
				WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'is_active'
			`).toHaveLength(0);
			expect(await transaction`
				SELECT tgname FROM pg_trigger
				WHERE tgrelid = 'public.students'::regclass AND tgname = 'students_sync_status'
			`).toHaveLength(0);
			await expect(Promise.resolve(transaction`
				UPDATE public.students SET status = 'unknown' WHERE id = ${student.id}
			`)).rejects.toMatchObject({ code: '23514', constraint_name: 'students_status_valid' });
		});
	});

	test('actual database identity is checked independently of the URL', async () => {
		await expect(verifyLocalDatabase(connection, {
			database: 'not_this_database', username: 'sveltewebsite_test', port: '5434'
		})).rejects.toThrow(/actual identity/);
	});

	test('seeding is idempotent and never overwrites existing fixture records', async () => {
		const inserted = await seedStudents(databaseUrl);
		try {
			if (inserted.length) {
				await connection.db.update(students).set({ status: 'inactive' }).where(eq(students.id, inserted[0].id));
			}
			const before = await connection.db.select().from(students).where(
				inArray(students.id, fictitiousStudents.map((student) => student.id!))
			);
			expect(before).toHaveLength(fictitiousStudents.length);
			expect(await seedStudents(databaseUrl)).toHaveLength(0);
			const after = await connection.db.select().from(students).where(
				inArray(students.id, fictitiousStudents.map((student) => student.id!))
			);
			expect(after).toEqual(before);
		} finally {
			if (inserted.length) {
				await connection.db.delete(students).where(inArray(students.id, inserted.map((student) => student.id)));
			}
		}
	});
});
