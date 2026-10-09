import { sql } from 'drizzle-orm';
import { boolean, check, date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth-schema';
import { studentClassTypes, studentGenders, studentStatuses } from '../../student';

export const students = pgTable(
	'students',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		firstName: text('first_name').notNull(),
		lastName: text('last_name').notNull(),
		email: text('email').notNull(),
		dateOfBirth: date('date_of_birth', { mode: 'string' }),
		gender: text('gender', { enum: studentGenders }),
		classType: text('class_type', { enum: studentClassTypes }).notNull(),
		status: text('status', { enum: studentStatuses }).default('active').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		check('students_first_name_nonblank', sql`${table.firstName} ~ '[^[:space:]]'`),
		check('students_last_name_nonblank', sql`${table.lastName} ~ '[^[:space:]]'`),
		check('students_email_format', sql`${table.email} ~ '^[^[:space:]@]+@[^[:space:]@]+$'`),
		uniqueIndex('students_email_normalized_unique').on(sql`lower(btrim(${table.email}))`),
		check(
			'students_date_of_birth_valid',
			sql`${table.dateOfBirth} IS NULL OR (isfinite(${table.dateOfBirth}) AND ${table.dateOfBirth} <= CURRENT_DATE)`
		),
		check('students_gender_valid', sql`${table.gender} IN ('male', 'female')`),
		check('students_class_type_valid', sql`${table.classType} IN ('basic', 'regular')`),
		check('students_status_valid', sql`${table.status} IN ('active', 'inactive', 'invited')`)
	]
);

// Server-owned account-to-student identity; never infer associations from email.
export const studentAccounts = pgTable('student_accounts', {
	userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'restrict' }),
	studentId: uuid('student_id').notNull().unique().references(() => students.id, { onDelete: 'restrict' }),
	linkedBy: text('linked_by').references(() => user.id, { onDelete: 'restrict' }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
}, (table) => [
	check('student_accounts_link_provenance', sql`(${table.linkedBy} IS NULL) = (${table.createdAt} IS NULL)`)
]);

export const studentInvitations = pgTable('student_invitations', {
	studentId: uuid('student_id').primaryKey().references(() => students.id, { onDelete: 'cascade' }),
	tokenHash: text('token_hash').notNull().unique(),
	recipientEmail: text('recipient_email').notNull(),
	language: text('language', { enum: ['en', 'es'] }).notNull(),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	acceptedAt: timestamp('accepted_at', { withTimezone: true }),
	deliveryState: text('delivery_state', { enum: ['pending', 'sending', 'sent', 'failed'] }).default('pending').notNull(),
	testMode: boolean('test_mode').default(false).notNull(),
	sentAt: timestamp('sent_at', { withTimezone: true }),
	lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
	createdBy: text('created_by').notNull().references(() => user.id, { onDelete: 'restrict' }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull()
}, (table) => [
	check('student_invitations_token_hash_valid', sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`),
	check('student_invitations_language_valid', sql`${table.language} IN ('en', 'es')`),
	check('student_invitations_delivery_state_valid', sql`${table.deliveryState} IN ('pending', 'sending', 'sent', 'failed')`),
	index('student_invitations_created_at_idx').on(table.createdAt)
]);

// Local demonstration values only; not an exam grading or percentile contract.
export const studentSubjectScores = pgTable('student_subject_scores', {
	studentId: uuid('student_id').primaryKey().references(() => students.id, { onDelete: 'cascade' }),
	ar: integer('ar').notNull(),
	pc: integer('pc').notNull(),
	wk: integer('wk').notNull(),
	mk: integer('mk').notNull(),
	isFixture: boolean('is_fixture').default(true).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => [
	check('student_subject_scores_fixture_only', sql`${table.isFixture} = true`),
	...(['ar', 'pc', 'wk', 'mk'] as const).map((subject) =>
		check(`student_subject_scores_${subject}_range`, sql`${table[subject]} BETWEEN 0 AND 100`)
	)
]);

export type Student = typeof students.$inferSelect;
export type NewStudent = typeof students.$inferInsert;
