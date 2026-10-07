import { depositCents, priceCents } from '../../bootcamp/types';

export type AthConfig = { publicToken: string; privateToken: string };
export type AthExpectedPayment = { attemptId: string; registrationId: string; amountCents: number };
export type AthCreateInput = AthExpectedPayment & { phone: string };
export type AthPayment = {
	reference: string;
	/** Secret transaction capability. Persist server-side with the reference, never in the browser. */
	authorizationToken: string;
	expiresAt?: Date;
};
export type AthVerifyInput = AthExpectedPayment & {
	reference: string;
	authorizationToken: string;
	/** Set false for read-only reconciliation, especially after an ambiguous authorization. */
	authorize?: boolean;
	/** Await durable debit intent; rejection MUST prevent the authorization request. */
	beforeAuthorize?: () => Promise<void>;
};
export type AthVerification = {
	status: 'pending' | 'completed' | 'cancelled' | 'expired' | 'refunded';
	transactionId?: string;
};
export type AthClient = {
	create(input: AthCreateInput): Promise<AthPayment>;
	verify(input: AthVerifyInput): Promise<AthVerification>;
};
export type AthOperation = 'create' | 'find' | 'authorize' | 'search';
export type AthErrorKind = 'configuration' | 'bad_input' | 'transport' | 'provider' | 'protocol' | 'mismatch' | 'ambiguous';

const errorMessages: Record<AthErrorKind, string> = {
	configuration: 'ATH credentials must both be configured on the server.',
	bad_input: 'Invalid ATH payment input.',
	transport: 'ATH request failed or timed out.',
	provider: 'ATH rejected the request.',
	protocol: 'ATH returned an undocumented or incomplete response.',
	mismatch: 'ATH payment does not match the expected payment attempt.',
	ambiguous: 'ATH returned multiple transactions for one payment attempt.'
};

export class AthError extends Error {
	readonly kind: AthErrorKind;
	readonly operation?: AthOperation;
	readonly outcomeUnknown: boolean;
	readonly status?: number;

	constructor(kind: AthErrorKind, operation?: AthOperation, status?: number, outcomeUnknown = false) {
		super(errorMessages[kind]);
		this.name = 'AthError';
		this.kind = kind;
		this.operation = operation;
		// Once a mutation is sent, even an error response is not permission to retry it.
		this.outcomeUnknown = outcomeUnknown || operation === 'create' || operation === 'authorize';
		if (typeof status === 'number' && Number.isFinite(status)) this.status = status;
	}
}

const ecommerceUrl = 'https://payments.athmovil.com/api/business-transaction/ecommerce';
const urls: Record<AthOperation, string> = {
	create: `${ecommerceUrl}/payment`,
	find: `${ecommerceUrl}/business/findPayment`,
	authorize: `${ecommerceUrl}/authorization`,
	search: 'https://www.athmovil.com/api/v4/searchTransaction'
};
const uuidPattern = /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const bearerPattern = /^[A-Za-z0-9\-._~+/]+=*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0 && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value);
}

function validateExpected(input: AthExpectedPayment): void {
	if (!isText(input.attemptId) || !uuidPattern.test(input.attemptId) ||
		!isText(input.registrationId) || input.registrationId.length > 40 ||
		!Number.isSafeInteger(input.amountCents) || ![depositCents, priceCents].includes(input.amountCents)) {
		throw new AthError('bad_input');
	}
}

export function normalizeAthPhone(value: string): string {
	if (typeof value !== 'string' || value.length > 40) throw new AthError('bad_input');
	const match = /^(?:\+?1)?(\d{10})$/.exec(value.replace(/[\s().-]/g, ''));
	if (!match) throw new AthError('bad_input');
	return match[1];
}

function cents(value: unknown, operation: AthOperation): number {
	if (typeof value !== 'number' && typeof value !== 'string') throw new AthError('protocol', operation);
	const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
	if (!match) throw new AthError('protocol', operation);
	const result = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
	if (!Number.isSafeInteger(result)) throw new AthError('protocol', operation);
	return result;
}

function paymentData(value: unknown, operation: AthOperation): Record<string, unknown> {
	if (isRecord(value) && value.status === 'error') throw new AthError('provider', operation);
	if (!isRecord(value) || value.status !== 'success' || !isRecord(value.data)) {
		throw new AthError('protocol', operation);
	}
	return value.data;
}

function matchPayment(data: Record<string, unknown>, input: AthExpectedPayment, operation: AthOperation): void {
	if (data.metadata1 !== input.attemptId || data.metadata2 !== input.registrationId ||
		cents(data.total, operation) !== input.amountCents) {
		throw new AthError('mismatch', operation);
	}
}

function referenceNumber(data: Record<string, unknown>, operation: AthOperation): string {
	if (!isText(data.referenceNumber)) throw new AthError('protocol', operation);
	return data.referenceNumber;
}

function refundedCents(data: Record<string, unknown>, amountCents: number, operation: AthOperation): number {
	const refunded = cents(data.totalRefundedAmount, operation);
	if (refunded > amountCents) throw new AthError('protocol', operation);
	return refunded;
}

/** No retries, environment reads, browser callbacks, or webhook payloads inside this adapter. */
export function createAthClient(config: AthConfig, requestFetch: typeof globalThis.fetch = globalThis.fetch): AthClient {
	if (!isText(config.publicToken) || !isText(config.privateToken)) throw new AthError('configuration');
	const { publicToken, privateToken } = config;

	async function request(operation: AthOperation, body?: Record<string, unknown>, token?: string): Promise<unknown> {
		const signal = AbortSignal.timeout(15_000);
		let onAbort!: () => void;
		const aborted = new Promise<never>((_, reject) => {
			onAbort = () => reject(new AthError('transport', operation));
			signal.addEventListener('abort', onAbort, { once: true });
			if (signal.aborted) onAbort();
		});
		try {
			return await Promise.race([aborted, (async () => {
				if (signal.aborted) throw new AthError('transport', operation);
				const response = await requestFetch(urls[operation], {
					method: 'POST',
					headers: {
						Accept: 'application/json',
						'Content-Type': 'application/json',
						...(token ? { Authorization: `Bearer ${token}` } : {})
					},
					body: body === undefined ? undefined : JSON.stringify(body),
					redirect: 'error',
					cache: 'no-store',
					signal
				});
				if (!response.ok) {
					void response.body?.cancel().catch(() => {});
					throw new AthError('provider', operation, response.status);
				}
				try {
					return await response.json() as unknown;
				} catch {
					throw new AthError('protocol', operation);
				}
			})()]);
		} catch (error) {
			if (error instanceof AthError) throw error;
			// Upstream bodies, fetch errors and causes can contain credentials or payer details.
			throw new AthError('transport', operation);
		} finally {
			signal.removeEventListener('abort', onAbort);
		}
	}

	async function search(input: AthVerifyInput, transactionId?: string): Promise<AthVerification | null> {
		const value = await request('search', {
			publicToken, privateToken,
			metadata1: input.attemptId,
			metadata2: input.registrationId,
			...(transactionId ? { referenceNumber: transactionId } : {})
		});
		if (isRecord(value) && value.status === 'error') throw new AthError('provider', 'search');
		// The official search service returns a bare object or a list, not a success/data envelope.
		const results = Array.isArray(value) ? value : [value];
		if (results.length === 0) return null;
		if (results.length !== 1) throw new AthError('ambiguous', 'search');
		const data: unknown = results[0];
		if (!isRecord(data)) throw new AthError('protocol', 'search');
		matchPayment(data, input, 'search');
		if (data.transactionType !== 'ECOMMERCE' || data.status !== 'COMPLETED') {
			throw new AthError('protocol', 'search');
		}
		// Search does not promise an ecommerceId, so the immutable UUID metadata binds the receipt.
		if (data.ecommerceId !== undefined && data.ecommerceId !== input.reference) throw new AthError('mismatch', 'search');
		const id = referenceNumber(data, 'search');
		if (transactionId !== undefined && id !== transactionId) throw new AthError('mismatch', 'search');
		const refunded = refundedCents(data, input.amountCents, 'search');
		return { status: refunded > 0 ? 'refunded' : 'completed', transactionId: id };
	}

	function ticket(value: unknown, input: AthVerifyInput, operation: 'find' | 'authorize') {
		const data = paymentData(value, operation);
		matchPayment(data, input, operation);
		if (data.ecommerceId !== input.reference) throw new AthError('mismatch', operation);
		const refunded = refundedCents(data, input.amountCents, operation);
		if (data.ecommerceStatus !== 'COMPLETED' && (refunded !== 0 || data.referenceNumber !== '')) {
			throw new AthError('protocol', operation);
		}
		return data;
	}

	return {
		async create(input) {
			validateExpected(input);
			const phone = normalizeAthPhone(input.phone);
			const data = paymentData(await request('create', {
				env: 'production', publicToken, timeout: 600,
				total: input.amountCents / 100, subtotal: input.amountCents / 100, tax: 0,
				metadata1: input.attemptId, metadata2: input.registrationId,
				items: [], phoneNumber: phone
			}), 'create');
			if (!isText(data.ecommerceId) || !uuidPattern.test(data.ecommerceId) ||
				!isText(data.auth_token) || !bearerPattern.test(data.auth_token)) {
				throw new AthError('protocol', 'create');
			}
			// There is no authoritative expiresAt in the documented payment response.
			return { reference: data.ecommerceId, authorizationToken: data.auth_token };
		},

		async verify(input) {
			validateExpected(input);
			if (!isText(input.reference) || !uuidPattern.test(input.reference) ||
				!isText(input.authorizationToken) || !bearerPattern.test(input.authorizationToken) ||
				(input.authorize !== undefined && typeof input.authorize !== 'boolean') ||
								(input.beforeAuthorize !== undefined && typeof input.beforeAuthorize !== 'function')) {
				throw new AthError('bad_input');
			}
			// Search first also permits reconciliation/refund detection after the ticket JWT expires.
			const existing = await search(input);
			if (existing) return existing;
			const found = ticket(await request('find', {
				ecommerceId: input.reference, publicToken
			}, input.authorizationToken), input, 'find');
			if (found.ecommerceStatus === 'OPEN') return { status: 'pending' };
			// The REST API deliberately uses CANCEL for both cancellation and expiration.
			if (found.ecommerceStatus === 'CANCEL') return { status: 'cancelled' };
			let settled = found;
			if (found.ecommerceStatus === 'CONFIRM') {
				if (input.authorize === false) return { status: 'pending' };
				await input.beforeAuthorize?.();
				// Current REST authorization is an EMPTY-body POST with the saved transaction JWT.
				settled = ticket(await request('authorize', undefined, input.authorizationToken), input, 'authorize');
				if (settled.ecommerceStatus !== 'COMPLETED') throw new AthError('protocol', 'authorize');
			} else if (found.ecommerceStatus !== 'COMPLETED') {
				throw new AthError('protocol', 'find');
			}
			const id = referenceNumber(settled, found.ecommerceStatus === 'CONFIRM' ? 'authorize' : 'find');
			// Neither CONFIRM nor the authorization response itself is merchant-authenticated proof.
			try {
				return await search(input, id) ?? { status: 'pending' };
			} catch (error) {
				if (found.ecommerceStatus === 'CONFIRM' && error instanceof AthError) {
					throw new AthError(error.kind, error.operation, error.status, true);
				}
				throw error;
			}
		}
	};
}
