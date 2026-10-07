import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { and, asc, eq, gt, inArray, isNotNull, isNull, lte, ne, or, sql } from 'drizzle-orm';
import { depositCents, priceCents } from '../../bootcamp/types';
import { isAdult } from '../../bootcamp/rules';
import type { Database } from '../db/connection';
import { students } from '../db/schema';
import { bootcampEvents as events, bootcampPayments as payments, bootcampRegistrations as registrations } from '../db/bootcamp-schema';
import { AthError, normalizeAthPhone, type AthClient, type AthVerification } from './ath';

type Payment = typeof payments.$inferSelect;
export type PaymentState = Pick<Payment, 'amountCents' | 'status'> & { attemptId: string; uncertain: boolean };
export type PaymentService = {
	start(registrationId: string, amountCents: number, phone: string): Promise<PaymentState>;
	reconcile(attemptId: string): Promise<PaymentState | null>;
	drain(eventId?: string, limit?: number): Promise<PaymentState[]>;
	notify(hints: { attemptId?: string; reference?: string }): Promise<void>;
};
type ErrorCode = 'configuration' | 'invalid_input' | 'not_found' | 'unavailable' | 'ineligible' | 'prerequisites' | 'storage' | 'token' | 'lease_lost';
const messages: Record<ErrorCode, string> = {
	configuration: 'A private 256-bit bootcamp payment encryption key is required.',
	invalid_input: 'Invalid bootcamp payment input.',
	not_found: 'Bootcamp registration was not found.',
	unavailable: 'Bootcamp registration is closed or its legal terms are not approved.',
	ineligible: 'An active student with a recorded date of birth and age 21 or older is required.',
	prerequisites: 'Complete the waiver and letter choice before paying.',
	storage: 'Payment storage is unavailable; do not create a replacement payment.',
	token: 'The saved payment capability could not be authenticated.',
	lease_lost: 'Payment reconciliation ownership was lost.'
};
export class PaymentError extends Error {
	constructor(readonly code: ErrorCode) {
		super(messages[code]);
		this.name = 'PaymentError';
	}
}

const uuid = /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const validId = (value: unknown): value is string => typeof value === 'string' && uuid.test(value);
const now = sql`clock_timestamp()`;
// Millisecond precision permits exact round trips through Drizzle's Date representation.
const lease = sql`date_trunc('milliseconds', clock_timestamp()) + interval '2 minutes'`;
const pollAfter = sql`clock_timestamp() + interval '30 seconds'`;
const retryAfter = sql`clock_timestamp() + interval '5 minutes'`;
const freeLease = () => or(isNull(payments.leaseUntil), lte(payments.leaseUntil, now));
const owned = (row: Payment) => and(eq(payments.id, row.id), eq(payments.leaseUntil, row.leaseUntil!), gt(payments.leaseUntil, now));
const safeState = (row: Payment): PaymentState => ({
	attemptId: row.id, amountCents: row.amountCents, status: row.status,
	uncertain: row.status === 'uncertain' || row.lastError !== null
});

export type PaymentTokenContext = Pick<Payment, 'id' | 'registrationId' | 'amountCents'> & { reference: string };

/** The versioned ciphertext authenticates both its contents and its owning immutable attempt. */
export function createPaymentTokenVault(encryptionKey: string) {
	if (typeof encryptionKey !== 'string' || !/^[\da-f]{64}$/i.test(encryptionKey)) throw new PaymentError('configuration');
	const key = Buffer.from(encryptionKey, 'hex');
	const aad = (context: PaymentTokenContext) => Buffer.from(JSON.stringify([
		'bootcamp-ath-v1', context.id, context.registrationId, context.amountCents, context.reference
	]));
	return {
		seal(token: string, context: PaymentTokenContext): string {
			if (typeof token !== 'string' || !token.length || token.length > 16_384 || !/^[A-Za-z0-9\-._~+/]+=*$/.test(token)) {
				throw new PaymentError('token');
			}
			const nonce = randomBytes(12);
			const cipher = createCipheriv('aes-256-gcm', key, nonce);
			cipher.setAAD(aad(context));
			const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
			return ['v1', nonce.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
		},
		open(sealed: string, context: PaymentTokenContext): string {
			try {
				if (typeof sealed !== 'string' || sealed.length > 24_000) throw new Error();
				const [version, iv, tag, encoded, extra] = sealed.split('.');
				if (version !== 'v1' || extra !== undefined || ![iv, tag, encoded].every((part) => part && /^[\w-]+$/.test(part))) throw new Error();
				const [nonce, authTag, ciphertext] = [iv, tag, encoded].map((part) => Buffer.from(part, 'base64url'));
				if (nonce.length !== 12 || authTag.length !== 16 || !ciphertext.length) throw new Error();
				const decipher = createDecipheriv('aes-256-gcm', key, nonce);
				decipher.setAAD(aad(context));
				decipher.setAuthTag(authTag);
				return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
			} catch {
				throw new PaymentError('token');
			}
		}
	};
}

async function storage<T>(work: () => Promise<T>): Promise<T> {
	try { return await work(); } catch (error) {
		if (error instanceof PaymentError) throw error;
		throw new PaymentError('storage');
	}
}

function failureCode(error: unknown): string {
	if (error instanceof AthError) return `ath_${error.kind}`;
	if (error instanceof PaymentError) return error.code;
	// Drizzle may wrap PostgreSQL's unique-constraint error. Never persist its detail/query.
	let current = error;
	for (let depth = 0; depth < 3 && current && typeof current === 'object'; depth++) {
		if ('code' in current && current.code === '23505') return 'transaction_conflict';
		current = 'cause' in current ? current.cause : null;
	}
	return 'reconciliation_failed';
}

/** Caller authenticates the student/admin; this service never accepts identity from a webhook. */
export function createPaymentService(db: Database, client: AthClient, encryptionKey: string): PaymentService {
	const vault = createPaymentTokenVault(encryptionKey);

	async function current(id: string): Promise<PaymentState | null> {
		const [row] = await db.select().from(payments).where(eq(payments.id, id));
		return row ? safeState(row) : null;
	}

	async function fail(row: Payment, code: string): Promise<PaymentState | null> {
		const [saved] = await db.update(payments).set({
			// An outage cannot erase verified credit or resurrect a refunded payment.
			status: sql`case when ${payments.status} in ('completed', 'refunded', 'cancelled') then ${payments.status} else 'uncertain' end`,
			lastError: code, leaseUntil: null, nextCheckAt: retryAfter, updatedAt: now
		}).where(owned(row)).returning();
		return saved ? safeState(saved) : current(row.id);
	}

	async function finish(row: Payment, result: AthVerification): Promise<PaymentState | null> {
		return db.transaction(async (tx) => {
			const [saved] = await tx.select().from(payments).where(owned(row)).for('update');
			if (!saved) {
				const [latest] = await tx.select().from(payments).where(eq(payments.id, row.id));
				return latest ? safeState(latest) : null;
			}
			let status: Payment['status'] = saved.status;
			let lastError: string | null = null;
			let transactionId = saved.transactionId;
			if (result.status === 'completed' || result.status === 'refunded') {
				if (typeof result.transactionId !== 'string' || !result.transactionId.trim() ||
					result.transactionId !== result.transactionId.trim() || /[\u0000-\u001f\u007f]/.test(result.transactionId) ||
					(transactionId !== null && transactionId !== result.transactionId)) {
					throw new AthError('mismatch', 'search');
				}
				transactionId = result.transactionId;
				status = saved.status === 'refunded' ? 'refunded' : result.status;
			} else if (['pending', 'cancelled', 'expired'].includes(result.status)) {
				if (saved.status === 'completed' || saved.status === 'refunded') lastError = 'stale_provider_status';
				else if (saved.authorizationStarted) { status = 'uncertain'; lastError = 'authorization_unresolved'; }
				else status = result.status === 'pending' ? 'pending' : 'cancelled';
			} else throw new AthError('protocol', 'search');
			const [updated] = await tx.update(payments).set({
				status, transactionId, lastError, leaseUntil: null,
				nextCheckAt: status === 'uncertain' || lastError ? retryAfter : pollAfter, updatedAt: now
				// Do not clear reconcileRequested here: a notification may have arrived during verification.
			}).where(owned(row)).returning();
			return updated ? safeState(updated) : null;
		});
	}

	async function reconcile(attemptId: string): Promise<PaymentState | null> {
		if (!validId(attemptId)) throw new PaymentError('invalid_input');
		return storage(async () => {
			// Cancelled attempts stay terminal: reopening one can collide with its replacement.
			// A contradictory late settlement needs operator reconciliation, never webhook credit.
			const [row] = await db.update(payments).set({
				leaseUntil: lease, reconcileRequested: false, nextCheckAt: pollAfter, updatedAt: now
			}).where(and(eq(payments.id, attemptId), ne(payments.status, 'cancelled'), lte(payments.nextCheckAt, now), freeLease())).returning();
			if (!row) return current(attemptId);
			if (!row.reference || !row.authorizationToken) return fail(row, 'creation_unresolved');
			let authorizing = false;
			try {
				const authorizationToken = vault.open(row.authorizationToken, { ...row, reference: row.reference });
				const mayAuthorize = !row.authorizationStarted && (row.status === 'pending' || row.status === 'uncertain');
				const result = await client.verify({
					attemptId: row.id, registrationId: row.registrationId, amountCents: row.amountCents,
					reference: row.reference, authorizationToken, authorize: mayAuthorize,
					beforeAuthorize: async () => {
						if (!mayAuthorize || authorizing) throw new PaymentError('lease_lost');
						authorizing = true;
						await storage(async () => {
							const [marked] = await db.update(payments).set({
								authorizationStarted: true, status: 'uncertain', lastError: 'authorization_unresolved', updatedAt: now
							}).where(and(owned(row), eq(payments.authorizationStarted, false))).returning({ id: payments.id });
							if (!marked) throw new PaymentError('lease_lost');
						});
					}
				});
				return await finish(row, result);
			} catch (error) {
				return fail(row, failureCode(error));
			}
		});
	}

	return {
		async start(registrationId, amountCents, phone) {
			if (!validId(registrationId) || !Number.isSafeInteger(amountCents) || ![depositCents, priceCents].includes(amountCents)) {
				throw new PaymentError('invalid_input');
			}
			let normalizedPhone: string;
			try { normalizedPhone = normalizeAthPhone(phone); } catch { throw new PaymentError('invalid_input'); }
			return storage(async () => {
				const prepared = await db.transaction(async (tx) => {
					// Discover immutable associations without taking the registration lock out of order.
					const [association] = await tx.select({ eventId: registrations.eventId, studentId: registrations.studentId })
						.from(registrations).where(eq(registrations.id, registrationId));
					if (!association) throw new PaymentError('not_found');
					// Match registration writers: event -> student -> registration. No network work under locks.
					const [event] = await tx.select().from(events).where(eq(events.id, association.eventId)).for('update');
					if (!event) throw new PaymentError('unavailable');
					const [student] = await tx.select().from(students).where(eq(students.id, association.studentId)).for('update');
					if (!student) throw new PaymentError('ineligible');
					const [registration] = await tx.select().from(registrations).where(eq(registrations.id, registrationId)).for('update');
					if (!registration) throw new PaymentError('not_found');
					if (registration.eventId !== event.id || registration.studentId !== student.id) throw new PaymentError('unavailable');
					// Recheck deadlines and age AFTER all lock waits, using the database clock and PR calendar.
					const [available] = await tx.select({ id: events.id, checkedAt: sql<string>`clock_timestamp()::text` }).from(events).where(and(
						eq(events.id, event.id), eq(events.registrationOpen, true), eq(events.legalApproved, true),
						isNotNull(events.approvedBy), gt(events.registrationClosesAt, now), gt(events.startsAt, now)
					));
					if (!available) throw new PaymentError('unavailable');
					const checkedAt = new Date(available.checkedAt);
					if (!Number.isFinite(checkedAt.getTime())) throw new PaymentError('storage');
					if (!student.isActive || !isAdult(student.dateOfBirth, checkedAt)) throw new PaymentError('ineligible');
					// Submitted documents are immutable: a later event revision does not invalidate this waiver.
					if (registration.waiver?.event?.id !== event.id || typeof registration.letterChoice !== 'boolean') {
						throw new PaymentError('prerequisites');
					}
					const [existing] = await tx.select().from(payments).where(and(eq(payments.registrationId, registration.id), ne(payments.status, 'cancelled')));
					if (existing) return { row: existing, created: false };
					const [row] = await tx.insert(payments).values({
						id: randomUUID(), registrationId: registration.id, amountCents, status: 'creating',
						leaseUntil: lease, nextCheckAt: lease, reconcileRequested: true
					}).returning();
					return { row, created: true };
				});
				if (!prepared.created) return safeState(prepared.row);
				const row = prepared.row;
				try {
					const payment = await client.create({
						attemptId: row.id, registrationId: row.registrationId, amountCents: row.amountCents, phone: normalizedPhone
					});
					if (!validId(payment.reference)) throw new PaymentError('token');
					const sealed = vault.seal(payment.authorizationToken, { ...row, reference: payment.reference });
					const [saved] = await db.update(payments).set({
						reference: payment.reference, authorizationToken: sealed, status: 'pending',
						leaseUntil: null, nextCheckAt: now, lastError: null, updatedAt: now
					}).where(and(owned(row), eq(payments.status, 'creating'))).returning();
					if (saved) return safeState(saved);
					const latest = await current(row.id);
					if (!latest) throw new PaymentError('storage');
					return latest;
				} catch {
					const state = await fail(row, 'creation_unresolved');
					if (!state) throw new PaymentError('storage');
					return state;
				}
			});
		},
		reconcile,
		async drain(eventId, limit = 10) {
			if ((eventId !== undefined && !validId(eventId)) || !Number.isInteger(limit) || limit < 1 || limit > 50) {
				throw new PaymentError('invalid_input');
			}
			return storage(async () => {
				const eventFilter = eventId === undefined ? undefined : sql`exists (
					select 1 from ${registrations} where ${registrations.id} = ${payments.registrationId} and ${registrations.eventId} = ${eventId}
				)`;
				// Explicit event drains are admin refund sweeps; regular workers do not repeatedly poll paid rows.
				if (eventId !== undefined) await db.update(payments).set({ reconcileRequested: true }).where(and(
					eventFilter, inArray(payments.status, ['completed', 'refunded']), eq(payments.reconcileRequested, false)
				));
				const rows = await db.select({ id: payments.id }).from(payments).where(and(
					eventFilter, ne(payments.status, 'cancelled'), lte(payments.nextCheckAt, now), freeLease(),
					or(inArray(payments.status, ['creating', 'pending']), eq(payments.reconcileRequested, true),
						and(eq(payments.status, 'uncertain'), isNotNull(payments.reference), isNotNull(payments.authorizationToken)))
				)).orderBy(asc(payments.nextCheckAt), asc(payments.id)).limit(limit);
				const results: PaymentState[] = [];
				for (const row of rows) {
					const result = await reconcile(row.id);
					if (result) results.push(result);
				}
				return results;
			});
		},
		async notify(hints) {
			if ((!hints.attemptId && !hints.reference) ||
				(hints.attemptId !== undefined && !validId(hints.attemptId)) ||
				(hints.reference !== undefined && !validId(hints.reference))) return;
			await storage(async () => {
				await db.update(payments).set({ reconcileRequested: true }).where(and(
					hints.attemptId ? eq(payments.id, hints.attemptId) : undefined,
					hints.reference ? eq(payments.reference, hints.reference) : undefined,
					ne(payments.status, 'cancelled'), eq(payments.reconcileRequested, false)
				));
			});
		}
	};
}
