import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { TransactionSql } from 'postgres';
import { openLocalDatabase } from '../scripts/db/local-target';
import type { DatabaseConnection } from '../src/lib/server/db/connection';

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;
const conflictMessage = 'Conflicting student account links. Resolve associations before rerunning migrations.';
const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002',
	'00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000004'];

async function migrateIdentity(tx: TransactionSql) {
	const migration = await Bun.file(new URL('../drizzle/0011_student_accounts.sql', import.meta.url)).text();
	for (const statement of migration.split('--> statement-breakpoint')) {
		if (statement.trim()) await tx.unsafe(statement);
	}
}

async function legacyTables(tx: TransactionSql) {
	await tx`CREATE TEMP TABLE auth_user (id text PRIMARY KEY) ON COMMIT DROP`;
	await tx`CREATE TEMP TABLE students (
		id uuid PRIMARY KEY, auth_user_id text,
		CONSTRAINT students_auth_user_id_unique UNIQUE (auth_user_id),
		CONSTRAINT students_auth_user_id_auth_user_id_fk FOREIGN KEY (auth_user_id) REFERENCES auth_user(id) ON DELETE RESTRICT
	) ON COMMIT DROP`;
	await tx`CREATE TEMP TABLE bootcamp_accounts (
		user_id text PRIMARY KEY, student_id uuid NOT NULL, linked_by text NOT NULL,
		created_at timestamptz NOT NULL DEFAULT now(),
		CONSTRAINT bootcamp_accounts_student_id_unique UNIQUE (student_id),
		CONSTRAINT bootcamp_accounts_user_id_auth_user_id_fk FOREIGN KEY (user_id) REFERENCES auth_user(id) ON DELETE RESTRICT,
		CONSTRAINT bootcamp_accounts_student_id_students_id_fk FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT,
		CONSTRAINT bootcamp_accounts_linked_by_auth_user_id_fk FOREIGN KEY (linked_by) REFERENCES auth_user(id) ON DELETE RESTRICT
	) ON COMMIT DROP`;
	await tx`INSERT INTO auth_user VALUES ('invitation'), ('bootcamp'), ('dual'), ('operator'), ('unused')`;
}

async function legacyState(tx: TransactionSql) {
	return {
		students: [...await tx`SELECT id, auth_user_id FROM students ORDER BY id`],
		accounts: [...await tx`SELECT user_id, student_id, linked_by, created_at::text FROM bootcamp_accounts ORDER BY user_id`],
		tables: [...await tx`SELECT to_regclass('pg_temp.bootcamp_accounts')::text AS legacy,
			to_regclass('pg_temp.student_accounts')::text AS canonical`]
	};
}

describeDatabase('isolated PostgreSQL student identity migration', () => {
	let connection: DatabaseConnection;
	beforeAll(async () => { connection = await openLocalDatabase(databaseUrl, 'test'); });
	afterAll(async () => { await connection?.client.end(); });

	test('preserves the exact compatible union, legacy provenance and restrictive identity contracts', async () => {
		await connection.client.begin(async (tx) => {
			await legacyTables(tx);
			await tx`INSERT INTO students VALUES (${ids[0]}, 'invitation'), (${ids[1]}, NULL), (${ids[2]}, 'dual'), (${ids[3]}, NULL)`;
			await tx`INSERT INTO bootcamp_accounts VALUES ('bootcamp', ${ids[1]}, 'operator', '2004-02-29 12:34:56.123456+00'),
				('dual', ${ids[2]}, 'operator', '2010-10-10 10:10:10.654321+00')`;
			const oldAccounts = [...await tx`SELECT user_id, student_id, linked_by, created_at::text FROM bootcamp_accounts ORDER BY user_id`];
			await migrateIdentity(tx);
			expect([...await tx`SELECT user_id, student_id FROM student_accounts ORDER BY user_id`]).toEqual([
				{ user_id: 'bootcamp', student_id: ids[1] }, { user_id: 'dual', student_id: ids[2] },
				{ user_id: 'invitation', student_id: ids[0] }
			]);
			expect([...await tx`SELECT user_id, student_id, linked_by, created_at::text FROM student_accounts WHERE user_id <> 'invitation' ORDER BY user_id`]).toEqual(oldAccounts);
			expect([...await tx`SELECT linked_by, created_at FROM student_accounts WHERE user_id = 'invitation'`]).toEqual([{ linked_by: null, created_at: null }]);
			expect((await tx`SELECT count(*)::integer AS count FROM student_accounts WHERE student_id = ${ids[3]}`)[0].count).toBe(0);
			expect((await tx`SELECT to_regclass('pg_temp.bootcamp_accounts') IS NULL AS absent`)[0].absent).toBe(true);
			expect([...await tx`SELECT attname FROM pg_attribute WHERE attrelid = 'pg_temp.students'::regclass AND attname = 'auth_user_id' AND NOT attisdropped`]).toEqual([]);
			await expect(tx.savepoint(async (sp) => { await sp`INSERT INTO student_accounts VALUES ('invitation', ${ids[3]}, NULL, NULL)`; }))
				.rejects.toMatchObject({ code: '23505', constraint_name: 'student_accounts_pkey' });
			await expect(tx.savepoint(async (sp) => { await sp`INSERT INTO student_accounts VALUES ('unused', ${ids[0]}, NULL, NULL)`; }))
				.rejects.toMatchObject({ code: '23505', constraint_name: 'student_accounts_student_id_unique' });
			await expect(tx.savepoint(async (sp) => { await sp`INSERT INTO student_accounts VALUES ('missing', ${ids[3]}, NULL, NULL)`; }))
				.rejects.toMatchObject({ code: '23503', constraint_name: 'student_accounts_user_id_auth_user_id_fk' });
			await expect(tx.savepoint(async (sp) => { await sp`INSERT INTO student_accounts VALUES ('unused', 'ffffffff-ffff-4fff-8fff-ffffffffffff', NULL, NULL)`; }))
				.rejects.toMatchObject({ code: '23503', constraint_name: 'student_accounts_student_id_students_id_fk' });
			await expect(tx.savepoint(async (sp) => { await sp`INSERT INTO student_accounts VALUES ('unused', ${ids[3]}, 'missing', now())`; }))
				.rejects.toMatchObject({ code: '23503', constraint_name: 'student_accounts_linked_by_auth_user_id_fk' });
			await expect(tx.savepoint(async (sp) => { await sp`DELETE FROM auth_user WHERE id = 'invitation'`; })).rejects.toMatchObject({ code: '23001', constraint_name: 'student_accounts_user_id_auth_user_id_fk' });
			await expect(tx.savepoint(async (sp) => { await sp`DELETE FROM students WHERE id = ${ids[1]}`; })).rejects.toMatchObject({ code: '23001', constraint_name: 'student_accounts_student_id_students_id_fk' });
			await expect(tx.savepoint(async (sp) => { await sp`DELETE FROM auth_user WHERE id = 'operator'`; })).rejects.toMatchObject({ code: '23001', constraint_name: 'student_accounts_linked_by_auth_user_id_fk' });
			await expect(tx.savepoint(async (sp) => { await sp`UPDATE student_accounts SET linked_by = NULL WHERE user_id = 'dual'`; }))
				.rejects.toMatchObject({ code: '23514', constraint_name: 'student_accounts_link_provenance' });
			await expect(tx.savepoint(async (sp) => { await sp`UPDATE student_accounts SET created_at = now() WHERE user_id = 'invitation'`; }))
				.rejects.toMatchObject({ code: '23514', constraint_name: 'student_accounts_link_provenance' });
		});
	});

	for (const conflict of ['student', 'user'] as const) {
		test(`rejects conflicting ${conflict} links before DDL/backfill and rolls back without loss`, async () => {
			await connection.client.begin(async (tx) => {
				await legacyTables(tx);
				await tx`INSERT INTO students VALUES (${ids[0]}, 'invitation'), (${ids[1]}, NULL)`;
				await tx`INSERT INTO bootcamp_accounts VALUES (
					${conflict === 'student' ? 'bootcamp' : 'invitation'}, ${conflict === 'student' ? ids[0] : ids[1]},
					'operator', '2004-02-29 12:34:56.123456+00')`;
				const before = await legacyState(tx);
				await expect(tx.savepoint(migrateIdentity)).rejects.toMatchObject({ code: '23514', message: conflictMessage });
				expect(await legacyState(tx)).toEqual(before);
			});
		});
	}
});
