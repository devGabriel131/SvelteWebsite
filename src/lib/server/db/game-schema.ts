import { sql } from 'drizzle-orm';
import {
	check,
	foreignKey,
	index,
	integer,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique,
	uuid
} from 'drizzle-orm/pg-core';
import { answerOutcomes, roundSize } from '../../frequency/rules';
import { operations } from '../../speed-math/game';
import { students } from './schema';


export const gameAttempts = pgTable(
	'game_attempts',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'restrict' }),
		gameType: text('game_type', { enum: ['speed_math', 'frequency'] }).notNull(),
		rulesVersion: text('rules_version').notNull(),
		startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
		endedAt: timestamp('ended_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		unique('game_attempts_id_game_type_unique').on(table.id, table.gameType),
		index('game_attempts_student_history_idx').on(table.studentId, table.startedAt),
		check('game_attempts_game_type_valid', sql`${table.gameType} IN ('speed_math', 'frequency')`),
		check('game_attempts_rules_version_nonblank', sql`${table.rulesVersion} ~ '[^[:space:]]'`),
		check('game_attempts_started_at_finite', sql`isfinite(${table.startedAt})`),
		check(
			'game_attempts_ended_at_valid',
			sql`${table.endedAt} IS NULL OR (isfinite(${table.endedAt}) AND ${table.endedAt} >= ${table.startedAt})`
		)
	]
);

export const speedMathResults = pgTable(
	'speed_math_results',
	{
		attemptId: uuid('attempt_id').primaryKey(),
		gameType: text('game_type', { enum: ['speed_math'] }).default('speed_math').notNull(),
		operation: text('operation', { enum: operations }).notNull(),
		durationMinutes: integer('duration_minutes').notNull(),
		correctCount: integer('correct_count').notNull(),
		incorrectCount: integer('incorrect_count').notNull(),
		verifiedAt: timestamp('verified_at', { withTimezone: true })
	},
	(table) => [
		foreignKey({
			name: 'speed_math_results_attempt_game_fk',
			columns: [table.attemptId, table.gameType],
			foreignColumns: [gameAttempts.id, gameAttempts.gameType]
		}).onDelete('restrict'),
		check('speed_math_results_game_type_valid', sql`${table.gameType} = 'speed_math'`),
		check(
			'speed_math_results_operation_valid',
			sql`${table.operation} IN ('addition', 'subtraction', 'multiplication', 'division')`
		),
		check('speed_math_results_duration_valid', sql`${table.durationMinutes} IN (5, 10, 15)`),
		check('speed_math_results_counts_nonnegative', sql`${table.correctCount} >= 0 AND ${table.incorrectCount} >= 0`),
		check('speed_math_results_verified_at_finite', sql`${table.verifiedAt} IS NULL OR isfinite(${table.verifiedAt})`)
	]
);

export const vocabularyItems = pgTable('vocabulary_items', {
	id: uuid('id').primaryKey(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export const vocabularyPools = pgTable(
	'vocabulary_pools',
	{
		id: text('id').primaryKey(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [check('vocabulary_pools_id_nonblank', sql`${table.id} ~ '[^[:space:]]'`)]
);

export const vocabularyPoolItems = pgTable(
	'vocabulary_pool_items',
	{
		poolId: text('pool_id').notNull().references(() => vocabularyPools.id, { onDelete: 'restrict' }),
		itemId: uuid('item_id').notNull().references(() => vocabularyItems.id, { onDelete: 'restrict' }),
		rank: integer('rank').notNull()
	},
	(table) => [
		primaryKey({ columns: [table.poolId, table.itemId] }),
		unique('vocabulary_pool_items_pool_rank_unique').on(table.poolId, table.rank),
		index('vocabulary_pool_items_item_idx').on(table.itemId),
		check('vocabulary_pool_items_rank_positive', sql`${table.rank} > 0`)
	]
);

export const vocabularyRounds = pgTable(
	'vocabulary_rounds',
	{
		attemptId: uuid('attempt_id').primaryKey(),
		gameType: text('game_type', { enum: ['frequency'] }).default('frequency').notNull(),
		poolId: text('pool_id').notNull().references(() => vocabularyPools.id, { onDelete: 'restrict' })
	},
	(table) => [
		foreignKey({
			name: 'vocabulary_rounds_attempt_game_fk',
			columns: [table.attemptId, table.gameType],
			foreignColumns: [gameAttempts.id, gameAttempts.gameType]
		}).onDelete('restrict'),
		unique('vocabulary_rounds_attempt_pool_unique').on(table.attemptId, table.poolId),
		index('vocabulary_rounds_pool_idx').on(table.poolId),
		check('vocabulary_rounds_game_type_valid', sql`${table.gameType} = 'frequency'`)
	]
);

export const vocabularyResponses = pgTable(
	'vocabulary_responses',
	{
		attemptId: uuid('attempt_id').notNull(),
		cardPosition: integer('card_position').notNull(),
		poolId: text('pool_id').notNull(),
		itemId: uuid('item_id').notNull(),
		outcome: text('outcome', { enum: answerOutcomes }).notNull(),
		answeredAt: timestamp('answered_at', { withTimezone: true }).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		primaryKey({ columns: [table.attemptId, table.cardPosition] }),
		foreignKey({
			name: 'vocabulary_responses_round_pool_fk',
			columns: [table.attemptId, table.poolId],
			foreignColumns: [vocabularyRounds.attemptId, vocabularyRounds.poolId]
		}).onDelete('restrict'),
		foreignKey({
			name: 'vocabulary_responses_pool_item_fk',
			columns: [table.poolId, table.itemId],
			foreignColumns: [vocabularyPoolItems.poolId, vocabularyPoolItems.itemId]
		}).onDelete('restrict'),
		index('vocabulary_responses_pool_item_idx').on(table.poolId, table.itemId),
		check('vocabulary_responses_card_position_valid', sql`${table.cardPosition} BETWEEN 1 AND ${sql.raw(String(roundSize))}`),
		check('vocabulary_responses_outcome_valid', sql`${table.outcome} IN ('correct', 'incorrect', 'skipped')`),
		check('vocabulary_responses_answered_at_finite', sql`isfinite(${table.answeredAt})`)
	]
);

