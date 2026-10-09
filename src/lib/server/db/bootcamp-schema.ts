import { sql } from 'drizzle-orm';
import { boolean, check, customType, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { students } from './schema';
import { user } from './auth-schema';
import type { LegalText, LetterSnapshot, WaiverSnapshot } from '../../bootcamp/types';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });
const time = (name: string) => timestamp(name, { withTimezone: true });


export const bootcampEvents = pgTable('bootcamp_events', {
	id: uuid('id').defaultRandom().primaryKey(),
	revision: integer('revision').default(1).notNull(),
	title: text('title').notNull(),
	venue: text('venue').notNull(),
	startsAt: time('starts_at').notNull(),
	endsAt: time('ends_at').notNull(),
	arrivalAt: time('arrival_at').notNull(),
	registrationClosesAt: time('registration_closes_at').notNull(),
	legal: jsonb('legal').$type<LegalText>().notNull(),
	registrationOpen: boolean('registration_open').default(false).notNull(),
	createdBy: text('created_by').notNull().references(() => user.id, { onDelete: 'restrict' }),
	createdAt: time('created_at').defaultNow().notNull(),
	updatedAt: time('updated_at').defaultNow().notNull()
}, (t) => [
	check('bootcamp_event_dates', sql`${t.endsAt} > ${t.startsAt} AND ${t.arrivalAt} <= ${t.startsAt} AND ${t.registrationClosesAt} <= ${t.startsAt}`),
	uniqueIndex('bootcamp_event_single_open').on(t.registrationOpen).where(sql`${t.registrationOpen}`),
	check('bootcamp_event_revision', sql`${t.revision} > 0`)
]);

export const bootcampRegistrations = pgTable('bootcamp_registrations', {
	id: uuid('id').defaultRandom().primaryKey(),
	eventId: uuid('event_id').notNull().references(() => bootcampEvents.id, { onDelete: 'restrict' }),
	studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'restrict' }),
	waiver: jsonb('waiver').$type<WaiverSnapshot>(),
	letterChoice: boolean('letter_choice'),
	createdAt: time('created_at').defaultNow().notNull(),
	updatedAt: time('updated_at').defaultNow().notNull()
}, (t) => [uniqueIndex('bootcamp_registration_student_event').on(t.eventId, t.studentId)]);

export const bootcampDocuments = pgTable('bootcamp_documents', {
	id: uuid('id').defaultRandom().primaryKey(),
	registrationId: uuid('registration_id').notNull().references(() => bootcampRegistrations.id, { onDelete: 'restrict' }),
	kind: text('kind', { enum: ['waiver', 'letter'] }).notNull(),
	language: text('language', { enum: ['en', 'es'] }).notNull(),
	snapshot: jsonb('snapshot').$type<WaiverSnapshot | LetterSnapshot>().notNull(),
	pdf: bytea('pdf').notNull(),
	sha256: text('sha256').notNull(),
	createdAt: time('created_at').defaultNow().notNull(),
	backupStatus: text('backup_status', { enum: ['pending', 'uploading', 'saved', 'failed'] }).default('pending').notNull(),
	driveFileId: text('drive_file_id').unique(),
	backupAttempts: integer('backup_attempts').default(0).notNull(),
	backupLeaseUntil: time('backup_lease_until'),
	backupError: text('backup_error'),
	backedUpAt: time('backed_up_at')
}, (t) => [
	uniqueIndex('bootcamp_document_registration_kind').on(t.registrationId, t.kind),
	index('bootcamp_document_backup_queue').on(t.backupStatus, t.backupLeaseUntil),
	check('bootcamp_document_kind', sql`${t.kind} IN ('waiver', 'letter')`),
	check('bootcamp_document_language', sql`${t.language} IN ('en', 'es')`),
	check('bootcamp_document_bytes', sql`octet_length(${t.pdf}) BETWEEN 1 AND 10485760`),
	check('bootcamp_document_backup_status', sql`${t.backupStatus} IN ('pending', 'uploading', 'saved', 'failed')`)
]);

export const bootcampPayments = pgTable('bootcamp_payments', {
	id: uuid('id').defaultRandom().primaryKey(),
	registrationId: uuid('registration_id').notNull().references(() => bootcampRegistrations.id, { onDelete: 'restrict' }),
	amountCents: integer('amount_cents').notNull(),
	status: text('status', { enum: ['creating', 'pending', 'uncertain', 'completed', 'cancelled', 'refunded'] }).default('creating').notNull(),
	reference: text('reference').unique(),
	authorizationToken: text('authorization_token'),
	transactionId: text('transaction_id').unique(),
	authorizationStarted: boolean('authorization_started').default(false).notNull(),
	reconcileRequested: boolean('reconcile_requested').default(true).notNull(),
	nextCheckAt: time('next_check_at').defaultNow().notNull(),
	leaseUntil: time('lease_until'),
	lastError: text('last_error'),
	createdAt: time('created_at').defaultNow().notNull(),
	updatedAt: time('updated_at').defaultNow().notNull()
}, (t) => [
	check('bootcamp_payment_amount', sql`${t.amountCents} IN (1500, 3000)`),
	check('bootcamp_payment_status', sql`${t.status} IN ('creating', 'pending', 'uncertain', 'completed', 'cancelled', 'refunded')`),
	check('bootcamp_payment_receipt', sql`${t.status} NOT IN ('completed', 'refunded') OR ${t.transactionId} IS NOT NULL`),
	// One purchase per event. The remaining deposit balance is collected outside this checkout.
	uniqueIndex('bootcamp_payment_active_registration').on(t.registrationId).where(sql`${t.status} <> 'cancelled'`),
	index('bootcamp_payment_reconciliation_queue').on(t.nextCheckAt, t.leaseUntil)
]);
