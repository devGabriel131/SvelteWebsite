import { describe, expect, spyOn, test } from 'bun:test';
import {
	AthError, createAthClient,
	type AthCreateInput, type AthVerifyInput
} from '../src/lib/server/bootcamp/ath';

const config = { publicToken: 'test-public-token', privateToken: 'test-private-token' };
const authorizationToken = 'test.transaction.capability';
const attemptId = '11111111-1111-4111-8111-111111111111';
const registrationId = '22222222-2222-4222-8222-222222222222';
const reference = '33333333-3333-4333-8333-333333333333';
const transactionId = '123456-test-provider-transaction';
const input: AthVerifyInput = { attemptId, registrationId, amountCents: 1500, reference, authorizationToken };
const createInput: AthCreateInput = { attemptId, registrationId, amountCents: 1500, phone: '(787) 555-0100' };
const baseUrl = 'https://payments.athmovil.com/api/business-transaction/ecommerce';
const paymentUrl = `${baseUrl}/payment`;
const findUrl = `${baseUrl}/business/findPayment`;
const authorizationUrl = `${baseUrl}/authorization`;
const searchUrl = 'https://www.athmovil.com/api/v4/searchTransaction';
const secrets = [config.publicToken, config.privateToken, authorizationToken, createInput.phone];

function envelope(data: unknown) {
	return Response.json({ status: 'success', data });
}

function ticket(status: string, overrides: Record<string, unknown> = {}) {
	return envelope({
		ecommerceStatus: status, ecommerceId: reference,
		referenceNumber: status === 'COMPLETED' ? transactionId : '',
		total: 15, totalRefundedAmount: 0, metadata1: attemptId, metadata2: registrationId,
		...overrides
	});
}

function receipt(overrides: Record<string, unknown> = {}) {
	return {
		transactionType: 'ECOMMERCE', status: 'COMPLETED', referenceNumber: transactionId,
		total: '15.00', totalRefundedAmount: '0.00', metadata1: attemptId, metadata2: registrationId,
		...overrides
	};
}

type Step = Response | ((request: Request) => Response | Promise<Response>);
function transport(...steps: Step[]) {
	const requests: Request[] = [];
	const fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
		const request = new Request(url, init);
		requests.push(request);
		const step = steps.shift();
		if (!step) throw new Error('Unexpected mock request; real networking is never allowed.');
		return typeof step === 'function' ? step(request) : step;
	};
	return { fetch: fetch as typeof globalThis.fetch, requests };
}

async function failure(work: () => unknown) {
	try {
		await work();
	} catch (error) {
		expect(error).toBeInstanceOf(AthError);
		const result = error as AthError;
		expect(result.name).toBe('AthError');
		expect(result).not.toHaveProperty('cause');
		for (const secret of secrets) {
			expect(`${result} ${result.stack} ${JSON.stringify(result)}`).not.toContain(secret);
		}
		return result;
	}
	throw new Error('Expected a sanitized ATH failure.');
}

async function body(request: Request) {
	return request.clone().json();
}

function urls(mock: ReturnType<typeof transport>) {
	return mock.requests.map((request) => request.url);
}

describe('ATH creation', () => {
	for (const amountCents of [1500, 3000]) {
		test(`creates a single $${amountCents / 100} ticket using the documented REST payload`, async () => {
			const mock = transport(envelope({ ecommerceId: reference, auth_token: authorizationToken }));
			const client = createAthClient(config, mock.fetch);
			expect(await client.create({ ...createInput, amountCents })).toEqual({ reference, authorizationToken });
			expect(urls(mock)).toEqual([paymentUrl]);
			const request = mock.requests[0];
			expect(request.method).toBe('POST');
			expect(request.redirect).toBe('error');
			expect(request.cache).toBe('no-store');
			expect(request.signal).toBeInstanceOf(AbortSignal);
			expect(request.headers.get('Content-Type')).toBe('application/json');
			expect(request.headers.get('Accept')).toBe('application/json');
			expect(request.headers.has('Authorization')).toBe(false);
			expect(request.headers.has('Idempotency-Key')).toBe(false);
			expect(await body(request)).toEqual({
				env: 'production', publicToken: config.publicToken, timeout: 600,
				total: amountCents / 100, subtotal: amountCents / 100, tax: 0,
				metadata1: attemptId, metadata2: registrationId, items: [], phoneNumber: '7875550100'
			});
			expect(await request.text()).not.toContain(config.privateToken);
		});
	}

	test('registration metadata stays nonblank text up to forty characters, not a UUID', async () => {
		const association = 'fictional-registration'.padEnd(40, 'x');
		const mock = transport(
			envelope({ ecommerceId: reference, auth_token: authorizationToken }),
			Response.json(receipt({ metadata2: association }))
		);
		const client = createAthClient(config, mock.fetch);
		expect(await client.create({ ...createInput, registrationId: association })).toEqual({ reference, authorizationToken });
		expect((await body(mock.requests[0])).metadata2).toBe(association);
		expect(await client.verify({ ...input, registrationId: association })).toEqual({ status: 'completed', transactionId });
		expect((await body(mock.requests[1])).metadata2).toBe(association);
	});

	for (const phone of ['7875550100', '+1 (787) 555-0100', '17875550100', '787.555.0100']) {
		test(`normalizes ATH phone ${phone} to ten digits`, async () => {
			const mock = transport(envelope({ ecommerceId: reference, auth_token: authorizationToken }));
			await createAthClient(config, mock.fetch).create({ ...createInput, phone });
			expect((await body(mock.requests[0])).phoneNumber).toBe('7875550100');
		});
	}

	const invalidInputs = [
		{ amountCents: 0 }, { amountCents: 1499 }, { amountCents: 1500.1 }, { amountCents: 3001 },
		{ amountCents: NaN }, { amountCents: Infinity }, { amountCents: '1500' },
		{ attemptId: '' }, { attemptId: 'not-a-uuid' }, { attemptId: `${attemptId} ` },
		{ attemptId: attemptId.replace('-4111-', '-0111-') }, { attemptId: attemptId.replace('-8111-', '-7111-') },
		{ registrationId: '' }, { registrationId: 'x'.repeat(41) }, { registrationId: ' association ' },
		{ registrationId: 'line\nbreak' }, { phone: '' }, { phone: '+44 7875550100' },
		{ phone: '7875550100 extension 2' }, { phone: '++17875550100' }, { phone: '787555010' }
	];
	for (const [index, change] of invalidInputs.entries()) {
		test(`rejects invalid creation input ${index} before networking`, async () => {
			const mock = transport();
			const error = await failure(() => createAthClient(config, mock.fetch).create({ ...createInput, ...change } as AthCreateInput));
			expect(error.kind).toBe('bad_input');
			expect(error.outcomeUnknown).toBe(false);
			expect(mock.requests).toHaveLength(0);
		});
	}

	for (const field of ['publicToken', 'privateToken']) {
		test(`requires private server configuration: ${field}`, async () => {
			const mock = transport();
			const error = await failure(() => createAthClient({ ...config, [field]: ' ' }, mock.fetch));
			expect(error.kind).toBe('configuration');
			expect(mock.requests).toHaveLength(0);
		});
	}

	for (const data of [
		{}, { ecommerceId: reference }, { ecommerceId: reference, auth_token: '' },
		{ ecommerceId: reference, auth_token: 'header\ninjection' },
		{ ecommerceId: 'not-a-ticket-id', auth_token: authorizationToken }
	]) {
		test(`fails closed on incomplete creation response ${JSON.stringify(data)}`, async () => {
			const mock = transport(envelope(data));
			const error = await failure(() => createAthClient(config, mock.fetch).create(createInput));
			expect(error.kind).toBe('protocol');
			expect(error.operation).toBe('create');
			expect(error.outcomeUnknown).toBe(true);
			expect(mock.requests).toHaveLength(1);
		});
	}

	test('lost creation responses never trigger an automatic retry or a replacement ticket', async () => {
		const mock = transport(() => { throw new Error(`Timeout after accepting ${secrets.join(' ')}`); });
		const error = await failure(() => createAthClient(config, mock.fetch).create(createInput));
		expect(error.kind).toBe('transport');
		expect(error.outcomeUnknown).toBe(true);
		expect(urls(mock)).toEqual([paymentUrl]);
	});
});

describe('ATH verification and authorization', () => {
	test('awaits durable authorization intent before the debit POST', async () => {
		let persisted = false;
		let markCalls = 0;
		let release!: () => void;
		let entered!: () => void;
		const marked = new Promise<void>((resolve) => { release = resolve; });
		const marking = new Promise<void>((resolve) => { entered = resolve; });
		const mock = transport(Response.json([]), ticket('CONFIRM'), () => {
			expect(persisted).toBe(true);
			return ticket('COMPLETED');
		}, Response.json(receipt()));
		const result = createAthClient(config, mock.fetch).verify({ ...input, beforeAuthorize: async () => {
			markCalls++;
			entered();
			await marked;
			persisted = true;
		} });
		await marking;
		expect(urls(mock)).toEqual([searchUrl, findUrl]);
		release();
		expect(await result).toEqual({ status: 'completed', transactionId });
		expect(markCalls).toBe(1);
	});

	test('a rejected persistence callback prevents authorization entirely', async () => {
		const mock = transport(Response.json([]), ticket('CONFIRM'));
		const denied = new Error('Durable ownership unavailable');
		await expect(createAthClient(config, mock.fetch).verify({ ...input, beforeAuthorize: async () => { throw denied; } })).rejects.toBe(denied);
		expect(urls(mock)).toEqual([searchUrl, findUrl]);
	});

	for (const [status, authorize] of [['OPEN', true], ['CANCEL', true], ['CONFIRM', false]] as const) {
		test(`does not mark intent for ${status} with authorize=${authorize}`, async () => {
			const mock = transport(Response.json([]), ticket(status));
			let calls = 0;
			await createAthClient(config, mock.fetch).verify({ ...input, authorize, beforeAuthorize: async () => { calls++; } });
			expect(calls).toBe(0);
			expect(urls(mock)).toEqual([searchUrl, findUrl]);
		});
	}

	test('OPEN is pending after an authenticated merchant search, not a payment', async () => {
		const mock = transport(Response.json([]), ticket('OPEN'));
		expect(await createAthClient(config, mock.fetch).verify(input)).toEqual({ status: 'pending' });
		expect(urls(mock)).toEqual([searchUrl, findUrl]);
		expect(await body(mock.requests[0])).toEqual({
			...config, metadata1: attemptId, metadata2: registrationId
		});
		expect(await body(mock.requests[1])).toEqual({ ecommerceId: reference, publicToken: config.publicToken });
		expect(mock.requests[1].headers.get('Authorization')).toBe(`Bearer ${authorizationToken}`);
	});

	test('CONFIRM authorizes the original ticket with its persisted token, then checks the merchant receipt', async () => {
		const creation = transport(envelope({ ecommerceId: reference, auth_token: authorizationToken }));
		const saved = await createAthClient(config, creation.fetch).create(createInput);
		// A new instance represents another worker/restart: no token is kept in process memory.
		const mock = transport(Response.json([]), ticket('CONFIRM'), ticket('COMPLETED'), Response.json(receipt()));
		expect(await createAthClient(config, mock.fetch).verify({ ...input, ...saved })).toEqual({ status: 'completed', transactionId });
		expect(urls(mock)).toEqual([searchUrl, findUrl, authorizationUrl, searchUrl]);
		const authorization = mock.requests[2];
		expect(authorization.headers.get('Authorization')).toBe(`Bearer ${saved.authorizationToken}`);
		expect(await authorization.text()).toBe('');
		expect(await body(mock.requests[3])).toEqual({
			...config, metadata1: attemptId, metadata2: registrationId, referenceNumber: transactionId
		});
		for (const request of mock.requests) {
			expect(request.method).toBe('POST');
			expect(request.redirect).toBe('error');
			expect(request.cache).toBe('no-store');
			for (const secret of secrets) expect(request.url).not.toContain(secret);
			if (request.url === searchUrl) expect(request.headers.has('Authorization')).toBe(false);
			else expect(await request.clone().text()).not.toContain(config.privateToken);
		}
	});

	test('CONFIRM remains pending in read-only reconciliation mode', async () => {
		const mock = transport(Response.json([]), ticket('CONFIRM'));
		expect(await createAthClient(config, mock.fetch).verify({ ...input, authorize: false })).toEqual({ status: 'pending' });
		expect(urls(mock)).toEqual([searchUrl, findUrl]);
	});

	test('even a successful authorization is pending until merchant search sees the receipt', async () => {
		const mock = transport(Response.json([]), ticket('CONFIRM'), ticket('COMPLETED'), Response.json([]));
		expect(await createAthClient(config, mock.fetch).verify(input)).toEqual({ status: 'pending' });
		expect(urls(mock)).toEqual([searchUrl, findUrl, authorizationUrl, searchUrl]);
	});

	test('a search failure after authorization preserves the uncertain-debit warning', async () => {
			const mock = transport(Response.json([]), ticket('CONFIRM'), ticket('COMPLETED'), new Response('Unavailable', { status: 503 }));
			const error = await failure(() => createAthClient(config, mock.fetch).verify(input));
			expect(error.operation).toBe('search');
			expect(error.status).toBe(503);
			expect(error.outcomeUnknown).toBe(true);
			expect(urls(mock)).toEqual([searchUrl, findUrl, authorizationUrl, searchUrl]);
		});

		test('an already completed ticket is searched but never authorized again', async () => {
		const mock = transport(Response.json([]), ticket('COMPLETED'), Response.json([receipt()]));
		expect(await createAthClient(config, mock.fetch).verify(input)).toEqual({ status: 'completed', transactionId });
		expect(urls(mock)).toEqual([searchUrl, findUrl, searchUrl]);
	});

	test('merchant receipts reconcile after token expiry and do not match payer identity', async () => {
		const mock = transport(Response.json(receipt({
			name: 'A different payer', email: 'payer@example.invalid', phoneNumber: '(939) 555-0100',
			dailyTransactionID: '0001'
		})));
		expect(await createAthClient(config, mock.fetch).verify({ ...input, authorizationToken: 'expired.jwt.capability' }))
			.toEqual({ status: 'completed', transactionId });
		expect(urls(mock)).toEqual([searchUrl]);
		const sent = await body(mock.requests[0]);
		expect(sent).not.toHaveProperty('name');
		expect(sent).not.toHaveProperty('email');
		expect(sent).not.toHaveProperty('phoneNumber');
	});

	test('accepts the $30 receipt with exact expected cents', async () => {
		const mock = transport(Response.json(receipt({ total: 30 })));
		expect(await createAthClient(config, mock.fetch).verify({ ...input, amountCents: 3000 }))
			.toEqual({ status: 'completed', transactionId });
	});

	test('CANCEL does not invent a distinction between cancelled and expired', async () => {
		const mock = transport(Response.json([]), ticket('CANCEL'));
		expect(await createAthClient(config, mock.fetch).verify(input)).toEqual({ status: 'cancelled' });
		expect(mock.requests).toHaveLength(2);
	});

	for (const totalRefundedAmount of [0.01, '7.50', 15]) {
		test(`any verified refund (${totalRefundedAmount}) prevents paid fulfillment`, async () => {
			const mock = transport(Response.json(receipt({ totalRefundedAmount })));
			expect(await createAthClient(config, mock.fetch).verify(input)).toEqual({ status: 'refunded', transactionId });
		});
	}

	for (const overrides of [
		{ total: 30 }, { total: '14.99' }, { total: '15.0001' }, { total: true }, { total: null },
		{ total: '1.5e1' }, { total: ' 15.00' }, { total: 15.000000001 },
		{ metadata1: 'another-attempt' }, { metadata2: 'another-registration' },
		{ ecommerceId: '44444444-4444-4444-8444-444444444444' },
		{ transactionType: 'PAYMENT' }, { transactionType: 'simulated' }, { transactionType: 'REFUND' },
		{ status: 'CONFIRM' }, { status: 'OPEN' }, { status: 'completed' }, { status: 'UNKNOWN' },
		{ referenceNumber: '' }, { referenceNumber: undefined }, { referenceNumber: null }, { referenceNumber: 1 },
		{ referenceNumber: ' padded ' }, { referenceNumber: 'line\nbreak' },
		{ totalRefundedAmount: undefined }, { totalRefundedAmount: -1 }, { totalRefundedAmount: 16 },
		{ totalRefundedAmount: '0.001' }
	]) {
		test(`rejects unproven merchant receipt ${JSON.stringify(overrides)}`, async () => {
			const mock = transport(Response.json(receipt(overrides)));
			const error = await failure(() => createAthClient(config, mock.fetch).verify(input));
			expect(['protocol', 'mismatch']).toContain(error.kind);
			expect(urls(mock)).toEqual([searchUrl]);
		});
	}

	for (const overrides of [
		{ total: 30 }, { metadata1: 'another-attempt' }, { metadata2: 'another-registration' },
		{ ecommerceId: '44444444-4444-4444-8444-444444444444' }, { totalRefundedAmount: 1 },
		{ referenceNumber: transactionId }, { referenceNumber: undefined }
	]) {
		test(`validates the confirmed ticket before any debit ${JSON.stringify(overrides)}`, async () => {
			const mock = transport(Response.json([]), ticket('CONFIRM', overrides));
			await failure(() => createAthClient(config, mock.fetch).verify(input));
			expect(urls(mock)).toEqual([searchUrl, findUrl]);
		});
	}

	for (const status of ['CONFIRMED', 'EXPIRED', 'FAILED', 'completed', 'UNKNOWN']) {
		test(`fails closed on undocumented ticket status ${status}`, async () => {
			const mock = transport(Response.json([]), ticket(status));
			const error = await failure(() => createAthClient(config, mock.fetch).verify(input));
			expect(error.kind).toBe('protocol');
			expect(mock.requests).toHaveLength(2);
		});
	}

	for (const response of [
		() => ticket('CONFIRM'), () => ticket('OPEN'),
		() => ticket('COMPLETED', { ecommerceId: '44444444-4444-4444-8444-444444444444' }),
		() => ticket('COMPLETED', { metadata1: 'another-attempt' }),
		() => ticket('COMPLETED', { total: 30 }),
		() => ticket('COMPLETED', { referenceNumber: '' })
	]) {
		test('authorization must return a completed, matching ticket and a transaction ID', async () => {
			const mock = transport(Response.json([]), ticket('CONFIRM'), response());
			const error = await failure(() => createAthClient(config, mock.fetch).verify(input));
			expect(error.operation).toBe('authorize');
			expect(error.outcomeUnknown).toBe(true);
			expect(urls(mock)).toEqual([searchUrl, findUrl, authorizationUrl]);
		});
	}

	test('rejects a merchant receipt for a different provider transaction', async () => {
		const mock = transport(Response.json([]), ticket('COMPLETED'), Response.json(receipt({ referenceNumber: 'other-transaction' })));
		const error = await failure(() => createAthClient(config, mock.fetch).verify(input));
		expect(error.kind).toBe('mismatch');
	});

	for (const duplicates of [[receipt(), receipt()], [receipt(), receipt({ referenceNumber: 'second-charge' })]]) {
		test('multiple search results require reconciliation, not selecting the first charge', async () => {
			const mock = transport(Response.json(duplicates));
			const error = await failure(() => createAthClient(config, mock.fetch).verify(input));
			expect(error.kind).toBe('ambiguous');
			expect(urls(mock)).toEqual([searchUrl]);
		});
	}

	test('a lost authorization response is never retried automatically', async () => {
		const mock = transport(Response.json([]), ticket('CONFIRM'), () => { throw new Error(secrets.join(' ')); });
		const error = await failure(() => createAthClient(config, mock.fetch).verify(input));
		expect(error.operation).toBe('authorize');
		expect(error.outcomeUnknown).toBe(true);
		expect(urls(mock)).toEqual([searchUrl, findUrl, authorizationUrl]);
	});

	for (const change of [
		{ reference: '' }, { reference: 'transaction-id-not-ecommerce-id' },
		{ reference: reference.replace('-4333-', '-0333-') }, { reference: reference.replace('-8333-', '-7333-') },
		{ authorizationToken: '' }, { authorizationToken: 'unsafe\nheader' },
		{ authorize: 'true' }, { amountCents: 100 }, { registrationId: '' }, { attemptId: 'not-a-uuid' }
	]) {
		test(`rejects invalid verification input ${JSON.stringify(change)}`, async () => {
			const mock = transport();
			const error = await failure(() => createAthClient(config, mock.fetch).verify({ ...input, ...change } as AthVerifyInput));
			expect(error.kind).toBe('bad_input');
			expect(mock.requests).toHaveLength(0);
		});
	}
});

describe('ATH fail-closed transport', () => {
	for (const status of [301, 400, 401, 403, 429, 500, 503]) {
		test(`HTTP ${status} does not leak details or retry a creation`, async () => {
			const mock = transport(new Response(secrets.join(' '), { status, headers: { Location: 'https://example.invalid' } }));
			const error = await failure(() => createAthClient(config, mock.fetch).create(createInput));
			expect(error.kind).toBe('provider');
			expect(error.status).toBe(status);
			expect(error.outcomeUnknown).toBe(true);
			expect(mock.requests).toHaveLength(1);
		});
	}

	for (const response of [
		() => new Response(secrets.join(' ')),
		() => Response.json({ status: 'error', message: secrets.join(' '), errorcode: 'token.expired', data: null }),
		() => Response.json({ status: 'success', data: receipt() }),
		() => Response.json({}), () => Response.json(null), () => Response.json([null])
	]) {
		test('unexpected search responses never become pending or completed proof', async () => {
			const mock = transport(response());
			const error = await failure(() => createAthClient(config, mock.fetch).verify(input));
			expect(['protocol', 'provider', 'mismatch']).toContain(error.kind);
			expect(urls(mock)).toEqual([searchUrl]);
		});
	}

	test('bad merchant credentials cannot fall back to public-token payment proof', async () => {
		const mock = transport(new Response('Private token rejected', { status: 401 }));
		await failure(() => createAthClient(config, mock.fetch).verify(input));
		expect(urls(mock)).toEqual([searchUrl]);
	});

	for (const hangingBody of [false, true]) {
		test(`a bounded timeout includes ${hangingBody ? 'body reading' : 'an unresponsive fetch'}`, async () => {
			const controller = new AbortController();
			const timeout = spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
			try {
				const mock = transport(() => {
					queueMicrotask(() => controller.abort());
					if (!hangingBody) return new Promise<Response>(() => {});
					return new Response(new ReadableStream({ start() {} }));
				});
				const error = await failure(() => createAthClient(config, mock.fetch).create(createInput));
				expect(error.kind).toBe('transport');
				expect(error.outcomeUnknown).toBe(true);
				expect(timeout).toHaveBeenCalledWith(15_000);
				expect(mock.requests).toHaveLength(1);
			} finally {
				timeout.mockRestore();
			}
		});
	}
});
