export type GoogleErrorKind = 'upstream' | 'bad_input' | 'auth' | 'configuration';

export class GoogleApiError extends Error {
	readonly kind: GoogleErrorKind;
	readonly status?: number;

	constructor(kind: GoogleErrorKind, message: string, status?: number) {
		super(message);
		this.name = new.target.name;
		this.kind = kind;
		if (typeof status === 'number' && Number.isFinite(status)) this.status = status;
	}
}

export type GoogleCredentials = {
	clientId: string;
	clientSecret: string;
	refreshToken: string;
};

export type GoogleClientOptions = {
	fetch?: typeof globalThis.fetch;
	timeoutMs?: number;
};

type AccessToken = { value: string; expiresAt: number };
type TokenRefresh = {
	promise: Promise<AccessToken>;
	controller: AbortController;
	waiters: number;
};

const tokenUrl = 'https://oauth2.googleapis.com/token';
const defaultTimeoutMs = 30_000;
const tokenExpiryBufferMs = 60_000;

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNonblank(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

export function createGoogleClient(
	config: GoogleCredentials,
	options: GoogleClientOptions & { service: string; error: typeof GoogleApiError }
): { request(url: string, init: RequestInit, signal?: AbortSignal): Promise<{ data: unknown; status: number }> } {
	const ApiError = options.error;
	// Service labels are fixed so a misconfigured caller cannot expose private values in errors.
	const service = options.service === 'Google Drive' || options.service === 'Gmail' ? options.service : 'Google API';
	const configurationService = service === 'Google Drive' ? 'Drive' : service;
	if (!config || ![config.clientId, config.clientSecret, config.refreshToken].every(isNonblank)) {
		throw new ApiError('configuration', `${configurationService} client configuration requires nonblank credentials.`);
	}
	const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
	if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) {
		throw new ApiError('configuration', `${configurationService} timeoutMs must be a positive, supported integer.`);
	}
	const requestFetch = options.fetch ?? globalThis.fetch;
	const { clientId, clientSecret, refreshToken } = config;
	let cachedToken: AccessToken | undefined;
	let pendingRefresh: TokenRefresh | undefined;

	function cancelled(): GoogleApiError {
		return new ApiError('upstream', `${service} request was cancelled.`);
	}

	// Racing also bounds injected fetch implementations and body readers that ignore the signal.
	async function withSignal<T>(signal: AbortSignal | undefined, work: () => Promise<T>): Promise<T> {
		if (signal?.aborted) throw cancelled();
		if (!signal) return work();

		let onAbort!: () => void;
		const aborted = new Promise<never>((_, reject) => {
			onAbort = () => reject(cancelled());
			signal.addEventListener('abort', onAbort, { once: true });
		});
		try {
			return await Promise.race([work(), aborted]);
		} finally {
			signal.removeEventListener('abort', onAbort);
		}
	}

	function responseError(status: number, oauthError?: unknown): GoogleApiError {
		const kind: GoogleErrorKind = status === 401 || status === 403 ||
			(status === 400 && (oauthError === 'invalid_grant' || oauthError === 'invalid_client'))
			? 'auth'
			: status === 429 || status >= 500 || status < 400
				? 'upstream'
				: 'bad_input';
		return new ApiError(kind, `${service} request was rejected.`, status);
	}

	async function requestJson(url: string, init: RequestInit, signal?: AbortSignal, oauth = false) {
		const controller = new AbortController();
		let timedOut = false;
		const onAbort = () => controller.abort();
		signal?.addEventListener('abort', onAbort, { once: true });
		if (signal?.aborted) controller.abort();
		const timer = setTimeout(() => {
			timedOut = true;
			controller.abort();
		}, timeoutMs);

		try {
			return await withSignal(controller.signal, async () => {
				let response: Response;
				try {
					// Never follow redirects with OAuth credentials or a bearer token.
					response = await requestFetch(url, { ...init, redirect: 'error', signal: controller.signal });
				} catch {
					throw new ApiError('upstream', `${service} request failed.`);
				}
				if (!response.ok) {
					let oauthError: unknown;
					if (oauth && response.status === 400) {
						try {
							const data: unknown = await response.json();
							if (isRecord(data)) oauthError = data.error;
						} catch {
							// Only the OAuth error code affects classification; never expose its description.
						}
					} else {
						void response.body?.cancel().catch(() => {});
					}
					throw responseError(response.status, oauthError);
				}
				try {
					const data: unknown = await response.json();
					return { data, status: response.status };
				} catch {
					throw new ApiError('upstream', `${service} returned invalid JSON.`, response.status);
				}
			});
		} catch (error) {
			if (controller.signal.aborted) {
				if (timedOut) throw new ApiError('upstream', `${service} request timed out.`);
				throw cancelled();
			}
			if (error instanceof ApiError) throw error;
			throw new ApiError('upstream', `${service} request failed.`);
		} finally {
			clearTimeout(timer);
			signal?.removeEventListener('abort', onAbort);
		}
	}

	async function requestAccessToken(signal: AbortSignal): Promise<AccessToken> {
		const requestedAt = Date.now();
		const { data, status } = await requestJson(tokenUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'refresh_token',
				client_id: clientId,
				client_secret: clientSecret,
				refresh_token: refreshToken
			})
		}, signal, true);

		if (!isRecord(data) || typeof data.access_token !== 'string' ||
			!/^[A-Za-z0-9\-._~+/]+=*$/.test(data.access_token) ||
			typeof data.token_type !== 'string' || data.token_type.toLowerCase() !== 'bearer' ||
			typeof data.expires_in !== 'number' || !Number.isSafeInteger(data.expires_in) || data.expires_in <= 0 ||
			!Number.isSafeInteger(requestedAt + data.expires_in * 1000)) {
			throw new ApiError('upstream', 'Google OAuth returned an invalid token response.', status);
		}
		const lifetimeMs = data.expires_in * 1000;
		return {
			value: data.access_token,
			expiresAt: requestedAt + lifetimeMs - Math.min(tokenExpiryBufferMs, lifetimeMs / 10)
		};
	}

	async function accessToken(signal?: AbortSignal): Promise<string> {
		if (signal?.aborted) throw cancelled();
		if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;
		if (!pendingRefresh) {
			const controller = new AbortController();
			// Subscribe waiters before an injected fetch can synchronously trigger cancellation.
			const promise = Promise.resolve().then(() => requestAccessToken(controller.signal)).then((token) => {
				if (!controller.signal.aborted) cachedToken = token;
				return token;
			}).finally(() => {
				if (pendingRefresh?.promise === promise) pendingRefresh = undefined;
			});
			pendingRefresh = { promise, controller, waiters: 0 };
		}
		const refresh = pendingRefresh;
		refresh.waiters += 1;
		try {
			return (await withSignal(signal, () => refresh.promise)).value;
		} finally {
			refresh.waiters -= 1;
			// One cancelled caller must not abort a refresh still needed by another caller.
			if (refresh.waiters === 0 && pendingRefresh === refresh) {
				pendingRefresh = undefined;
				refresh.controller.abort();
			}
		}
	}

	return {
		async request(url, init, signal) {
			signal ??= init.signal ?? undefined;
			const token = await accessToken(signal);
			try {
				const headers = new Headers(init.headers);
				headers.set('Authorization', `Bearer ${token}`);
				return await requestJson(url, { ...init, headers }, signal);
			} catch (error) {
				if (error instanceof ApiError) {
					if (error.kind === 'auth' && cachedToken?.value === token) cachedToken = undefined;
					// A write may have succeeded even if its response was lost. Never retry it here.
					throw error;
				}
				throw new ApiError('upstream', `${service} request failed.`);
			}
		}
	};
}
