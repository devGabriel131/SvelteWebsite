import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { and, eq } from 'drizzle-orm';
import { students } from '../src/lib/server/db/schema';
import * as gameSchema from '../src/lib/server/db/game-schema';
import {
	studentWordProgress,
	vocabularyRoundProgress,
	studentVocabularyCompleteness,
	speedMathVerifiedBests,
	speedMathLeaderboardEntries
} from '../src/lib/server/db/views';
import { frequencyWords } from '../src/lib/frequency/vocabulary';
import { createDatabase, type DatabaseConnection } from '../src/lib/server/db/connection';
import { assertLocalDatabaseUrl, verifyLocalDatabase } from '../scripts/db/local-target';
import { migrateDatabase } from '../scripts/db/migrate';

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;
const startTime = '2026-01-01T10:00:00.000Z';
type Outcome = 'correct' | 'incorrect' | 'skipped';
type Operation = 'addition' | 'subtraction' | 'multiplication' | 'division';
type AttemptOptions = {
	id?: string;
	gameType?: 'speed_math' | 'frequency';
	rulesVersion?: string;
	startedAt?: string;
	endedAt?: string | null;
};
type SpeedMathOptions = Omit<AttemptOptions, 'gameType'> & {
	operation?: Operation;
	durationMinutes?: 5 | 10 | 15;
	correctCount?: number;
	incorrectCount?: number;
	verifiedAt?: string | null;
};

describeDatabase('isolated PostgreSQL game histories and derived progress', () => {
	let connection: DatabaseConnection;

	beforeAll(async () => {
		const target = assertLocalDatabaseUrl(databaseUrl!, 'test');
		connection = createDatabase(databaseUrl!);
		await verifyLocalDatabase(connection, target);
		await migrateDatabase(connection.db);
	}, 30000);

	afterAll(async () => {
		await connection?.client.end();
	});

	async function withRollback(run: (transaction: TransactionSql) => Promise<void>) {
		const rollback = new Error('Roll back this game test only');
		try {
			await connection.client.begin(async (transaction) => {
				await run(transaction);
				throw rollback;
			});
		} catch (error) {
			if (error !== rollback) throw error;
		}
	}

	async function expectDatabaseError(
		transaction: TransactionSql,
		run: (savepoint: TransactionSql) => PromiseLike<unknown>,
		code = '23514'
	) {
		// A rejected statement must not abort the surrounding fixture transaction.
		await expect(transaction.savepoint(async (savepoint) => {
			await run(savepoint);
		})).rejects.toMatchObject({ code });
	}

	async function insertStudent(transaction: TransactionSql): Promise<string> {
		const id = randomUUID();
		await transaction`
			INSERT INTO public.students (id, first_name, last_name, email, class_type)
			VALUES (${id}, 'Game', 'Integration Fixture', ${`db-games-${id}@example.test`}, 'basic')
		`;
		return id;
	}

	async function insertAttempt(
		transaction: TransactionSql,
		studentId: string,
		options: AttemptOptions = {}
	): Promise<string> {
		const id = options.id ?? randomUUID();
		await transaction`
			INSERT INTO public.game_attempts
				(id, student_id, game_type, rules_version, started_at, ended_at)
			VALUES (${id}, ${studentId}, ${options.gameType ?? 'frequency'},
				${options.rulesVersion ?? 'db-games-test-v1'}, ${options.startedAt ?? startTime},
				${options.endedAt ?? null})
		`;
		return id;
	}

	async function insertSpeedMath(
		transaction: TransactionSql,
		studentId: string,
		options: SpeedMathOptions = {}
	): Promise<string> {
		const startedAt = options.startedAt ?? startTime;
		const durationMinutes = options.durationMinutes ?? 5;
		const endedAt = options.endedAt === undefined
			? new Date(Date.parse(startedAt) + durationMinutes * 60000).toISOString()
			: options.endedAt;
		const verifiedAt = options.verifiedAt === undefined ? endedAt : options.verifiedAt;
		const id = await insertAttempt(transaction, studentId, {
			...options, gameType: 'speed_math', startedAt, endedAt
		});
		await transaction`
			INSERT INTO public.speed_math_results
				(attempt_id, operation, duration_minutes, correct_count, incorrect_count, verified_at)
			VALUES (${id}, ${options.operation ?? 'addition'}, ${durationMinutes},
				${options.correctCount ?? 10}, ${options.incorrectCount ?? 0}, ${verifiedAt})
		`;
		return id;
	}

	async function insertPool(transaction: TransactionSql, itemIds: string[]): Promise<string> {
		const id = `db-games-pool-${randomUUID()}`;
		await transaction`INSERT INTO public.vocabulary_pools (id) VALUES (${id})`;
		for (const [index, itemId] of itemIds.entries()) {
			await transaction`
				INSERT INTO public.vocabulary_pool_items (pool_id, item_id, rank)
				VALUES (${id}, ${itemId}, ${index + 1})
			`;
		}
		return id;
	}

	async function createPool(transaction: TransactionSql, size = 2) {
		const itemIds = Array.from({ length: size }, () => randomUUID());
		for (const id of itemIds) {
			await transaction`INSERT INTO public.vocabulary_items (id) VALUES (${id})`;
		}
		return { id: await insertPool(transaction, itemIds), itemIds };
	}

	async function insertRound(
		transaction: TransactionSql,
		studentId: string,
		poolId: string,
		options: AttemptOptions = {}
	): Promise<string> {
		const id = await insertAttempt(transaction, studentId, options);
		await transaction`
			INSERT INTO public.vocabulary_rounds (attempt_id, pool_id) VALUES (${id}, ${poolId})
		`;
		return id;
	}

	async function insertResponse(
		transaction: TransactionSql,
		attemptId: string,
		poolId: string,
		itemId: string,
		cardPosition: number,
		outcome: Outcome = 'correct',
		answeredAt = startTime
	) {
		await transaction`
			INSERT INTO public.vocabulary_responses
				(attempt_id, card_position, pool_id, item_id, outcome, answered_at)
			VALUES (${attemptId}, ${cardPosition}, ${poolId}, ${itemId}, ${outcome}, ${answeredAt})
		`;
	}

	async function completeness(transaction: TransactionSql, studentId: string, poolId: string) {
		const rows = await transaction`
			SELECT total_items::integer, practiced_items::integer, successful_items::integer,
				full_passes_completed::integer, current_pass::integer, current_pass_completed_items::integer
			FROM public.student_vocabulary_completeness
			WHERE student_id = ${studentId} AND pool_id = ${poolId}
		`;
		expect(rows).toHaveLength(1);
		return rows[0];
	}

	async function wordProgress(transaction: TransactionSql, studentId: string, itemId: string) {
		const rows = await transaction`
			SELECT correct_count::integer, incorrect_count::integer, skipped_count::integer,
				last_outcome, last_practiced_at::text
			FROM public.student_word_progress WHERE student_id = ${studentId} AND item_id = ${itemId}
		`;
		expect(rows).toHaveLength(1);
		return rows[0];
	}

	test('initial frequency-v1 membership matches every bundled permanent UUID and rank', async () => {
		const rows = await connection.client`
			SELECT membership.item_id AS id, membership.rank, item.id AS catalog_id
			FROM public.vocabulary_pool_items AS membership
			JOIN public.vocabulary_items AS item ON item.id = membership.item_id
			WHERE membership.pool_id = 'frequency-v1' ORDER BY membership.rank
		`;
		expect(rows).toHaveLength(1001);
		expect(rows.map(({ id, rank }) => ({ id, rank }))).toEqual(
			frequencyWords.map(({ id, rank }) => ({ id, rank }))
		);
		for (const row of rows) expect(row.catalog_id).toBe(row.id);
	});

	test('progress and leaderboard outputs are views with bigint counts and ranks', async () => {
		const countsByView = {
			student_word_progress: ['correct_count', 'incorrect_count', 'skipped_count'],
			vocabulary_round_progress: ['response_count', 'correct_count', 'incorrect_count', 'skipped_count'],
			student_vocabulary_completeness: [
				'total_items', 'practiced_items', 'successful_items', 'full_passes_completed',
				'current_pass', 'current_pass_completed_items'
			],
			speed_math_verified_bests: [],
			speed_math_leaderboard_entries: ['rank']
		};
		for (const [view, columns] of Object.entries(countsByView)) {
			const [table] = await connection.client`
				SELECT table_type FROM information_schema.tables
				WHERE table_schema = 'public' AND table_name = ${view}
			`;
			expect(table?.table_type).toBe('VIEW');
			for (const column of columns) {
				const [field] = await connection.client`
					SELECT data_type FROM information_schema.columns
					WHERE table_schema = 'public' AND table_name = ${view} AND column_name = ${column}
				`;
				expect(field?.data_type).toBe('bigint');
			}
		}
	});

	test('typed Drizzle views map bigint counts/ranks to numbers and timestamps to dates', async () => {
		const rollback = new Error('Roll back the typed ORM fixtures');
		try {
			await connection.db.transaction(async (db) => {
				const studentId = randomUUID();
				const poolId = `db-games-orm-${studentId}`;
				const itemIds = [randomUUID(), randomUUID()];
				const roundId = randomUUID();
				const mathId = randomUUID();
				const startedAt = new Date(startTime);
				const endedAt = new Date(startedAt.getTime() + 5 * 60000);
				await db.insert(students).values({
					id: studentId, firstName: 'Typed', lastName: 'ORM Fixture',
					email: `db-games-${studentId}@example.test`, classType: 'basic'
				});
				await db.insert(gameSchema.vocabularyItems).values(itemIds.map((id) => ({ id })));
				await db.insert(gameSchema.vocabularyPools).values({ id: poolId });
				await db.insert(gameSchema.vocabularyPoolItems).values(
					itemIds.map((itemId, index) => ({ poolId, itemId, rank: index + 1 }))
				);
				await db.insert(gameSchema.gameAttempts).values([
					{ id: roundId, studentId, gameType: 'frequency', rulesVersion: 'orm-v1', startedAt },
					{ id: mathId, studentId, gameType: 'speed_math', rulesVersion: 'orm-v1', startedAt, endedAt }
				]);
				await db.insert(gameSchema.vocabularyRounds).values({ attemptId: roundId, poolId });
				await db.insert(gameSchema.vocabularyResponses).values([
					{ attemptId: roundId, poolId, itemId: itemIds[0], cardPosition: 1, outcome: 'correct', answeredAt: startedAt },
					{ attemptId: roundId, poolId, itemId: itemIds[0], cardPosition: 2, outcome: 'skipped', answeredAt: startedAt }
				]);
				await db.insert(gameSchema.speedMathResults).values({
					attemptId: mathId, operation: 'addition', durationMinutes: 5,
					correctCount: 10, incorrectCount: 0, verifiedAt: endedAt
				});

				const [word] = await db.select().from(studentWordProgress)
					.where(eq(studentWordProgress.studentId, studentId));
				expect(word).toMatchObject({ correctCount: 1, incorrectCount: 0, skippedCount: 1, lastOutcome: 'skipped' });
				expect(word.lastPracticedAt).toBeInstanceOf(Date);

				const [round] = await db.select().from(vocabularyRoundProgress)
					.where(eq(vocabularyRoundProgress.attemptId, roundId));
				expect(round).toMatchObject({ responseCount: 2, correctCount: 1, skippedCount: 1, isComplete: false });

				const [coverage] = await db.select().from(studentVocabularyCompleteness)
					.where(and(
						eq(studentVocabularyCompleteness.studentId, studentId),
						eq(studentVocabularyCompleteness.poolId, poolId)
					));
				expect(coverage).toMatchObject({
					totalItems: 2, practicedItems: 1, successfulItems: 1,
					fullPassesCompleted: 0, currentPass: 1, currentPassCompletedItems: 1
				});

				const [best] = await db.select().from(speedMathVerifiedBests)
					.where(eq(speedMathVerifiedBests.studentId, studentId));
				expect(best).toMatchObject({ correctCount: 10, incorrectCount: 0, durationMinutes: 5 });
				expect(best.endedAt).toBeInstanceOf(Date);
				expect(best.verifiedAt).toBeInstanceOf(Date);

				const [entry] = await db.select().from(speedMathLeaderboardEntries)
					.where(eq(speedMathLeaderboardEntries.studentId, studentId));
				expect(entry.rank).toBe(1);
				throw rollback;
			});
		} catch (error) {
			if (error !== rollback) throw error;
		}
	});

	test('attempt identity and creation time default, while end time remains optional', async () => {
		await withRollback(async (transaction) => {
			const studentId = await insertStudent(transaction);
			const [attempt] = await transaction`
				INSERT INTO public.game_attempts (student_id, game_type, rules_version, started_at)
				VALUES (${studentId}, 'frequency', 'db-games-test-v1', ${startTime}) RETURNING *
			`;
			expect(attempt.id).toMatch(/^[0-9a-f-]{36}$/);
			expect(attempt.created_at).not.toBeNull();
			expect(attempt.ended_at).toBeNull();
			await transaction`
				UPDATE public.game_attempts SET ended_at = started_at WHERE id = ${attempt.id}
			`;
		});
	});

	test('attempts reject missing owners, blank rules, unknown games, and invalid timestamps', async () => {
		await withRollback(async (transaction) => {
			const studentId = await insertStudent(transaction);
			const id = await insertAttempt(transaction, studentId);
			await expectDatabaseError(transaction, (sql) => sql`
				INSERT INTO public.game_attempts (student_id, game_type, rules_version, started_at)
				VALUES (${randomUUID()}, 'frequency', 'db-games-test-v1', ${startTime})
			`, '23503');
			for (const gameType of ['', 'other', 'speed-math']) {
				await expectDatabaseError(transaction, (sql) => sql`
					UPDATE public.game_attempts SET game_type = ${gameType} WHERE id = ${id}
				`);
			}
			for (const rulesVersion of ['', ' \t\n ']) {
				await expectDatabaseError(transaction, (sql) => sql`
					UPDATE public.game_attempts SET rules_version = ${rulesVersion} WHERE id = ${id}
				`);
			}
			for (const column of ['started_at', 'ended_at']) {
				for (const value of ['infinity', '-infinity']) {
					await expectDatabaseError(transaction, (sql) => sql.unsafe(
						`UPDATE public.game_attempts SET ${column} = $1 WHERE id = $2`, [value, id]
					));
				}
			}
			await expectDatabaseError(transaction, (sql) => sql`
				UPDATE public.game_attempts SET ended_at = started_at - interval '1 millisecond' WHERE id = ${id}
			`);
			for (const column of ['id', 'student_id', 'game_type', 'rules_version', 'started_at']) {
				await expectDatabaseError(transaction, (sql) => sql.unsafe(
					`UPDATE public.game_attempts SET ${column} = NULL WHERE id = $1`, [id]
				), '23502');
			}
		});
	});

	test('child results cannot attach to another game or override their discriminator', async () => {
		await withRollback(async (transaction) => {
			const studentId = await insertStudent(transaction);
			const frequencyId = await insertAttempt(transaction, studentId);
			const mathId = await insertAttempt(transaction, studentId, { gameType: 'speed_math' });
			const pool = await createPool(transaction);
			await expectDatabaseError(transaction, (sql) => sql`
				INSERT INTO public.speed_math_results
					(attempt_id, operation, duration_minutes, correct_count, incorrect_count)
				VALUES (${frequencyId}, 'addition', 5, 0, 0)
			`, '23503');
			await expectDatabaseError(transaction, (sql) => sql`
				INSERT INTO public.vocabulary_rounds (attempt_id, pool_id) VALUES (${mathId}, ${pool.id})
			`, '23503');
			await expectDatabaseError(transaction, (sql) => sql`
				INSERT INTO public.speed_math_results
					(attempt_id, game_type, operation, duration_minutes, correct_count, incorrect_count)
				VALUES (${frequencyId}, 'frequency', 'addition', 5, 0, 0)
			`);
			await expectDatabaseError(transaction, (sql) => sql`
				INSERT INTO public.vocabulary_rounds (attempt_id, game_type, pool_id)
				VALUES (${mathId}, 'speed_math', ${pool.id})
			`);
			await expectDatabaseError(transaction, (sql) => sql`
				INSERT INTO public.speed_math_results
					(attempt_id, operation, duration_minutes, correct_count, incorrect_count)
				VALUES (${randomUUID()}, 'addition', 5, 0, 0)
			`, '23503');
		});
	});

	test('math results require valid operations, approved durations, nonnegative counts, and finite verification', async () => {
		await withRollback(async (transaction) => {
			const id = await insertSpeedMath(transaction, await insertStudent(transaction), {
				correctCount: 0, incorrectCount: 0, verifiedAt: null
			});
			for (const operation of ['', 'modulo', 'Addition']) {
				await expectDatabaseError(transaction, (sql) => sql`
					UPDATE public.speed_math_results SET operation = ${operation} WHERE attempt_id = ${id}
				`);
			}
			for (const duration of [0, 1, 4, 6, 16]) {
				await expectDatabaseError(transaction, (sql) => sql`
					UPDATE public.speed_math_results SET duration_minutes = ${duration} WHERE attempt_id = ${id}
				`);
			}
			for (const column of ['correct_count', 'incorrect_count']) {
				await expectDatabaseError(transaction, (sql) => sql.unsafe(
					`UPDATE public.speed_math_results SET ${column} = -1 WHERE attempt_id = $1`, [id]
				));
			}
			for (const verifiedAt of ['infinity', '-infinity']) {
				await expectDatabaseError(transaction, (sql) => sql`
					UPDATE public.speed_math_results SET verified_at = ${verifiedAt} WHERE attempt_id = ${id}
				`);
			}
			for (const column of ['attempt_id', 'game_type', 'operation', 'duration_minutes', 'correct_count', 'incorrect_count']) {
				await expectDatabaseError(transaction, (sql) => sql.unsafe(
					`UPDATE public.speed_math_results SET ${column} = NULL WHERE attempt_id = $1`, [id]
				), '23502');
			}
		});
	});

	test('math counts and verification have no defaults; omitted counts cannot silently become scores', async () => {
		await withRollback(async (transaction) => {
			const studentId = await insertStudent(transaction);
			const id = await insertAttempt(transaction, studentId, { gameType: 'speed_math' });
			for (const column of ['correct_count', 'incorrect_count', 'verified_at']) {
				const [field] = await transaction`
					SELECT column_default FROM information_schema.columns
					WHERE table_schema = 'public' AND table_name = 'speed_math_results' AND column_name = ${column}
				`;
				expect(field.column_default).toBeNull();
			}
			await expectDatabaseError(transaction, (sql) => sql`
				INSERT INTO public.speed_math_results (attempt_id, operation, duration_minutes, incorrect_count)
				VALUES (${id}, 'addition', 5, 0)
			`, '23502');
			await expectDatabaseError(transaction, (sql) => sql`
				INSERT INTO public.speed_math_results (attempt_id, operation, duration_minutes, correct_count)
				VALUES (${id}, 'addition', 5, 0)
			`, '23502');
			const [result] = await transaction`
				INSERT INTO public.speed_math_results
					(attempt_id, operation, duration_minutes, correct_count, incorrect_count)
				VALUES (${id}, 'addition', 5, 0, 0) RETURNING game_type, verified_at
			`;
			expect(result.game_type).toBe('speed_math');
			expect(result.verified_at).toBeNull();
			await expectDatabaseError(transaction, (sql) => sql`
				INSERT INTO public.speed_math_results
					(attempt_id, operation, duration_minutes, correct_count, incorrect_count)
				VALUES (${id}, 'addition', 5, 0, 0)
			`, '23505');
		});
	});

	test('catalog identity must be supplied, and pool membership enforces owners, positive ranks, and uniqueness', async () => {
		await withRollback(async (transaction) => {
			await expectDatabaseError(transaction, (sql) => sql`
				INSERT INTO public.vocabulary_items DEFAULT VALUES
			`, '23502');
			for (const id of ['', ' \t\n ']) {
				await expectDatabaseError(transaction, (sql) => sql`
					INSERT INTO public.vocabulary_pools (id) VALUES (${id})
				`);
			}
			const pool = await createPool(transaction);
			for (const rank of [0, -1]) {
				await expectDatabaseError(transaction, (sql) => sql`
					UPDATE public.vocabulary_pool_items SET rank = ${rank}
					WHERE pool_id = ${pool.id} AND item_id = ${pool.itemIds[0]}
				`);
			}
			const extraId = randomUUID();
			await transaction`INSERT INTO public.vocabulary_items (id) VALUES (${extraId})`;
			await expectDatabaseError(transaction, (sql) => sql`
				INSERT INTO public.vocabulary_pool_items (pool_id, item_id, rank) VALUES (${pool.id}, ${extraId}, 1)
			`, '23505');
			await expectDatabaseError(transaction, (sql) => sql`
				INSERT INTO public.vocabulary_pool_items (pool_id, item_id, rank) VALUES (${pool.id}, ${pool.itemIds[0]}, 3)
			`, '23505');
			await expectDatabaseError(transaction, (sql) => sql`
				INSERT INTO public.vocabulary_pool_items (pool_id, item_id, rank) VALUES (${pool.id}, ${randomUUID()}, 3)
			`, '23503');
			await expectDatabaseError(transaction, (sql) => sql`
				INSERT INTO public.vocabulary_pool_items (pool_id, item_id, rank) VALUES (${randomUUID()}, ${extraId}, 1)
			`, '23503');
			for (const column of ['pool_id', 'item_id', 'rank']) {
				await expectDatabaseError(transaction, (sql) => sql.unsafe(
					`UPDATE public.vocabulary_pool_items SET ${column} = NULL WHERE pool_id = $1 AND item_id = $2`,
					[pool.id, pool.itemIds[0]]
				), '23502');
			}
		});
	});

	test('rounds require an existing attempt and pool and cannot duplicate an attempt', async () => {
		await withRollback(async (transaction) => {
			const studentId = await insertStudent(transaction);
			const pool = await createPool(transaction);
			const id = await insertRound(transaction, studentId, pool.id);
			const [round] = await transaction`SELECT game_type FROM public.vocabulary_rounds WHERE attempt_id = ${id}`;
			expect(round.game_type).toBe('frequency');
			await expectDatabaseError(transaction, (sql) => sql`
				INSERT INTO public.vocabulary_rounds (attempt_id, pool_id) VALUES (${id}, ${pool.id})
			`, '23505');
			await expectDatabaseError(transaction, (sql) => sql`
				INSERT INTO public.vocabulary_rounds (attempt_id, pool_id) VALUES (${randomUUID()}, ${pool.id})
			`, '23503');
			const unusedId = await insertAttempt(transaction, studentId);
			await expectDatabaseError(transaction, (sql) => sql`
				INSERT INTO public.vocabulary_rounds (attempt_id, pool_id) VALUES (${unusedId}, ${randomUUID()})
			`, '23503');
			for (const column of ['attempt_id', 'game_type', 'pool_id']) {
				await expectDatabaseError(transaction, (sql) => sql.unsafe(
					`UPDATE public.vocabulary_rounds SET ${column} = NULL WHERE attempt_id = $1`, [id]
				), '23502');
			}
		});
	});

	test('responses must belong to the round pool and to a member of that exact pool', async () => {
		await withRollback(async (transaction) => {
			const studentId = await insertStudent(transaction);
			const pool = await createPool(transaction);
			const otherPool = await createPool(transaction, 1);
			const sharedPool = await insertPool(transaction, [pool.itemIds[0]]);
			const id = await insertRound(transaction, studentId, pool.id);
			for (const [attemptId, poolId, itemId] of [
				[randomUUID(), pool.id, pool.itemIds[0]],
				[id, sharedPool, pool.itemIds[0]],
				[id, pool.id, otherPool.itemIds[0]],
				[id, pool.id, randomUUID()]
			]) {
				await expectDatabaseError(transaction, (sql) => sql`
					INSERT INTO public.vocabulary_responses
						(attempt_id, card_position, pool_id, item_id, outcome, answered_at)
					VALUES (${attemptId}, 1, ${poolId}, ${itemId}, 'correct', ${startTime})
				`, '23503');
			}
		});
	});

	test('responses enforce positions 1 through 25, explicit outcomes, and finite answer timestamps', async () => {
		await withRollback(async (transaction) => {
			const pool = await createPool(transaction);
			const id = await insertRound(transaction, await insertStudent(transaction), pool.id);
			await insertResponse(transaction, id, pool.id, pool.itemIds[0], 1);
			for (const position of [-1, 0, 26]) {
				await expectDatabaseError(transaction, (sql) => sql`
					UPDATE public.vocabulary_responses SET card_position = ${position} WHERE attempt_id = ${id}
				`);
			}
			for (const outcome of ['', 'pending', 'Correct']) {
				await expectDatabaseError(transaction, (sql) => sql`
					UPDATE public.vocabulary_responses SET outcome = ${outcome} WHERE attempt_id = ${id}
				`);
			}
			for (const answeredAt of ['infinity', '-infinity']) {
				await expectDatabaseError(transaction, (sql) => sql`
					UPDATE public.vocabulary_responses SET answered_at = ${answeredAt} WHERE attempt_id = ${id}
				`);
			}
			for (const column of ['attempt_id', 'card_position', 'pool_id', 'item_id', 'outcome', 'answered_at']) {
				await expectDatabaseError(transaction, (sql) => sql.unsafe(
					`UPDATE public.vocabulary_responses SET ${column} = NULL WHERE attempt_id = $1`, [id]
				), '23502');
			}
		});
	});

	test('retrying the same attempt and card never creates history or increments counts twice', async () => {
		await withRollback(async (transaction) => {
			const studentId = await insertStudent(transaction);
			const pool = await createPool(transaction);
			const id = await insertRound(transaction, studentId, pool.id);
			await insertResponse(transaction, id, pool.id, pool.itemIds[0], 1);
			await expectDatabaseError(transaction, (sql) => sql`
				INSERT INTO public.game_attempts (id, student_id, game_type, rules_version, started_at)
				VALUES (${id}, ${studentId}, 'frequency', 'db-games-test-v1', ${startTime})
			`, '23505');
			const attempts = await transaction`
				INSERT INTO public.game_attempts (id, student_id, game_type, rules_version, started_at)
				VALUES (${id}, ${studentId}, 'frequency', 'conflicting-retry', ${startTime})
				ON CONFLICT (id) DO NOTHING RETURNING id
			`;
			expect(attempts).toHaveLength(0);
			const [attempt] = await transaction`SELECT rules_version FROM public.game_attempts WHERE id = ${id}`;
			expect(attempt.rules_version).toBe('db-games-test-v1');
			await expectDatabaseError(transaction, (sql) => sql`
				INSERT INTO public.vocabulary_responses
					(attempt_id, card_position, pool_id, item_id, outcome, answered_at)
				VALUES (${id}, 1, ${pool.id}, ${pool.itemIds[0]}, 'correct', ${startTime})
			`, '23505');
			for (const outcome of ['correct', 'incorrect']) {
				const cards = await transaction`
					INSERT INTO public.vocabulary_responses
						(attempt_id, card_position, pool_id, item_id, outcome, answered_at)
					VALUES (${id}, 1, ${pool.id}, ${pool.itemIds[0]}, ${outcome}, ${startTime})
					ON CONFLICT (attempt_id, card_position) DO NOTHING RETURNING card_position
				`;
				expect(cards).toHaveLength(0);
			}
			const [history] = await transaction`
				SELECT count(*)::integer AS responses FROM public.vocabulary_responses WHERE attempt_id = ${id}
			`;
			expect(history.responses).toBe(1);
			expect(await wordProgress(transaction, studentId, pool.itemIds[0])).toMatchObject({
				correct_count: 1, incorrect_count: 0, skipped_count: 0, last_outcome: 'correct'
			});
		});
	});

	test('repeated words count at distinct card positions, skips remain separate, and ended partial rounds persist', async () => {
		await withRollback(async (transaction) => {
			const studentId = await insertStudent(transaction);
			const otherStudentId = await insertStudent(transaction);
			const pool = await createPool(transaction);
			const id = await insertRound(transaction, studentId, pool.id, { endedAt: '2026-01-01T10:01:00Z' });
			const [emptyRound] = await transaction`
				SELECT response_count::integer, is_complete FROM public.vocabulary_round_progress WHERE attempt_id = ${id}
			`;
			expect(emptyRound).toEqual({ response_count: 0, is_complete: false });
			for (const [index, outcome] of (['correct', 'correct', 'incorrect', 'skipped'] as const).entries()) {
				await insertResponse(transaction, id, pool.id, pool.itemIds[0], index + 1, outcome);
			}
			const otherRound = await insertRound(transaction, otherStudentId, pool.id);
			await insertResponse(transaction, otherRound, pool.id, pool.itemIds[0], 1);
			const [round] = await transaction`
				SELECT attempt_id, student_id, pool_id, response_count::integer, correct_count::integer,
					incorrect_count::integer, skipped_count::integer, is_complete
				FROM public.vocabulary_round_progress WHERE attempt_id = ${id}
			`;
			expect(round).toEqual({
				attempt_id: id, student_id: studentId, pool_id: pool.id, response_count: 4,
				correct_count: 2, incorrect_count: 1, skipped_count: 1, is_complete: false
			});
			expect(await wordProgress(transaction, studentId, pool.itemIds[0])).toMatchObject({
				correct_count: 2, incorrect_count: 1, skipped_count: 1
			});
			expect(await wordProgress(transaction, otherStudentId, pool.itemIds[0])).toMatchObject({
				correct_count: 1, incorrect_count: 0, skipped_count: 0
			});
			const absent = await transaction`
				SELECT * FROM public.student_word_progress WHERE student_id = ${studentId} AND item_id = ${pool.itemIds[1]}
			`;
			expect(absent).toHaveLength(0);
			const [history] = await transaction`
				SELECT count(*)::integer AS responses FROM public.vocabulary_responses WHERE attempt_id = ${id}
			`;
			expect(history.responses).toBe(4);
		});
	});

	test('a round becomes complete at 25 responses regardless of outcome or end time', async () => {
		await withRollback(async (transaction) => {
			const pool = await createPool(transaction, 1);
			const id = await insertRound(transaction, await insertStudent(transaction), pool.id);
			const outcomes: Outcome[] = ['correct', 'incorrect', 'skipped'];
			for (let position = 1; position <= 24; position++) {
				await insertResponse(transaction, id, pool.id, pool.itemIds[0], position, outcomes[(position - 1) % 3]);
			}
			const [partial] = await transaction`
				SELECT response_count::integer, is_complete FROM public.vocabulary_round_progress WHERE attempt_id = ${id}
			`;
			expect(partial).toEqual({ response_count: 24, is_complete: false });
			await insertResponse(transaction, id, pool.id, pool.itemIds[0], 25);
			const [complete] = await transaction`
				SELECT response_count::integer, correct_count::integer, incorrect_count::integer,
					skipped_count::integer, is_complete FROM public.vocabulary_round_progress WHERE attempt_id = ${id}
			`;
			expect(complete).toEqual({
				response_count: 25, correct_count: 9, incorrect_count: 8, skipped_count: 8, is_complete: true
			});
		});
	});

	test('last outcome follows answer time rather than insertion time, position, or attempt start', async () => {
		await withRollback(async (transaction) => {
			const studentId = await insertStudent(transaction);
			const pool = await createPool(transaction, 1);
			const earlierAttempt = await insertRound(transaction, studentId, pool.id);
			const laterAttempt = await insertRound(transaction, studentId, pool.id, { startedAt: '2026-01-02T10:00:00Z' });
			const latestAnswer = '2026-01-03T12:00:00Z';
			await insertResponse(transaction, earlierAttempt, pool.id, pool.itemIds[0], 1, 'skipped', latestAnswer);
			await insertResponse(transaction, laterAttempt, pool.id, pool.itemIds[0], 25, 'incorrect', '2026-01-02T12:00:00Z');
			await insertResponse(transaction, earlierAttempt, pool.id, pool.itemIds[0], 2, 'correct', '2026-01-01T12:00:00Z');
			expect(await wordProgress(transaction, studentId, pool.itemIds[0])).toMatchObject({
				correct_count: 1, incorrect_count: 1, skipped_count: 1, last_outcome: 'skipped'
			});
			const [latest] = await transaction`
				SELECT last_practiced_at = ${latestAnswer}::timestamptz AS matches
				FROM public.student_word_progress WHERE student_id = ${studentId} AND item_id = ${pool.itemIds[0]}
			`;
			expect(latest.matches).toBe(true);
		});
	});

	test('tied answer times have deterministic last outcomes independent of response insertion order', async () => {
		await withRollback(async (transaction) => {
			const studentId = await insertStudent(transaction);
			const pool = await createPool(transaction, 1);
			const first = await insertRound(transaction, studentId, pool.id);
			const second = await insertRound(transaction, studentId, pool.id);
			const cards: [string, number, Outcome][] = [
				[first, 1, 'correct'], [first, 2, 'incorrect'], [second, 1, 'incorrect'], [second, 2, 'skipped']
			];
			for (const [attemptId, position, outcome] of cards) {
				await insertResponse(transaction, attemptId, pool.id, pool.itemIds[0], position, outcome);
			}
			const before = await wordProgress(transaction, studentId, pool.itemIds[0]);
			// Reinsert only this test's responses; the contract does not prescribe tie-sort direction.
			await transaction`DELETE FROM public.vocabulary_responses WHERE attempt_id IN (${first}, ${second})`;
			for (const [attemptId, position, outcome] of [...cards].reverse()) {
				await insertResponse(transaction, attemptId, pool.id, pool.itemIds[0], position, outcome);
			}
			expect(await wordProgress(transaction, studentId, pool.itemIds[0])).toEqual(before);
		});
	});

	test('empty pools and unpracticed students start at pass one; skip-only practice is not success', async () => {
		await withRollback(async (transaction) => {
			const studentId = await insertStudent(transaction);
			const emptyPool = await createPool(transaction, 0);
			const pool = await createPool(transaction, 3);
			for (const [poolId, totalItems] of [[emptyPool.id, 0], [pool.id, 3]] as const) {
				expect(await completeness(transaction, studentId, poolId)).toEqual({
					total_items: totalItems, practiced_items: 0, successful_items: 0,
					full_passes_completed: 0, current_pass: 1, current_pass_completed_items: 0
				});
			}
			const id = await insertRound(transaction, studentId, pool.id);
			await insertResponse(transaction, id, pool.id, pool.itemIds[0], 1, 'skipped');
			expect(await completeness(transaction, studentId, pool.id)).toEqual({
				total_items: 3, practiced_items: 1, successful_items: 0,
				full_passes_completed: 0, current_pass: 1, current_pass_completed_items: 0
			});
		});
	});

	test('completeness uses every pool member and minimum correct counts, resetting at exact pass boundaries', async () => {
		await withRollback(async (transaction) => {
			const studentId = await insertStudent(transaction);
			const pool = await createPool(transaction, 3);
			const id = await insertRound(transaction, studentId, pool.id);
			let position = 0;
			async function answer(itemIndex: number, outcome: Outcome = 'correct') {
				await insertResponse(transaction, id, pool.id, pool.itemIds[itemIndex], ++position, outcome);
			}
			await answer(0);
			await answer(1, 'incorrect');
			await answer(1, 'skipped');
			expect(await completeness(transaction, studentId, pool.id)).toEqual({
				total_items: 3, practiced_items: 2, successful_items: 1,
				full_passes_completed: 0, current_pass: 1, current_pass_completed_items: 1
			});
			await answer(1);
			expect(await completeness(transaction, studentId, pool.id)).toEqual({
				total_items: 3, practiced_items: 2, successful_items: 2,
				full_passes_completed: 0, current_pass: 1, current_pass_completed_items: 2
			});
			await answer(2);
			expect(await completeness(transaction, studentId, pool.id)).toEqual({
				total_items: 3, practiced_items: 3, successful_items: 3,
				full_passes_completed: 1, current_pass: 2, current_pass_completed_items: 0
			});
			await answer(0);
			await answer(0);
			expect(await completeness(transaction, studentId, pool.id)).toMatchObject({
				full_passes_completed: 1, current_pass: 2, current_pass_completed_items: 1
			});
			await answer(1);
			await answer(2);
			expect(await completeness(transaction, studentId, pool.id)).toMatchObject({
				full_passes_completed: 2, current_pass: 3, current_pass_completed_items: 1
			});
			await answer(1);
			await answer(2);
			expect(await completeness(transaction, studentId, pool.id)).toEqual({
				total_items: 3, practiced_items: 3, successful_items: 3,
				full_passes_completed: 3, current_pass: 4, current_pass_completed_items: 0
			});
		});
	});

	test('stable item progress survives reordered and expanded pool versions with explicit denominators', async () => {
		await withRollback(async (transaction) => {
			const studentId = await insertStudent(transaction);
			const original = await createPool(transaction, 2);
			const extra = await createPool(transaction, 1);
			const revisedId = await insertPool(transaction, [original.itemIds[1], original.itemIds[0], extra.itemIds[0]]);
			const first = await insertRound(transaction, studentId, original.id, { rulesVersion: 'frequency-test-v1' });
			await insertResponse(transaction, first, original.id, original.itemIds[0], 1);
			await insertResponse(transaction, first, original.id, original.itemIds[0], 2);
			await insertResponse(transaction, first, original.id, original.itemIds[1], 3);
			expect(await completeness(transaction, studentId, original.id)).toEqual({
				total_items: 2, practiced_items: 2, successful_items: 2,
				full_passes_completed: 1, current_pass: 2, current_pass_completed_items: 1
			});
			expect(await completeness(transaction, studentId, revisedId)).toEqual({
				total_items: 3, practiced_items: 2, successful_items: 2,
				full_passes_completed: 0, current_pass: 1, current_pass_completed_items: 2
			});
			const second = await insertRound(transaction, studentId, revisedId, { rulesVersion: 'frequency-test-v2' });
			await insertResponse(transaction, second, revisedId, original.itemIds[0], 1);
			await insertResponse(transaction, second, revisedId, extra.itemIds[0], 2);
			expect(await wordProgress(transaction, studentId, original.itemIds[0])).toMatchObject({ correct_count: 3 });
			expect(await wordProgress(transaction, studentId, original.itemIds[1])).toMatchObject({ correct_count: 1 });
			expect(await completeness(transaction, studentId, revisedId)).toEqual({
				total_items: 3, practiced_items: 3, successful_items: 3,
				full_passes_completed: 1, current_pass: 2, current_pass_completed_items: 1
			});
			expect(await completeness(transaction, studentId, original.id)).toMatchObject({
				total_items: 2, full_passes_completed: 1, current_pass_completed_items: 1
			});
			const [rank] = await transaction`
				SELECT rank FROM public.vocabulary_pool_items WHERE pool_id = ${revisedId} AND item_id = ${original.itemIds[0]}
			`;
			expect(rank.rank).toBe(2);
		});
	});

	test('only full-duration attempts with verification at or after the end enter competitive views', async () => {
		await withRollback(async (transaction) => {
			const studentId = await insertStudent(transaction);
			const unverifiedStudentId = await insertStudent(transaction);
			const rulesVersion = `db-games-rules-${randomUUID()}`;
			const eligible = await insertSpeedMath(transaction, studentId, {
				rulesVersion, correctCount: 1, startedAt: '2026-01-01T05:00:00-05:00', verifiedAt: '2026-01-01T10:05:00Z'
			});
			await insertSpeedMath(transaction, studentId, { rulesVersion, correctCount: 100, verifiedAt: null });
			await insertSpeedMath(transaction, studentId, {
				rulesVersion, correctCount: 100, verifiedAt: '2026-01-01T10:04:59.999Z'
			});
			await insertSpeedMath(transaction, studentId, {
				rulesVersion, correctCount: 100, endedAt: '2026-01-01T10:04:59.999Z', verifiedAt: '2026-01-01T10:05:00Z'
			});
			await insertSpeedMath(transaction, studentId, {
				rulesVersion, correctCount: 100, endedAt: null, verifiedAt: '2026-01-01T10:05:00Z'
			});
			await insertSpeedMath(transaction, studentId, {
				rulesVersion, correctCount: 0, verifiedAt: '2026-01-01T10:06:00Z'
			});
			await insertSpeedMath(transaction, unverifiedStudentId, { rulesVersion, correctCount: 100, verifiedAt: null });
			for (const view of ['speed_math_verified_bests', 'speed_math_leaderboard_entries']) {
				const rows = await transaction.unsafe(
					`SELECT student_id, attempt_id, correct_count FROM public.${view} WHERE rules_version = $1`, [rulesVersion]
				);
				expect(rows).toHaveLength(1);
				expect(rows[0]).toMatchObject({ student_id: studentId, attempt_id: eligible, correct_count: 1 });
			}
		});
	});

	test('math bests prefer correct counts, fewer errors, earliest end, and then ascending attempt UUID', async () => {
		await withRollback(async (transaction) => {
			const studentId = await insertStudent(transaction);
			const rulesVersion = `db-games-rules-${randomUUID()}`;
			const [lateId, winningId, tiedId] = [randomUUID(), randomUUID(), randomUUID()].sort();
			await insertSpeedMath(transaction, studentId, {
				id: lateId, rulesVersion, correctCount: 20, incorrectCount: 1, startedAt: '2026-01-01T11:00:00Z'
			});
			await insertSpeedMath(transaction, studentId, { id: tiedId, rulesVersion, correctCount: 20, incorrectCount: 1 });
			await insertSpeedMath(transaction, studentId, { id: winningId, rulesVersion, correctCount: 20, incorrectCount: 1 });
			await insertSpeedMath(transaction, studentId, {
				rulesVersion, correctCount: 20, incorrectCount: 2, startedAt: '2026-01-01T09:00:00Z'
			});
			await insertSpeedMath(transaction, studentId, {
				rulesVersion, correctCount: 19, incorrectCount: 0, startedAt: '2026-01-01T08:00:00Z'
			});
			const rows = await transaction`
				SELECT student_id, operation, duration_minutes, rules_version, attempt_id, correct_count, incorrect_count,
					started_at = ${startTime}::timestamptz AS start_matches,
					ended_at = '2026-01-01T10:05:00Z'::timestamptz AS end_matches,
					verified_at = ended_at AS verification_matches
				FROM public.speed_math_verified_bests WHERE student_id = ${studentId} AND rules_version = ${rulesVersion}
			`;
			expect([...rows]).toEqual([{
				student_id: studentId, operation: 'addition', duration_minutes: 5, rules_version: rulesVersion,
				attempt_id: winningId, correct_count: 20, incorrect_count: 1,
				start_matches: true, end_matches: true, verification_matches: true
			}]);
		});
	});

	test('leaderboard ties share ranks 1, 1, 3 and score ordering does not use names or activity', async () => {
		await withRollback(async (transaction) => {
			const studentIds = await Promise.all(Array.from({ length: 4 }, () => insertStudent(transaction)));
			const rulesVersion = `db-games-rules-${randomUUID()}`;
			const scores = [[20, 1], [20, 1], [20, 2], [19, 0]];
			const attemptIds: string[] = [];
			for (const [index, studentId] of studentIds.entries()) {
				attemptIds.push(await insertSpeedMath(transaction, studentId, {
					rulesVersion, correctCount: scores[index][0], incorrectCount: scores[index][1],
					startedAt: `2026-01-01T0${9 - index}:00:00Z`
				}));
			}
			await insertSpeedMath(transaction, studentIds[0], { rulesVersion, correctCount: 1 });
			await transaction`UPDATE public.students SET is_active = false WHERE id = ${studentIds[1]}`;
			const rows = await transaction`
				SELECT student_id, attempt_id, correct_count, incorrect_count, rank::integer
				FROM public.speed_math_leaderboard_entries WHERE rules_version = ${rulesVersion}
			`;
			expect(rows).toHaveLength(4);
			for (const [index, studentId] of studentIds.entries()) {
				expect(rows.find((row) => row.student_id === studentId)).toEqual({
					student_id: studentId, attempt_id: attemptIds[index], correct_count: scores[index][0],
					incorrect_count: scores[index][1], rank: [1, 1, 3, 4][index]
				});
			}
		});
	});

	test('every approved operation and duration has an independent best and rank, separated by rules version', async () => {
		await withRollback(async (transaction) => {
			const studentId = await insertStudent(transaction);
			const rulesVersion = `db-games-rules-${randomUUID()}`;
			const revisedRulesVersion = `db-games-rules-${randomUUID()}`;
			const expected: { operation: Operation; duration_minutes: number; rules_version: string; attempt_id: string }[] = [];
			for (const operation of ['addition', 'subtraction', 'multiplication', 'division'] as const) {
				for (const durationMinutes of [5, 10, 15] as const) {
					expected.push({
						operation, duration_minutes: durationMinutes, rules_version: rulesVersion,
						attempt_id: await insertSpeedMath(transaction, studentId, {
												rulesVersion, operation, durationMinutes, correctCount: expected.length + 1
											})
					});
				}
			}
			expected.push({
				operation: 'addition', duration_minutes: 5, rules_version: revisedRulesVersion,
				attempt_id: await insertSpeedMath(transaction, studentId, { rulesVersion: revisedRulesVersion, correctCount: 100 })
			});
			for (const view of ['speed_math_verified_bests', 'speed_math_leaderboard_entries']) {
				const rows = await transaction.unsafe(
					`SELECT operation, duration_minutes, rules_version, attempt_id FROM public.${view} WHERE student_id = $1`,
					[studentId]
				);
				expect(rows).toHaveLength(expected.length);
				expect([...rows]).toEqual(expect.arrayContaining(expected));
			}
			const ranks = await transaction`
				SELECT rank::integer FROM public.speed_math_leaderboard_entries WHERE student_id = ${studentId}
			`;
			expect(ranks.map((row) => row.rank)).toEqual(Array.from({ length: 13 }, () => 1));
		});
	});

	test('deactivation and reactivation preserve vocabulary, math, and all derived history', async () => {
		await withRollback(async (transaction) => {
			const studentId = await insertStudent(transaction);
			const pool = await createPool(transaction, 1);
			const rulesVersion = `db-games-rules-${randomUUID()}`;
			const roundId = await insertRound(transaction, studentId, pool.id);
			await insertResponse(transaction, roundId, pool.id, pool.itemIds[0], 1);
			await insertSpeedMath(transaction, studentId, { rulesVersion });
			async function snapshot() {
				return {
					attempts: [...await transaction`SELECT * FROM public.game_attempts WHERE student_id = ${studentId} ORDER BY id`],
					responses: [...await transaction`SELECT * FROM public.vocabulary_responses WHERE attempt_id = ${roundId}`],
					word: await wordProgress(transaction, studentId, pool.itemIds[0]),
					completeness: await completeness(transaction, studentId, pool.id),
					round: [...await transaction`SELECT * FROM public.vocabulary_round_progress WHERE attempt_id = ${roundId}`],
					math: [...await transaction`SELECT * FROM public.speed_math_leaderboard_entries WHERE student_id = ${studentId}`]
				};
			}
			const before = await snapshot();
			for (const isActive of [false, true]) {
				await transaction`UPDATE public.students SET is_active = ${isActive} WHERE id = ${studentId}`;
				expect(await snapshot()).toEqual(before);
			}
		});
	});

	test('referenced students, attempts, rounds, pools, membership, and item identities cannot cascade-delete histories', async () => {
		await withRollback(async (transaction) => {
			const studentId = await insertStudent(transaction);
			const pool = await createPool(transaction, 1);
			const roundId = await insertRound(transaction, studentId, pool.id);
			await insertResponse(transaction, roundId, pool.id, pool.itemIds[0], 1);
			const mathId = await insertSpeedMath(transaction, studentId);
			const deletions: ((sql: TransactionSql) => PromiseLike<unknown>)[] = [
				(sql) => sql`DELETE FROM public.students WHERE id = ${studentId}`,
				(sql) => sql`DELETE FROM public.game_attempts WHERE id = ${mathId}`,
				(sql) => sql`DELETE FROM public.game_attempts WHERE id = ${roundId}`,
				(sql) => sql`DELETE FROM public.vocabulary_rounds WHERE attempt_id = ${roundId}`,
				(sql) => sql`DELETE FROM public.vocabulary_pools WHERE id = ${pool.id}`,
				(sql) => sql`DELETE FROM public.vocabulary_pool_items WHERE pool_id = ${pool.id} AND item_id = ${pool.itemIds[0]}`,
				(sql) => sql`DELETE FROM public.vocabulary_items WHERE id = ${pool.itemIds[0]}`
			];
			for (const deletion of deletions) await expectDatabaseError(transaction, deletion, '23001');
			const [history] = await transaction`
				SELECT (SELECT count(*) FROM public.game_attempts WHERE student_id = ${studentId})::integer AS attempts,
					(SELECT count(*) FROM public.speed_math_results WHERE attempt_id = ${mathId})::integer AS math_results,
					(SELECT count(*) FROM public.vocabulary_responses WHERE attempt_id = ${roundId})::integer AS responses
			`;
			expect(history).toEqual({ attempts: 2, math_results: 1, responses: 1 });
			expect(await wordProgress(transaction, studentId, pool.itemIds[0])).toMatchObject({ correct_count: 1 });
		});
	});

	test('rerunning applied migrations preserves the journal, initial catalog, and existing game records', async () => {
		await withRollback(async (transaction) => {
			const studentId = await insertStudent(transaction);
			const pool = await createPool(transaction, 1);
			const roundId = await insertRound(transaction, studentId, pool.id);
			await insertResponse(transaction, roundId, pool.id, pool.itemIds[0], 1, 'skipped');
			const mathId = await insertSpeedMath(transaction, studentId);
			async function snapshot() {
				return {
					journal: [...await transaction`SELECT id, hash, created_at::text FROM drizzle.__drizzle_migrations ORDER BY id`],
					catalog: [...await transaction`
						SELECT * FROM public.vocabulary_pool_items WHERE pool_id = 'frequency-v1' ORDER BY rank
					`],
					student: [...await transaction`SELECT * FROM public.students WHERE id = ${studentId}`],
					attempts: [...await transaction`SELECT * FROM public.game_attempts WHERE student_id = ${studentId} ORDER BY id`],
					math: [...await transaction`SELECT * FROM public.speed_math_results WHERE attempt_id = ${mathId}`],
					pool: [...await transaction`SELECT * FROM public.vocabulary_pools WHERE id = ${pool.id}`],
					item: [...await transaction`SELECT * FROM public.vocabulary_items WHERE id = ${pool.itemIds[0]}`],
					membership: [...await transaction`SELECT * FROM public.vocabulary_pool_items WHERE pool_id = ${pool.id}`],
					round: [...await transaction`SELECT * FROM public.vocabulary_rounds WHERE attempt_id = ${roundId}`],
					responses: [...await transaction`SELECT * FROM public.vocabulary_responses WHERE attempt_id = ${roundId}`]
				};
			}
			const before = await snapshot();
			await migrateDatabase(connection.db);
			expect(await snapshot()).toEqual(before);
		});
	});
});
