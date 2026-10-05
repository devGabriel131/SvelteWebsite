import { sql } from 'drizzle-orm';
import { boolean, check, date, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const studentGenders = ['male', 'female'] as const;
export const studentClassTypes = ['basic', 'regular'] as const;

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
		isActive: boolean('is_active').default(true).notNull(),
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
		check('students_class_type_valid', sql`${table.classType} IN ('basic', 'regular')`)
	]
);

export type Student = typeof students.$inferSelect;
export type NewStudent = typeof students.$inferInsert;
