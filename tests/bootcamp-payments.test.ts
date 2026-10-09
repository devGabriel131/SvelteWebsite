import { describe, expect, test } from 'bun:test';
import { getTableName, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { Database } from '../src/lib/server/db/connection';
import { students } from '../src/lib/server/db/schema';
import { bootcampEvents, bootcampPayments, bootcampRegistrations } from '../src/lib/server/db/bootcamp-schema';
import { AthError, type AthClient, type AthVerification } from '../src/lib/server/bootcamp/ath';
import { createPaymentService, createPaymentTokenVault, PaymentError } from '../src/lib/server/bootcamp/payments';
import { creditedCents, isPaymentAmount, normalizePhone, paymentNeedsAttention } from '../src/lib/bootcamp/payment-rules';

const key = 'ab'.repeat(32); // Test-only key, never used by a server or provider.
const token = 'test.secret.transaction-token';
const registrationId = 'aaaaaaaa-1111-4111-8111-111111111111';
const eventId = '22222222-2222-4222-8222-222222222222';
const attemptId = '33333333-3333-4333-8333-333333333333';
const reference = '44444444-4444-4444-8444-444444444444';
const transactionId = 'test-merchant-transaction';
const vault = createPaymentTokenVault(key);
type Payment = typeof bootcampPayments.$inferSelect;
const context = { id: attemptId, registrationId, amountCents: 1500, reference };

function payment(overrides: Partial<Payment> = {}): Payment {
	return {
		...context, status: 'pending', authorizationToken: vault.seal(token, context), transactionId: null,
		authorizationStarted: false, reconcileRequested: false, nextCheckAt: new Date('2026-01-01'),
		leaseUntil: new Date('2026-01-01T00:02:00Z'), lastError: null,
		createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'), ...overrides
	};
}
const registration = {
	id: registrationId, eventId, studentId: '55555555-5555-4555-8555-555555555555',
	waiver: { event: { id: eventId, revision: 1 } }, letterChoice: false
};
const event = { id: eventId, revision: 1 };
const student = { id: registration.studentId, status: 'active', dateOfBirth: '2000-01-01' as string | null };
const checkedAt = '2026-10-06T12:00:00.000Z';
const dialect = new PgDialect();

type Query = {
	operation: 'select' | 'insert' | 'update'; table?: unknown; fields?: unknown;
	data?: Record<string, unknown>; predicate?: SQL; lock?: string;
	returning?: boolean; limit?: number; order?: unknown[]; transaction: boolean;
};
type Step = { operation: Query['operation']; table: unknown; run: (query: Query) => unknown | Promise<unknown> };
const select = (table: unknown, rows: unknown, check?: (query: Query) => void): Step => ({
	operation: 'select', table, run(query) { check?.(query); return rows; }
});
const update = (rows: unknown, check?: (query: Query) => void): Step => ({
	operation: 'update', table: bootcampPayments, run(query) { check?.(query); return rows; }
});

// Scripted SQL-boundary mock: real Drizzle predicates are compiled/asserted, never sent to a database.
// This tests fencing/ordering decisions, NOT PostgreSQL's lock or unique-index implementation.
function database(...steps: Step[]) {
	const calls: Query[] = [];
	let commits = 0;
	let rollbacks = 0;
	let gate = Promise.resolve();
	function connection(transaction = false) {
		function builder(operation: Query['operation'], table?: unknown, fields?: unknown) {
			const query: Query = { operation, table, fields, transaction };
			let result: Promise<unknown> | undefined;
			const chain = {
				from(value: unknown) { query.table = value; return chain; },
				where(value: SQL) { query.predicate = value; return chain; },
				set(value: Record<string, unknown>) { query.data = value; return chain; },
				values(value: Record<string, unknown>) { query.data = value; return chain; },
				for(value: string) { query.lock = value; return chain; },
				returning() { query.returning = true; return chain; },
				orderBy(...value: unknown[]) { query.order = value; return chain; },
				limit(value: number) { query.limit = value; return chain; },
				then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
					result ??= Promise.resolve().then(() => {
						calls.push(query);
						const step = steps.shift();
						if (!step) throw new Error(`Unexpected mock ${operation} on ${getTableName(table as typeof bootcampPayments)}`);
						expect(operation).toBe(step.operation);
						expect(query.table).toBe(step.table);
						return step.run(query);
					});
					return result.then(resolve, reject);
				}
			};
			return chain;
		}
		return {
			select: (fields?: unknown) => builder('select', undefined, fields),
			insert: (table: unknown) => builder('insert', table),
			update: (table: unknown) => builder('update', table),
			async transaction<T>(run: (tx: unknown) => Promise<T>): Promise<T> {
				let unlock!: () => void;
				const previous = gate;
				gate = new Promise<void>((resolve) => { unlock = resolve; });
				await previous;
				try {
					const value = await run(connection(true));
					commits++;
					return value;
				} catch (error) { rollbacks++; throw error; } finally { unlock(); }
			}
		};
	}
	return {
		db: connection() as unknown as Database, calls,
		get commits() { return commits; }, get rollbacks() { return rollbacks; },
		done() { expect(steps).toHaveLength(0); }
	};
}

function where(query: Query) {
	expect(query.predicate).toBeDefined();
	return dialect.sqlToQuery(query.predicate!);
}
function checkOwned(query: Query) {
	const compiled = where(query);
	expect(compiled.sql).toContain('"id" =');
	expect(compiled.sql).toContain('"lease_until" =');
	expect(compiled.sql).toContain('"lease_until" > clock_timestamp()');
}
function claim(row: Payment | null): Step {
	return update(row ? [row] : [], (query) => {
		const compiled = where(query);
		expect(compiled.sql).toContain('"next_check_at" <= clock_timestamp()');
		expect(compiled.sql).toContain('"lease_until" is null');
		expect(compiled.sql).toContain('"lease_until" <= clock_timestamp()');
		expect(compiled.params).toContain('cancelled');
		expect(query.data?.reconcileRequested).toBe(false);
		expect(dialect.sqlToQuery(query.data?.leaseUntil as SQL).sql).toContain("date_trunc('milliseconds'");
	});
}
function finish(row: Payment, status: Payment['status'], extra: Partial<Payment> = {}, check?: (query: Query) => void): Step[] {
	return [
		select(bootcampPayments, [row], (query) => { checkOwned(query); expect(query.lock).toBe('update'); }),
		update([{ ...row, status, leaseUntil: null, lastError: null, ...extra }], (query) => {
			checkOwned(query);
			expect(query.data?.status).toBe(status);
			expect(query.data).not.toHaveProperty('reconcileRequested');
			expect(query.data).not.toHaveProperty('authorizationStarted');
			check?.(query);
		})
	];
}
function blocked(row: Payment, code: string): Step {
	return update([{ ...row, status: ['completed', 'refunded', 'cancelled'].includes(row.status) ? row.status : 'uncertain', lastError: code, leaseUntil: null }], (query) => {
		checkOwned(query);
		expect(query.data?.lastError).toBe(code);
		expect(query.data).not.toHaveProperty('transactionId');
		expect(dialect.sqlToQuery(query.data?.status as SQL).sql).toContain("('completed', 'refunded', 'cancelled')");
	});
}
function prerequisites(
	existing: Payment[] = [], overrides: Record<string, unknown> = {},
	options: { student?: Partial<typeof student>; checkedAt?: string; event?: Partial<typeof event> } = {}
): Step[] {
	return [
		select(bootcampRegistrations, [registration], (query) => {
			expect(query.transaction).toBe(true);
			expect(query.lock).toBeUndefined();
			expect(query.fields).toEqual({ eventId: bootcampRegistrations.eventId, studentId: bootcampRegistrations.studentId });
		}),
		select(bootcampEvents, [{ ...event, ...options.event }], (query) => {
			expect(query.lock).toBe('update');
			expect(where(query).sql).not.toContain('clock_timestamp');
		}),
		select(students, [{ ...student, ...options.student }], (query) => {
			expect(query.lock).toBe('update');
			expect(where(query).params).toContain(registration.studentId);
		}),
		select(bootcampRegistrations, [{ ...registration, ...overrides }], (query) => {
			expect(query.lock).toBe('update');
		}),
		select(bootcampEvents, [{ id: eventId, checkedAt: options.checkedAt ?? checkedAt }], (query) => {
			expect(query.transaction).toBe(true);
			const fields = query.fields as { checkedAt: SQL };
			expect(dialect.sqlToQuery(fields.checkedAt).sql).toBe('clock_timestamp()::text');
			const compiled = where(query);
			for (const column of ['registration_open', 'registration_closes_at', 'starts_at']) expect(compiled.sql).toContain(column);
			expect(compiled.sql).toContain('> clock_timestamp()');
			expect(compiled.params).toContain(true);
		}),
		select(bootcampPayments, existing, (query) => {
			expect(where(query).sql).toContain('"status" <>');
			expect(where(query).params).toContain('cancelled');
		})
	];
}
function insert(row: Payment): Step {
	return { operation: 'insert', table: bootcampPayments, run(query) {
		expect(query.transaction).toBe(true);
		expect(query.data?.status).toBe('creating');
		expect(query.data).not.toHaveProperty('phone');
		expect(query.data).not.toHaveProperty('authorizationToken');
		row.id = query.data!.id as string;
		return [row];
	} };
}
function ath(overrides: Partial<AthClient> = {}): AthClient {
	return {
		async create() { throw new Error('Unexpected provider creation'); },
		async verify() { throw new Error('Unexpected provider verification'); }, ...overrides
	};
}
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((yes) => { resolve = yes; });
	return { promise, resolve };
}
function noSecrets(value: unknown) {
	for (const secret of [key, token, '7875550100']) expect(JSON.stringify(value)).not.toContain(secret);
}
async function fails(work: () => unknown, code: PaymentError['code']) {
	try { await work(); } catch (error) {
		expect(error).toBeInstanceOf(PaymentError);
		expect((error as PaymentError).code).toBe(code);
		expect(error).not.toHaveProperty('cause');
		noSecrets(`${error} ${(error as Error).stack} ${JSON.stringify(error)}`);
		return;
	}
	throw new Error('Expected sanitized payment failure');
}

describe('shared payment policy', () => {
	test('only completed attempts contribute credit; every retained error needs attention', () => {
		expect(creditedCents([
			{ status: 'completed', amountCents: 1500 }, { status: 'completed', amountCents: 3000 },
			...['creating', 'pending', 'uncertain', 'cancelled', 'refunded'].map((status) => ({ status, amountCents: 3000 }))
		])).toBe(4500);
		expect(creditedCents([])).toBe(0);
		for (const status of ['creating', 'pending', 'uncertain', 'completed', 'cancelled', 'refunded']) {
			expect(paymentNeedsAttention({ status, lastError: null })).toBe(status === 'uncertain');
			expect(paymentNeedsAttention({ status, lastError: 'lookup_failed' })).toBe(true);
		}
	});

	test('amount and phone rules reject coercion and oversized inputs', () => {
		for (const amount of [1500, 3000]) expect(isPaymentAmount(amount)).toBe(true);
		for (const amount of [undefined, null, '1500', 1500.1, 0, 1499, 3001, NaN, Infinity]) expect(isPaymentAmount(amount)).toBe(false);
		expect(normalizePhone('+1 (787) 555-0100')).toBe('7875550100');
		expect(normalizePhone(`7875550100${' '.repeat(30)}`)).toBe('7875550100');
		for (const phone of [undefined, null, 7875550100, '+44 7875550100', '7875550100 ext 2', `7875550100${' '.repeat(31)}`]) {
			expect(normalizePhone(phone)).toBeNull();
		}
	});
});

describe('payment token vault', () => {
	test('AES-256-GCM round trip uses independent nonces and no plaintext', () => {
		const first = vault.seal(token, context);
		const second = vault.seal(token, context);
		expect(first).not.toBe(second);
		expect(first).toStartWith('v1.');
		expect(first).not.toContain(token);
		expect(vault.open(first, context)).toBe(token);
		expect(vault.open(second, context)).toBe(token);
	});
	for (const invalid of ['', 'x'.repeat(64), 'ab'.repeat(31), 'ab'.repeat(33), ` ${key}`]) {
		test('rejects invalid encryption configuration before opening any database work', async () => {
			await fails(() => createPaymentService(database().db, ath(), invalid), 'configuration');
		});
	}
	for (const change of [{ id: eventId }, { registrationId: eventId }, { amountCents: 3000 }, { reference: eventId }]) {
		test(`rejects ciphertext transplanted to another ${Object.keys(change)[0]}`, async () => {
			await fails(() => vault.open(vault.seal(token, context), { ...context, ...change }), 'token');
		});
	}
	test('rejects the wrong key and modifications to nonce, tag and ciphertext', async () => {
		const sealed = vault.seal(token, context);
		await fails(() => createPaymentTokenVault('cd'.repeat(32)).open(sealed, context), 'token');
		for (const index of [1, 2, 3]) {
			const parts = sealed.split('.');
			parts[index] = (parts[index][0] === 'A' ? 'B' : 'A') + parts[index].slice(1);
			await fails(() => vault.open(parts.join('.'), context), 'token');
		}
		for (const invalid of [token, '', 'v2.a.b.c', 'v1.a.b.c.extra', 'v1...']) await fails(() => vault.open(invalid, context), 'token');
	});
	test('token capability validation retains the vault size bound and bearer grammar', async () => {
		const maximum = 'a'.repeat(16_384);
		expect(vault.open(vault.seal(maximum, context), context)).toBe(maximum);
		for (const invalid of ['', 'a'.repeat(16_385), 'capability\nheader', ' padded ', 'not:bearer']) {
			await fails(() => vault.seal(invalid, context), 'token');
		}
	});
});

describe('durable checkout creation', () => {
	for (const [id, amount, phone] of [
		['bad-id', 1500, '7875550100'], [registrationId, 1000, '7875550100'], [registrationId, 1500.1, '7875550100'],
		[registrationId, 1500, 'not a phone'], [registrationId, 1500, '+44 7875550100'], [registrationId, 1500, '']
	] as const) {
		test('validates amount, ID and phone before creating an attempt', async () => {
			const mock = database();
			await fails(() => createPaymentService(mock.db, ath(), key).start(id, amount, phone), 'invalid_input');
			expect(mock.calls).toHaveLength(0);
		});
	}

	test('commits before remote creation, uses canonical stored IDs and saves only encrypted credentials', async () => {
		const row = payment({ status: 'creating', reference: null, authorizationToken: null });
		const mock = database(...prerequisites(), insert(row), {
			operation: 'update', table: bootcampPayments, run(query) {
				checkOwned(query);
				expect(query.data?.status).toBe('pending');
				expect(vault.open(query.data!.authorizationToken as string, { ...row, reference })).toBe(token);
				noSecrets(query.data);
				return [{ ...row, ...query.data }];
			}
		});
		let creations = 0;
		const client = ath({ async create(input) {
			creations++;
			expect(mock.commits).toBe(1);
			expect(input).toEqual({ attemptId: row.id, registrationId, amountCents: 1500, phone: '7875550100' });
			return { reference, authorizationToken: token };
		} });
		const result = await createPaymentService(mock.db, client, key).start(registrationId.toUpperCase(), 1500, '+1 (787) 555-0100');
		expect(result).toEqual({ attemptId: row.id, amountCents: 1500, status: 'pending', uncertain: false });
		noSecrets(result);
		expect(creations).toBe(1);
		expect(mock.calls.filter((query) => query.lock).map((query) => query.table))
			.toEqual([bootcampEvents, students, bootcampRegistrations]);
		mock.done();
	});

	test('an unlocked missing registration lookup takes no row locks', async () => {
		const mock = database(select(bootcampRegistrations, [], (query) => expect(query.lock).toBeUndefined()));
		await fails(() => createPaymentService(mock.db, ath(), key).start(registrationId, 1500, '7875550100'), 'not_found');
		mock.done();
	});

	for (const change of [{ eventId: reference }, { studentId: reference }]) {
		test('rejects an association changed between discovery and the ordered locks', async () => {
			const mock = database(...prerequisites([], change).slice(0, 4));
			await fails(() => createPaymentService(mock.db, ath(), key).start(registrationId, 1500, '7875550100'), 'unavailable');
			mock.done();
		});
	}

	for (const change of [
		{ status: 'inactive' }, { status: 'invited' }, { dateOfBirth: null }, { dateOfBirth: '2010-01-01' },
		{ dateOfBirth: '2027-01-01' }, { dateOfBirth: '2000-02-30' }
	]) {
		test(`rechecks locked roster eligibility ${JSON.stringify(change)}`, async () => {
			const mock = database(...prerequisites([], {}, { student: change }).slice(0, 5));
			await fails(() => createPaymentService(mock.db, ath(), key).start(registrationId, 1500, '7875550100'), 'ineligible');
			expect(mock.calls.filter((query) => query.lock).map((query) => query.table))
				.toEqual([bootcampEvents, students, bootcampRegistrations]);
			mock.done();
		});
	}

	test('a vanished student cannot proceed using the unlocked registration snapshot', async () => {
		const steps = prerequisites();
		steps[2] = select(students, [], (query) => expect(query.lock).toBe('update'));
		const mock = database(...steps.slice(0, 3));
		await fails(() => createPaymentService(mock.db, ath(), key).start(registrationId, 1500, '7875550100'), 'ineligible');
		mock.done();
	});

	for (const [at, eligible] of [
		['2026-10-06T03:59:59.999Z', false], ['2026-10-06T04:00:00.000Z', true]
	] as const) {
		test(`uses the database's PR signing date for the 21st birthday at ${at}`, async () => {
			const row = payment();
			const steps = prerequisites([row], {}, { student: { dateOfBirth: '2005-10-06' }, checkedAt: at });
			const mock = database(...(eligible ? steps : steps.slice(0, 5)));
			const start = () => createPaymentService(mock.db, ath(), key).start(registrationId, 1500, '7875550100');
			if (eligible) expect((await start()).status).toBe('pending');
			else await fails(start, 'ineligible');
			mock.done();
		});
	}

	for (const letterChoice of [false, true]) {
		test(`a submitted waiver remains payable after an event revision; letterChoice=${letterChoice}`, async () => {
			const row = payment({ status: 'creating', reference: null, authorizationToken: null });
			const originalWaiver = structuredClone(registration.waiver);
			const mock = database(...prerequisites([], { letterChoice }, { event: { revision: 4 } }), insert(row),
				update([{ ...row, status: 'pending', leaseUntil: null }], (query) => expect(query.data?.status).toBe('pending')));
			let calls = 0;
			const result = await createPaymentService(mock.db, ath({ async create() {
				calls++;
				return { reference, authorizationToken: token };
			} }), key).start(registrationId, 1500, '7875550100');
			expect(result.status).toBe('pending');
			expect(calls).toBe(1);
			expect(registration.waiver).toEqual(originalWaiver);
			expect(mock.calls.filter((query) => query.operation !== 'select').every((query) => query.table === bootcampPayments)).toBe(true);
			mock.done();
		});
	}

	test('a closed/unapproved/out-of-date event cannot pass the locked availability query', async () => {
		const steps = prerequisites();
		steps[4] = select(bootcampEvents, [], (query) => {
			expect(query.transaction).toBe(true);
			const statement = where(query).sql;
			expect(statement).toContain('"registration_closes_at" > clock_timestamp()');
			expect(statement).toContain('"starts_at" > clock_timestamp()');
		});
		const mock = database(...steps.slice(0, 5));
		await fails(() => createPaymentService(mock.db, ath(), key).start(registrationId, 1500, '7875550100'), 'unavailable');
		expect(mock.rollbacks).toBe(1);
		mock.done();
	});

	for (const change of [{ waiver: null }, { letterChoice: null }, { waiver: { event: { id: reference, revision: 1 } } }]) {
		test('rejects missing prerequisites or a waiver for another event under the ordered locks', async () => {
			const mock = database(...prerequisites([], change).slice(0, 5));
			await fails(() => createPaymentService(mock.db, ath(), key).start(registrationId, 1500, '7875550100'), 'prerequisites');
			mock.done();
		});
	}

	for (const status of ['creating', 'pending', 'uncertain', 'completed', 'refunded'] as const) {
		test(`${status} blocks a second website payment, including a deposit balance`, async () => {
			const row = payment({ status });
			const mock = database(...prerequisites([row]));
			const result = await createPaymentService(mock.db, ath(), key).start(registrationId, 3000, '7875550100');
			expect(result.status).toBe(status);
			expect(result.amountCents).toBe(1500);
			noSecrets(result);
			mock.done();
		});
	}

	test('lost creation response becomes uncertain and is never retried by start', async () => {
		const row = payment({ status: 'creating', reference: null, authorizationToken: null });
		const mock = database(...prerequisites(), insert(row), blocked(row, 'creation_unresolved'),
			...prerequisites([{ ...row, status: 'uncertain', lastError: 'creation_unresolved' }]));
		let calls = 0;
		const client = ath({ async create() { calls++; throw new Error(`${token} ${key}`); } });
		const service = createPaymentService(mock.db, client, key);
		expect((await service.start(registrationId, 1500, '7875550100')).status).toBe('uncertain');
		expect((await service.start(registrationId, 1500, '7875550100')).status).toBe('uncertain');
		expect(calls).toBe(1);
		mock.done();
	});

	test('a token-save failure does not issue another provider creation', async () => {
		const row = payment({ status: 'creating', reference: null, authorizationToken: null });
		const mock = database(...prerequisites(), insert(row), {
			operation: 'update', table: bootcampPayments, run() { throw new Error(`SQL ${token}`); }
		}, blocked(row, 'creation_unresolved'));
		let calls = 0;
		const result = await createPaymentService(mock.db, ath({ async create() { calls++; return { reference, authorizationToken: token }; } }), key)
			.start(registrationId, 1500, '7875550100');
		expect(result.status).toBe('uncertain');
		expect(calls).toBe(1);
		mock.done();
	});

	test('database errors are sanitized and never cause a provider call', async () => {
		const mock = database({ operation: 'select', table: bootcampRegistrations, run() { throw new Error(`${key} ${token}`); } });
		await fails(() => createPaymentService(mock.db, ath(), key).start(registrationId, 1500, '7875550100'), 'storage');
		mock.done();
	});
});

describe('latest registration reconciliation', () => {
	for (const id of ['', 'bad-id', `${registrationId} `, registrationId.replace('-4111-', '-0111-')]) {
		test('validates registration ID before querying or contacting ATH', async () => {
			const mock = database();
			await fails(() => createPaymentService(mock.db, ath(), key).reconcileLatest(id), 'invalid_input');
			expect(mock.calls).toHaveLength(0);
		});
	}

	test('no attempt makes only the bounded latest lookup', async () => {
		const mock = database(select(bootcampPayments, [], (query) => {
			expect(query.fields).toEqual({ id: bootcampPayments.id });
			expect(where(query).params).toEqual([registrationId]);
			expect(query.order).toHaveLength(1);
			expect(dialect.sqlToQuery(query.order![0] as SQL).sql).toBe('"bootcamp_payments"."created_at" desc');
			expect(query.limit).toBe(1);
			expect(query.transaction).toBe(false);
		}));
		expect(await createPaymentService(mock.db, ath(), key).reconcileLatest(registrationId)).toBeUndefined();
		mock.done();
	});

	test('latest attempt uses the existing claim and verification path', async () => {
		const row = payment();
		const mock = database(select(bootcampPayments, [{ id: attemptId }]), claim(row), ...finish(row, 'pending'));
		let checks = 0;
		const client = ath({ async verify(input) {
			checks++;
			expect(input.attemptId).toBe(attemptId);
			return { status: 'pending' };
		} });
		expect(await createPaymentService(mock.db, client, key).reconcileLatest(registrationId)).toBeUndefined();
		expect(checks).toBe(1);
		mock.done();
	});

	test('lookup failure is a fixed native error with no raw SQL details or cause', async () => {
		const mock = database({ operation: 'select', table: bootcampPayments, run() { throw new Error(`${key} ${token}`); } });
		try {
			await createPaymentService(mock.db, ath(), key).reconcileLatest(registrationId);
			throw new Error('Expected lookup failure');
		} catch (error) {
			expect(error).toEqual(new Error('Payment lookup failed.'));
			expect(error).not.toBeInstanceOf(PaymentError);
			expect(error).not.toHaveProperty('cause');
			noSecrets(`${error} ${JSON.stringify(error)}`);
		}
		mock.done();
	});

	test('reconciliation storage failure keeps PaymentError classification', async () => {
		const mock = database(select(bootcampPayments, [{ id: attemptId }]), {
			operation: 'update', table: bootcampPayments, run() { throw new Error(`${key} ${token}`); }
		});
		await fails(() => createPaymentService(mock.db, ath(), key).reconcileLatest(registrationId), 'storage');
		mock.done();
	});
});

describe('leased reconciliation and durable authorization intent', () => {
	test('an OPEN poll leaves authorization available for a later CONFIRM', async () => {
		const row = payment();
		const marked = { ...row, authorizationStarted: true, status: 'uncertain' as const };
		const mock = database(claim(row), ...finish(row, 'pending'), claim(row), update([{ id: row.id }], (query) => {
			checkOwned(query);
			expect(query.data?.authorizationStarted).toBe(true);
			expect(query.data?.status).toBe('uncertain');
			expect(where(query).sql).toContain('"authorization_started" =');
			expect(where(query).params).toContain(false);
		}), ...finish(marked, 'completed', { transactionId }, (query) => expect(query.data?.transactionId).toBe(transactionId)));
		let phase = 0;
		const client = ath({ async verify(input) {
			expect(input.authorize).toBe(true);
			expect(input.authorizationToken).toBe(token);
			if (phase++ === 0) return { status: 'pending' };
			await input.beforeAuthorize!();
			return { status: 'completed', transactionId };
		} });
		const service = createPaymentService(mock.db, client, key);
		expect((await service.reconcile(attemptId))?.status).toBe('pending');
		expect((await service.reconcile(attemptId))?.status).toBe('completed');
		expect(mock.calls.filter((q) => q.data?.authorizationStarted === true)).toHaveLength(1);
		mock.done();
	});

	test('a crash after durable intent is recovered read-only without a second debit', async () => {
		const row = payment();
		const marked = { ...row, status: 'uncertain' as const, authorizationStarted: true };
		const mock = database(claim(row), update([{ id: row.id }]), blocked(marked, 'ath_transport'),
			claim(marked), ...finish(marked, 'completed', { transactionId }));
		let debits = 0;
		const client = ath({ async verify(input) {
			if (input.authorize) {
				await input.beforeAuthorize!();
				debits++;
				throw new AthError('transport', 'authorize');
			}
			return { status: 'completed', transactionId };
		} });
		expect((await createPaymentService(mock.db, client, key).reconcile(attemptId))?.status).toBe('uncertain');
		expect((await createPaymentService(mock.db, client, key).reconcile(attemptId))?.status).toBe('completed');
		expect(debits).toBe(1);
		mock.done();
	});

	test('a lost/expired lease at beforeAuthorize prevents a debit', async () => {
		const row = payment();
		const mock = database(claim(row), update([], checkOwned), blocked(row, 'lease_lost'));
		let debits = 0;
		const client = ath({ async verify(input) {
			await input.beforeAuthorize!();
			debits++;
			return { status: 'completed', transactionId };
		} });
		expect((await createPaymentService(mock.db, client, key).reconcile(attemptId))?.status).toBe('uncertain');
		expect(debits).toBe(0);
		mock.done();
	});

	test('failed intent persistence prevents debit and sanitizes storage errors', async () => {
		const row = payment();
		const mock = database(claim(row), { operation: 'update', table: bootcampPayments, run() { throw new Error(token); } }, blocked(row, 'storage'));
		let debits = 0;
		const result = await createPaymentService(mock.db, ath({ async verify(input) {
			await input.beforeAuthorize!(); debits++;
			return { status: 'completed', transactionId };
		} }), key).reconcile(attemptId);
		expect(debits).toBe(0);
		expect(result?.uncertain).toBe(true);
		noSecrets(result);
		mock.done();
	});

	test('a repeated beforeAuthorize invocation cannot authorize twice', async () => {
		const row = payment();
		const mock = database(claim(row), update([{ id: row.id }]), blocked({ ...row, authorizationStarted: true }, 'lease_lost'));
		const result = await createPaymentService(mock.db, ath({ async verify(input) {
			await input.beforeAuthorize!();
			await input.beforeAuthorize!();
			return { status: 'completed', transactionId };
		} }), key).reconcile(attemptId);
		expect(result?.status).toBe('uncertain');
		mock.done();
	});

	test('a due/lease CAS loser only reads safe state and makes no provider call', async () => {
		const row = payment();
		const mock = database(claim(null), select(bootcampPayments, [row]));
		const result = await createPaymentService(mock.db, ath(), key).reconcile(attemptId);
		expect(result?.status).toBe('pending');
		noSecrets(result);
		mock.done();
	});

	test('concurrent workers make one verification when the second loses the durable claim', async () => {
		const row = payment();
		const entered = deferred<void>();
		const release = deferred<AthVerification>();
		const mock = database(claim(row), claim(null), select(bootcampPayments, [row]), ...finish(row, 'pending'));
		let checks = 0;
		const client = ath({ async verify() { checks++; entered.resolve(); return release.promise; } });
		const first = createPaymentService(mock.db, client, key).reconcile(attemptId);
		await entered.promise;
		await createPaymentService(mock.db, client, key).reconcile(attemptId);
		release.resolve({ status: 'pending' });
		await first;
		expect(checks).toBe(1);
		mock.done();
	});

	test('an expired creating attempt becomes uncertain without retrying creation', async () => {
		const row = payment({ status: 'creating', reference: null, authorizationToken: null });
		const mock = database(claim(row), blocked(row, 'creation_unresolved'));
		expect((await createPaymentService(mock.db, ath(), key).reconcile(attemptId))?.status).toBe('uncertain');
		mock.done();
	});

	test('a corrupted/transplanted saved token fails closed before calling ATH', async () => {
		const row = payment({ authorizationToken: vault.seal(token, { ...context, registrationId: eventId }) });
		const mock = database(claim(row), blocked(row, 'token'));
		expect((await createPaymentService(mock.db, ath(), key).reconcile(attemptId))?.status).toBe('uncertain');
		mock.done();
	});

	for (const status of ['pending', 'cancelled'] as const) {
		test(`${status} after authorization cannot release the one-payment restriction`, async () => {
			const row = payment({ status: 'uncertain', authorizationStarted: true });
			const mock = database(claim(row), ...finish(row, 'uncertain', { lastError: 'authorization_unresolved' }));
			const result = await createPaymentService(mock.db, ath({ async verify(input) {
				expect(input.authorize).toBe(false); return { status };
			} }), key).reconcile(attemptId);
			expect(result?.uncertain).toBe(true);
			mock.done();
		});
	}

	test('a verified cancellation before authorization can release the attempt', async () => {
		const row = payment();
		const mock = database(claim(row), ...finish(row, 'cancelled'));
		expect((await createPaymentService(mock.db, ath({ async verify() { return { status: 'cancelled' }; } }), key).reconcile(attemptId))?.status).toBe('cancelled');
		mock.done();
	});
});

describe('idempotent credit and conservative refunds', () => {
	for (const original of ['pending', 'completed'] as const) {
		test(`completed proof updates the ledger row only (${original})`, async () => {
			const row = payment({ status: original, transactionId: original === 'completed' ? transactionId : null });
			const mock = database(claim(row), ...finish(row, 'completed', { transactionId }, (query) => {
				expect(query.data?.transactionId).toBe(transactionId);
				expect(query.data).not.toHaveProperty('amountCents');
			}));
			const result = await createPaymentService(mock.db, ath({ async verify() { return { status: 'completed', transactionId }; } }), key).reconcile(attemptId);
			expect(result?.status).toBe('completed');
			expect(mock.calls.every((query) => query.table === bootcampPayments)).toBe(true);
			mock.done();
		});
	}

	test('a global transactionId uniqueness violation becomes uncertain, not another credit', async () => {
		const row = payment();
		const mock = database(claim(row), select(bootcampPayments, [row]), {
			operation: 'update', table: bootcampPayments, run() { throw { cause: { code: '23505', detail: token } }; }
		}, blocked(row, 'transaction_conflict'));
		expect((await createPaymentService(mock.db, ath({ async verify() { return { status: 'completed', transactionId }; } }), key).reconcile(attemptId))?.status).toBe('uncertain');
		expect(mock.rollbacks).toBe(1);
		mock.done();
	});

	for (const id of [undefined, null, 0, '', ' padded ', 'line\nbreak', 'other-receipt']) {
		test('malformed or changed transaction IDs cannot replace settled proof', async () => {
			const row = payment({ status: 'completed', transactionId });
			const mock = database(claim(row), select(bootcampPayments, [row]), blocked(row, 'ath_mismatch'));
			// Deliberately violate the adapter type to exercise the service's runtime proof boundary.
			const result = await createPaymentService(mock.db, ath({ async verify() {
				return { status: 'completed', transactionId: id } as AthVerification;
			} }), key).reconcile(attemptId);
			expect(result?.status).toBe('completed');
			expect(result?.uncertain).toBe(true);
			mock.done();
		});
	}

	test('an undocumented adapter status cannot become settled proof', async () => {
		const row = payment();
		const mock = database(claim(row), select(bootcampPayments, [row]), blocked(row, 'ath_protocol'));
		const result = await createPaymentService(mock.db, ath({ async verify() {
			// Deliberately violate the adapter type: unknown runtime statuses must still fail closed.
			return { status: 'undocumented' } as unknown as AthVerification;
		} }), key).reconcile(attemptId);
		expect(result?.status).toBe('uncertain');
		expect(result?.uncertain).toBe(true);
		mock.done();
	});

	test('verified refunds remove credit and refunded rows never regain credit', async () => {
		const paid = payment({ status: 'completed', transactionId });
		const refunded = { ...paid, status: 'refunded' as const };
		const mock = database(claim(paid), ...finish(paid, 'refunded', { transactionId }), claim(refunded), ...finish(refunded, 'refunded', { transactionId }));
		let checks = 0;
		const service = createPaymentService(mock.db, ath({ async verify(input) {
			expect(input.authorize).toBe(false);
			return { status: checks++ === 0 ? 'refunded' : 'completed', transactionId };
		} }), key);
		expect((await service.reconcile(attemptId))?.status).toBe('refunded');
		expect((await service.reconcile(attemptId))?.status).toBe('refunded');
		mock.done();
	});

	for (const status of ['pending', 'cancelled'] as const) {
		test(`stale ${status} cannot erase credit`, async () => {
			const row = payment({ status: 'completed', transactionId });
			const mock = database(claim(row), ...finish(row, 'completed', { lastError: 'stale_provider_status' }));
			const result = await createPaymentService(mock.db, ath({ async verify() { return { status }; } }), key).reconcile(attemptId);
			expect(result?.status).toBe('completed');
			expect(result?.uncertain).toBe(true);
			mock.done();
		});
	}

	test('a provider outage flags uncertainty without removing settled credit', async () => {
		const row = payment({ status: 'completed', transactionId });
		const mock = database(claim(row), blocked(row, 'ath_transport'));
		const result = await createPaymentService(mock.db, ath({ async verify() { throw new AthError('transport', 'search'); } }), key).reconcile(attemptId);
		expect(result?.status).toBe('completed');
		expect(result?.uncertain).toBe(true);
		mock.done();
	});

	test('a result from a worker whose lease expired cannot write over a new owner', async () => {
		const row = payment();
		const newer = payment({ status: 'completed', transactionId });
		const mock = database(claim(row), select(bootcampPayments, [], checkOwned), select(bootcampPayments, [newer]));
		const result = await createPaymentService(mock.db, ath({ async verify() { return { status: 'pending' }; } }), key).reconcile(attemptId);
		expect(result?.status).toBe('completed');
		expect(mock.calls.filter((query) => query.operation === 'update')).toHaveLength(1);
		mock.done();
	});
});

describe('late cancellation and replacement attempts', () => {
	test('a delayed CANCEL for an old attempt cannot touch or replace its active successor', async () => {
		const cancelled = payment({ status: 'cancelled', leaseUntil: null });
		const replacement = payment({ id: '66666666-6666-4666-8666-666666666666' });
		const mock = database(update([], (query) => {
			const compiled = where(query);
			expect(compiled.sql).toContain('"status" <>');
			expect(compiled.params).toContain('cancelled');
			expect(compiled.params).toContain(cancelled.id);
			expect(compiled.params).toContain(cancelled.reference);
			expect(compiled.params).not.toContain(replacement.id);
			expect(query.data).toEqual({ reconcileRequested: true });
		}), claim(null), select(bootcampPayments, [cancelled]), ...prerequisites([replacement]));
		const service = createPaymentService(mock.db, ath(), key);
		const untrustedEvent = { attemptId: cancelled.id, reference, status: 'CANCEL', total: 0 };
		await service.notify(untrustedEvent);
		expect((await service.reconcile(cancelled.id))?.status).toBe('cancelled');
		expect((await service.start(registrationId, 3000, '7875550100')).attemptId).toBe(replacement.id);
		expect(mock.calls.filter((query) => query.operation === 'insert')).toHaveLength(0);
		mock.done();
	});

	test('an unsigned late CANCEL is only a wakeup; the latest trusted receipt keeps completion', async () => {
		const row = payment({ status: 'completed', transactionId, authorizationStarted: true });
		const mock = database(update([], (query) => expect(query.data).toEqual({ reconcileRequested: true })),
			claim(row), ...finish(row, 'completed', { transactionId }));
		let calls = 0;
		const service = createPaymentService(mock.db, ath({ async verify(input) {
			calls++;
			expect(input.attemptId).toBe(row.id);
			expect(input.reference).toBe(row.reference!);
			expect(input.amountCents).toBe(1500);
			expect(input.authorize).toBe(false);
			return { status: 'completed', transactionId };
		} }), key);
		const untrustedEvent = { attemptId, reference, status: 'CANCEL', total: 0, transactionId: 'untrusted-reference' };
		await service.notify(untrustedEvent);
		expect(calls).toBe(0);
		const result = await service.reconcile(attemptId);
		expect(result?.status).toBe('completed');
		expect(result?.uncertain).toBe(false);
		expect(calls).toBe(1);
		mock.done();
	});

	test('an unsigned late COMPLETED for a cancelled attempt cannot resurrect credit', async () => {
		const row = payment({ status: 'cancelled', leaseUntil: null });
		const mock = database(update([], (query) => {
			expect(query.data).toEqual({ reconcileRequested: true });
			expect(where(query).params).toContain('cancelled');
		}), claim(null), select(bootcampPayments, [row]));
		const service = createPaymentService(mock.db, ath(), key);
		const untrustedEvent = { attemptId, reference, status: 'COMPLETED', transactionId };
		await service.notify(untrustedEvent);
		expect((await service.reconcile(attemptId))?.status).toBe('cancelled');
		mock.done();
	});

	test('late completed proof from an expired lease cannot overwrite cancellation or credit a replacement', async () => {
		const oldClaim = payment();
		const cancelled = payment({ status: 'cancelled', leaseUntil: null });
		const mock = database(claim(oldClaim), select(bootcampPayments, [], checkOwned), select(bootcampPayments, [cancelled]));
		const result = await createPaymentService(mock.db, ath({ async verify(input) {
			expect(input.attemptId).toBe(oldClaim.id);
			return { status: 'completed', transactionId };
		} }), key).reconcile(attemptId);
		expect(result?.status).toBe('cancelled');
		expect(mock.calls.filter((query) => query.operation === 'update')).toHaveLength(1);
		mock.done();
	});
});

describe('coalesced wakeups and bounded draining', () => {
	for (const hints of [{}, { attemptId: 'bad' }, { reference: 'not-a-ticket' }, { attemptId, reference: 'bad' }]) {
		test('invalid/empty hints neither query nor call the provider', async () => {
			const mock = database();
			await createPaymentService(mock.db, ath(), key).notify(hints);
			expect(mock.calls).toHaveLength(0);
		});
	}

	for (const hints of [{ attemptId }, { reference }, { attemptId, reference }]) {
		test('notification only coalesces an existing row without bypassing its cooldown', async () => {
			const mock = database(update([], (query) => {
				expect(query.data).toEqual({ reconcileRequested: true });
				const compiled = where(query);
				if ('attemptId' in hints) expect(compiled.params).toContain(attemptId);
				if ('reference' in hints) expect(compiled.params).toContain(reference);
				expect(compiled.sql).not.toContain(' or ');
				expect(compiled.params).toContain(false);
			}));
			await createPaymentService(mock.db, ath(), key).notify(hints);
			mock.done();
		});
	}

	test('notifications arriving during a verification survive its final write', async () => {
		const row = payment();
		const mock = database(claim(row), update([], (query) => expect(query.data).toEqual({ reconcileRequested: true })), ...finish(row, 'completed', { transactionId }));
		let service!: ReturnType<typeof createPaymentService>;
		service = createPaymentService(mock.db, ath({ async verify() {
			await service.notify({ attemptId });
			return { status: 'completed', transactionId };
		} }), key);
		await service.reconcile(attemptId);
		mock.done();
	});

	test('background draining selects due unfinished/requested attempts, not every completed row', async () => {
		const row = payment();
		const mock = database(select(bootcampPayments, [{ id: attemptId }], (query) => {
			expect(query.limit).toBe(10);
			expect(query.order).toHaveLength(2);
			const compiled = where(query);
			expect(compiled.sql).toContain('"next_check_at" <= clock_timestamp()');
			expect(compiled.sql).toContain('"reconcile_requested" =');
			expect(compiled.params).not.toContain('completed');
			expect(compiled.sql).toContain('"authorization_token" is not null');
		}), claim(row), ...finish(row, 'pending'));
		const results = await createPaymentService(mock.db, ath({ async verify() { return { status: 'pending' }; } }), key).drain();
		expect(results).toHaveLength(1);
		noSecrets(results);
		mock.done();
	});

	test('an admin event sweep requests completed/refunded rows but keeps the rate bound', async () => {
		const mock = database(update([], (query) => {
			expect(query.data).toEqual({ reconcileRequested: true });
			const compiled = where(query);
			for (const value of [eventId, 'completed', 'refunded']) expect(compiled.params).toContain(value);
			expect(compiled.sql).toContain('exists');
		}), select(bootcampPayments, [], (query) => {
			expect(query.limit).toBe(5);
			expect(where(query).params).toContain(eventId);
			expect(where(query).sql).toContain('"next_check_at" <= clock_timestamp()');
		}));
		expect(await createPaymentService(mock.db, ath(), key).drain(eventId, 5)).toEqual([]);
		mock.done();
	});

	for (const limit of [0, -1, 51, NaN, 1.5]) {
		test('rejects unbounded/invalid drain batches before database or provider work', async () => {
			const mock = database();
			await fails(() => createPaymentService(mock.db, ath(), key).drain(undefined, limit), 'invalid_input');
			expect(mock.calls).toHaveLength(0);
		});
	}
});
