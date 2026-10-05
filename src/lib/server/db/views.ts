import { sql } from 'drizzle-orm';
import { bigint, boolean, integer, pgView, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { roundSize } from '../../frequency/practice';

export const studentWordProgress = pgView('student_word_progress', {
	studentId: uuid('student_id').notNull(),
	itemId: uuid('item_id').notNull(),
	correctCount: bigint('correct_count', { mode: 'number' }).notNull(),
	incorrectCount: bigint('incorrect_count', { mode: 'number' }).notNull(),
	skippedCount: bigint('skipped_count', { mode: 'number' }).notNull(),
	lastPracticedAt: timestamp('last_practiced_at', { withTimezone: true }).notNull(),
	lastOutcome: text('last_outcome', { enum: ['correct', 'incorrect', 'skipped'] }).notNull()
}).as(sql`
	SELECT attempt.student_id, response.item_id,
		count(*) FILTER (WHERE response.outcome = 'correct') AS correct_count,
		count(*) FILTER (WHERE response.outcome = 'incorrect') AS incorrect_count,
		count(*) FILTER (WHERE response.outcome = 'skipped') AS skipped_count,
		max(response.answered_at) AS last_practiced_at,
		(array_agg(response.outcome ORDER BY response.answered_at DESC,
			response.attempt_id DESC, response.card_position DESC))[1] AS last_outcome
	FROM public.vocabulary_responses AS response
	JOIN public.game_attempts AS attempt ON attempt.id = response.attempt_id
	GROUP BY attempt.student_id, response.item_id
`);

export const vocabularyRoundProgress = pgView('vocabulary_round_progress', {
	attemptId: uuid('attempt_id').notNull(),
	studentId: uuid('student_id').notNull(),
	poolId: text('pool_id').notNull(),
	responseCount: bigint('response_count', { mode: 'number' }).notNull(),
	correctCount: bigint('correct_count', { mode: 'number' }).notNull(),
	incorrectCount: bigint('incorrect_count', { mode: 'number' }).notNull(),
	skippedCount: bigint('skipped_count', { mode: 'number' }).notNull(),
	isComplete: boolean('is_complete').notNull()
}).as(sql`
	SELECT round.attempt_id, attempt.student_id, round.pool_id,
		count(response.attempt_id) AS response_count,
		count(*) FILTER (WHERE response.outcome = 'correct') AS correct_count,
		count(*) FILTER (WHERE response.outcome = 'incorrect') AS incorrect_count,
		count(*) FILTER (WHERE response.outcome = 'skipped') AS skipped_count,
		count(response.attempt_id) = ${sql.raw(String(roundSize))} AS is_complete
	FROM public.vocabulary_rounds AS round
	JOIN public.game_attempts AS attempt ON attempt.id = round.attempt_id
	LEFT JOIN public.vocabulary_responses AS response ON response.attempt_id = round.attempt_id
	GROUP BY round.attempt_id, attempt.student_id, round.pool_id
`);

export const studentVocabularyCompleteness = pgView('student_vocabulary_completeness', {
	studentId: uuid('student_id').notNull(),
	poolId: text('pool_id').notNull(),
	totalItems: bigint('total_items', { mode: 'number' }).notNull(),
	practicedItems: bigint('practiced_items', { mode: 'number' }).notNull(),
	successfulItems: bigint('successful_items', { mode: 'number' }).notNull(),
	fullPassesCompleted: bigint('full_passes_completed', { mode: 'number' }).notNull(),
	currentPass: bigint('current_pass', { mode: 'number' }).notNull(),
	currentPassCompletedItems: bigint('current_pass_completed_items', { mode: 'number' }).notNull()
}).as(sql`
	WITH item_counts AS (
		SELECT student.id AS student_id, pool.id AS pool_id, membership.item_id,
			coalesce(progress.correct_count, 0::bigint) AS correct_count,
			coalesce(progress.incorrect_count, 0::bigint) AS incorrect_count,
			coalesce(progress.skipped_count, 0::bigint) AS skipped_count,
			min(coalesce(progress.correct_count, 0::bigint)) OVER (
				PARTITION BY student.id, pool.id
			) AS minimum_correct_count
		FROM public.students AS student
		CROSS JOIN public.vocabulary_pools AS pool
		LEFT JOIN public.vocabulary_pool_items AS membership ON membership.pool_id = pool.id
		LEFT JOIN public.student_word_progress AS progress
			ON progress.student_id = student.id AND progress.item_id = membership.item_id
	)
	SELECT student_id, pool_id, count(item_id) AS total_items,
		count(*) FILTER (WHERE correct_count + incorrect_count + skipped_count > 0) AS practiced_items,
		count(*) FILTER (WHERE correct_count > 0) AS successful_items,
		minimum_correct_count AS full_passes_completed,
		minimum_correct_count + 1 AS current_pass,
		count(*) FILTER (WHERE correct_count > minimum_correct_count) AS current_pass_completed_items
	FROM item_counts
	GROUP BY student_id, pool_id, minimum_correct_count
`);

function speedMathBestColumns() {
	return {
		studentId: uuid('student_id').notNull(),
		operation: text('operation', { enum: ['addition', 'subtraction', 'multiplication', 'division'] }).notNull(),
		durationMinutes: integer('duration_minutes').notNull(),
		rulesVersion: text('rules_version').notNull(),
		attemptId: uuid('attempt_id').notNull(),
		correctCount: integer('correct_count').notNull(),
		incorrectCount: integer('incorrect_count').notNull(),
		startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
		endedAt: timestamp('ended_at', { withTimezone: true }).notNull(),
		verifiedAt: timestamp('verified_at', { withTimezone: true }).notNull()
	};
}

export const speedMathVerifiedBests = pgView('speed_math_verified_bests', speedMathBestColumns()).as(sql`
	WITH eligible AS (
		SELECT attempt.student_id, result.operation, result.duration_minutes, attempt.rules_version,
			attempt.id AS attempt_id, result.correct_count, result.incorrect_count,
			attempt.started_at, attempt.ended_at, result.verified_at,
			row_number() OVER (
				PARTITION BY attempt.student_id, result.operation, result.duration_minutes, attempt.rules_version
				ORDER BY result.correct_count DESC, result.incorrect_count ASC,
					attempt.ended_at ASC, attempt.id ASC
			) AS best_order
		FROM public.speed_math_results AS result
		JOIN public.game_attempts AS attempt ON attempt.id = result.attempt_id
		WHERE attempt.ended_at = attempt.started_at + make_interval(mins => result.duration_minutes)
			AND result.verified_at IS NOT NULL AND result.verified_at >= attempt.ended_at
	)
	SELECT student_id, operation, duration_minutes, rules_version, attempt_id,
		correct_count, incorrect_count, started_at, ended_at, verified_at
	FROM eligible WHERE best_order = 1
`);

export const speedMathLeaderboardEntries = pgView('speed_math_leaderboard_entries', {
	...speedMathBestColumns(),
	rank: bigint('rank', { mode: 'number' }).notNull()
}).as(sql`
	SELECT best.*,
		rank() OVER (
			PARTITION BY operation, duration_minutes, rules_version
			ORDER BY correct_count DESC, incorrect_count ASC
		) AS rank
	FROM public.speed_math_verified_bests AS best
`);
