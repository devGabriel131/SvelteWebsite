import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import {
	createGoogleClient, GoogleApiError, type GoogleClientOptions, type GoogleCredentials, type GoogleErrorKind
} from '../src/lib/server/google/client';

class DriveError extends GoogleApiError {}
class GmailError extends GoogleApiError {}

const config: GoogleCredentials = {
	clientId: 'test-client-id', clientSecret: 'test-client-secret+&=', refreshToken: 'test-refresh-token+&='
};
const token = { access_token: 'test-access-token', token_type: 'Bearer', expires_in: 3600 };
const tokenUrl = 'https://oauth2.googleapis.com/token';
const apiUrl = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const sensitive = Object.values(config).concat(token.access_token);

function mockFetch(handler: (request: Request) => Response | Promise<Response>) {
	const requests: Request[] = [];
	const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
		const request = new Request(input, init);
		requests.push(request);
		return handler(request);
	};
	return { fetch: fetch as typeof globalThis.fetch, requests };
}

const logged: unknown[][] = [];
const spies: Array<{ mockRestore(): void }> = [];
beforeEach(() => {
	for (const method of ['log', 'info', 'warn', 'error', 'debug', 'trace', 'dir'] as const) {
		spies.push(spyOn(console, method).mockImplementation((...args: unknown[]) => { logged.push(args); }));
	}
});
afterEach(() => {
	for (const spy of spies.splice(0)) spy.mockRestore();
	expect(logged.splice(0)).toEqual([]);
});

async function failure(work: () => unknown, ErrorType: typeof GoogleApiError) {
	try {
		await work();
	} catch (error) {
		expect(error).toBeInstanceOf(ErrorType);
		expect(error).toBeInstanceOf(GoogleApiError);
		const result = error as GoogleApiError;
		expect(result.name).toBe(ErrorType.name);
		expect(result).not.toHaveProperty('cause');
		for (const secret of sensitive) {
			const exposed = `${String(result)} ${result.stack} ${JSON.stringify(result)} ${Bun.inspect(result)}`;
			expect(exposed).not.toContain(secret);
			expect(exposed).not.toContain(encodeURIComponent(secret));
		}
		return result;
	}
	throw new Error('Expected a safe Google API error.');
}

describe('shared Google client contract', () => {
	test('retains subclass names and only finite numeric statuses', () => {
		for (const ErrorType of [GoogleApiError, DriveError, GmailError]) {
			const error = new ErrorType('auth', 'Safe message.', 401);
			expect(error).toBeInstanceOf(Error);
			expect(error).toBeInstanceOf(GoogleApiError);
			expect(error.name).toBe(ErrorType.name);
			expect(error.kind).toBe('auth');
			expect(error.status).toBe(401);
			for (const status of [undefined, NaN, Infinity, -Infinity, token.access_token]) {
				expect(new ErrorType('upstream', 'Safe message.', status as number).status).toBeUndefined();
			}
		}
	});

	const headerFormats: [string, HeadersInit][] = [
		['record', { authorization: 'replace-me', 'Content-Type': 'application/json' }],
		['tuples', [['authorization', 'replace-me'], ['Content-Type', 'application/json']]],
		['Headers', new Headers({ authorization: 'replace-me', 'Content-Type': 'application/json' })]
	];
	for (const [format, headers] of headerFormats) {
		test(`merges ${format} headers without mutation and protects OAuth and bearer redirects`, async () => {
			const transport = mockFetch((request) => Response.json(request.url === tokenUrl ? token : { id: 'sent' }, {
				status: request.url === tokenUrl ? 200 : 201
			}));
			const client = createGoogleClient(config, { service: 'Gmail', error: GmailError, fetch: transport.fetch });
			const init = {
				method: 'POST', headers, body: JSON.stringify({ raw: 'test-message' }), redirect: 'follow', cache: 'no-store'
			} satisfies RequestInit;
			expect(await client.request(apiUrl, init)).toEqual({ data: { id: 'sent' }, status: 201 });
			expect(await client.request(apiUrl, init)).toEqual({ data: { id: 'sent' }, status: 201 });
			expect(transport.requests).toHaveLength(3);
			const [oauth, ...requests] = transport.requests;
			expect(oauth.url).toBe(tokenUrl);
			expect(oauth.method).toBe('POST');
			expect(oauth.redirect).toBe('error');
			expect(oauth.headers.has('Authorization')).toBe(false);
			expect(oauth.headers.get('Content-Type')).toBe('application/x-www-form-urlencoded');
			expect(Object.fromEntries(new URLSearchParams(await oauth.text()))).toEqual({
				grant_type: 'refresh_token', client_id: config.clientId,
				client_secret: config.clientSecret, refresh_token: config.refreshToken
			});
			for (const request of requests) {
				expect(request.url).toBe(apiUrl);
				expect(request.method).toBe('POST');
				expect(request.redirect).toBe('error');
				expect(request.cache).toBe('no-store');
				expect(request.headers.get('Authorization')).toBe(`Bearer ${token.access_token}`);
				expect(request.headers.get('Content-Type')).toBe('application/json');
				expect(await request.text()).toBe(init.body);
			}
			expect(new Headers(headers).get('Authorization')).toBe('replace-me');
			expect(init.redirect).toBe('follow');
			expect(Object.keys(client)).toEqual(['request']);
			for (const secret of sensitive) expect(JSON.stringify(client)).not.toContain(secret);
		});
	}

	test('validates credentials and timeout settings without exposing values or networking', async () => {
		const transport = mockFetch(() => { throw new Error('Unexpected network request.'); });
		const options = { service: 'Gmail', error: GmailError, fetch: transport.fetch };
		for (const key of Object.keys(config) as (keyof GoogleCredentials)[]) {
			const error = await failure(() => createGoogleClient({ ...config, [key]: ' \n' }, options), GmailError);
			expect(error.kind).toBe('configuration');
		}
		for (const timeoutMs of [0, -1, 0.5, NaN, Infinity, 2_147_483_648, token.access_token]) {
			const error = await failure(() => createGoogleClient(config, {
				...options, timeoutMs: timeoutMs as GoogleClientOptions['timeoutMs']
			}), GmailError);
			expect(error.kind).toBe('configuration');
			expect(error.message).toBe('Gmail timeoutMs must be a positive, supported integer.');
		}
		expect(transport.requests).toHaveLength(0);
	});

	test('does not expose an unrecognized service label in safe errors', async () => {
		const error = await failure(() => createGoogleClient(config, {
			service: sensitive.join(' '), error: GmailError, timeoutMs: 0
		}), GmailError);
		expect(error.message).toBe('Google API timeoutMs must be a positive, supported integer.');
	});

	test('sanitizes header construction errors using the supplied subclass', async () => {
		const transport = mockFetch(() => Response.json(token));
		const client = createGoogleClient(config, { service: 'Gmail', error: GmailError, fetch: transport.fetch });
		const error = await failure(() => client.request(apiUrl, {
			headers: { 'Content-Type': `${sensitive.join(' ')}\r\ninvalid` }
		}), GmailError);
		expect(error.kind).toBe('upstream');
		expect(error.message).toBe('Gmail request failed.');
		expect(transport.requests).toHaveLength(1);
	});

	test('honors cancellation from RequestInit as well as the explicit signal argument', async () => {
		const transport = mockFetch(() => { throw new Error('Unexpected network request.'); });
		const client = createGoogleClient(config, { service: 'Gmail', error: GmailError, fetch: transport.fetch });
		const controller = new AbortController();
		controller.abort(sensitive.join(' '));
		for (const work of [
			() => client.request(apiUrl, { signal: controller.signal }),
			() => client.request(apiUrl, {}, controller.signal)
		]) {
			const error = await failure(work, GmailError);
			expect(error.message).toBe('Gmail request was cancelled.');
		}
		expect(transport.requests).toHaveLength(0);
	});
});

describe('Google response trust boundary', () => {
	const statuses: [number, GoogleErrorKind][] = [
		[400, 'bad_input'], [401, 'auth'], [403, 'auth'], [404, 'bad_input'], [409, 'bad_input'],
		[422, 'bad_input'], [429, 'upstream'], [500, 'upstream'], [503, 'upstream'], [302, 'upstream']
	];
	for (const stage of ['oauth', 'api'] as const) {
		for (const [status, kind] of statuses) {
			test(`${stage} classifies HTTP ${status} without exposing its body or retrying`, async () => {
				const transport = mockFetch((request) => stage === 'api' && request.url === tokenUrl
					? Response.json(token) : new Response(sensitive.join(' '), { status }));
				const client = createGoogleClient(config, { service: 'Gmail', error: GmailError, fetch: transport.fetch });
				const error = await failure(() => client.request(apiUrl, { method: 'POST', body: '{}' }), GmailError);
				expect(error.kind).toBe(kind);
				expect(error.status).toBe(status);
				expect(error.message).toBe('Gmail request was rejected.');
				expect(transport.requests).toHaveLength(stage === 'oauth' ? 1 : 2);
			});
		}
		for (const outcome of ['lost response', 'invalid JSON', 'body reader exception'] as const) {
			test(`${stage} ${outcome} is sanitized and never retried`, async () => {
				const transport = mockFetch(async (request) => {
					if (stage === 'api' && request.url === tokenUrl) return Response.json(token);
					if (outcome === 'lost response') {
						await request.clone().text();
						throw new Error(sensitive.join(' '), { cause: new Error(token.access_token) });
					}
					const response = new Response(sensitive.join(' '));
					if (outcome === 'body reader exception') {
						response.json = async () => { throw new Error(sensitive.join(' '), { cause: new Error(token.access_token) }); };
					}
					return response;
				});
				const client = createGoogleClient(config, { service: 'Gmail', error: GmailError, fetch: transport.fetch });
				const error = await failure(() => client.request(apiUrl, { method: 'POST', body: '{}' }), GmailError);
				expect(error.kind).toBe('upstream');
				expect(error.status).toBe(outcome === 'lost response' ? undefined : 200);
				expect(error.message).toBe(outcome === 'lost response' ? 'Gmail request failed.' : 'Gmail returned invalid JSON.');
				expect(transport.requests).toHaveLength(stage === 'oauth' ? 1 : 2);
			});
		}
	}

	for (const code of ['invalid_grant', 'invalid_client', 'invalid_scope', 'invalid_request', token.access_token]) {
		test(`classifies OAuth 400 ${code} without exposing its description`, async () => {
			const transport = mockFetch(() => Response.json({ error: code, error_description: sensitive.join(' ') }, { status: 400 }));
			const client = createGoogleClient(config, { service: 'Gmail', error: GmailError, fetch: transport.fetch });
			const error = await failure(() => client.request(apiUrl, {}), GmailError);
			expect(error.kind).toBe(['invalid_grant', 'invalid_client'].includes(code) ? 'auth' : 'bad_input');
			expect(error.status).toBe(400);
			expect(transport.requests).toHaveLength(1);
		});
	}

	test('rejects malformed token payloads and expiry overflow before any API request', async () => {
		const invalid = [
			null, [], {}, { ...token, access_token: undefined }, { ...token, access_token: '' },
			{ ...token, access_token: ' ' }, { ...token, access_token: 123 },
			{ ...token, access_token: 'token\r\nInjected: yes' }, { ...token, access_token: 'token with spaces' },
			{ ...token, token_type: undefined }, { ...token, token_type: 'Basic' }, { ...token, token_type: 1 },
			...[undefined, 0, -1, 1.5, '3600', null, 1e30, Number.MAX_SAFE_INTEGER, Math.floor(Number.MAX_SAFE_INTEGER / 1000)]
				.map((expires_in) => ({ ...token, expires_in }))
		];
		for (const data of invalid) {
			const transport = mockFetch(() => Response.json(data));
			const client = createGoogleClient(config, { service: 'Gmail', error: GmailError, fetch: transport.fetch });
			const error = await failure(() => client.request(apiUrl, {}), GmailError);
			expect(error.kind).toBe('upstream');
			expect(error.status).toBe(200);
			expect(error.message).toBe('Google OAuth returned an invalid token response.');
			expect(transport.requests).toHaveLength(1);
		}
	});
});

describe('Google token lifetime', () => {
	test('coalesces concurrent refreshes and reuses the token', async () => {
		const started = Promise.withResolvers<void>();
		const response = Promise.withResolvers<Response>();
		const transport = mockFetch((request) => {
			if (request.url === tokenUrl) {
				started.resolve();
				return response.promise;
			}
			return Response.json({ id: 'id' });
		});
		const client = createGoogleClient(config, { service: 'Gmail', error: GmailError, fetch: transport.fetch });
		const operations = [client.request(apiUrl, {}), client.request(apiUrl, {}), client.request(apiUrl, {})];
		await started.promise;
		expect(transport.requests).toHaveLength(1);
		response.resolve(Response.json(token));
		expect(await Promise.all(operations)).toEqual(Array(3).fill({ data: { id: 'id' }, status: 200 }));
		await client.request(apiUrl, {});
		expect(transport.requests.filter((request) => request.url === tokenUrl)).toHaveLength(1);
		expect(transport.requests).toHaveLength(5);
	});

	test('refreshes exactly at the expiry buffer', async () => {
		const clock = spyOn(Date, 'now').mockReturnValue(1_000_000);
		try {
			let refreshes = 0;
			const transport = mockFetch((request) => Response.json(request.url === tokenUrl
				? { ...token, access_token: `token-${++refreshes}` } : { id: 'id' }));
			const client = createGoogleClient(config, { service: 'Gmail', error: GmailError, fetch: transport.fetch });
			await client.request(apiUrl, {});
			clock.mockReturnValue(1_000_000 + 3_540_000 - 1);
			await client.request(apiUrl, {});
			expect(refreshes).toBe(1);
			clock.mockReturnValue(1_000_000 + 3_540_000);
			await Promise.all([client.request(apiUrl, {}), client.request(apiUrl, {})]);
			expect(refreshes).toBe(2);
			expect(transport.requests.filter((request) => request.url !== tokenUrl)
				.map((request) => request.headers.get('Authorization')))
				.toEqual(['Bearer token-1', 'Bearer token-1', 'Bearer token-2', 'Bearer token-2']);
		} finally {
			clock.mockRestore();
		}
	});

	test('failed shared refresh is not cached; only a later explicit call tries again', async () => {
		const started = Promise.withResolvers<void>();
		const response = Promise.withResolvers<Response>();
		let refreshes = 0;
		const transport = mockFetch((request) => {
			if (request.url === tokenUrl) {
				if (++refreshes > 1) return Response.json(token);
				started.resolve();
				return response.promise;
			}
			return Response.json({ id: 'id' });
		});
		const client = createGoogleClient(config, { service: 'Gmail', error: GmailError, fetch: transport.fetch });
		const first = failure(() => client.request(apiUrl, {}), GmailError);
		const second = failure(() => client.request(apiUrl, {}), GmailError);
		await started.promise;
		response.resolve(new Response(token.access_token, { status: 503 }));
		expect((await first).kind).toBe('upstream');
		expect((await second).kind).toBe('upstream');
		expect(transport.requests).toHaveLength(1);
		expect(await client.request(apiUrl, {})).toEqual({ data: { id: 'id' }, status: 200 });
		expect(refreshes).toBe(2);
	});

	for (const status of [401, 403]) {
		test(`HTTP ${status} invalidates only for the next explicit call, never replaying`, async () => {
			let calls = 0;
			const transport = mockFetch((request) => request.url === tokenUrl ? Response.json(token)
				: ++calls === 1 ? new Response(token.access_token, { status }) : Response.json({ id: 'id' }));
			const client = createGoogleClient(config, { service: 'Gmail', error: GmailError, fetch: transport.fetch });
			expect((await failure(() => client.request(apiUrl, { method: 'POST', body: '{}' }), GmailError)).kind).toBe('auth');
			expect(calls).toBe(1);
			expect(transport.requests).toHaveLength(2);
			await client.request(apiUrl, { method: 'POST', body: '{}' });
			expect(transport.requests.filter((request) => request.url === tokenUrl)).toHaveLength(2);
		});
	}

	test('keeps separate clients and their credential snapshots independent', async () => {
		let refreshes = 0;
		const transport = mockFetch((request) => Response.json(request.url === tokenUrl
			? { ...token, access_token: `service-token-${++refreshes}` } : { id: 'id' }));
		const mutable = { ...config };
		const first = createGoogleClient(mutable, { service: 'Gmail', error: GmailError, fetch: transport.fetch });
		const secondConfig = { ...config, refreshToken: 'second-refresh-token' };
		const second = createGoogleClient(secondConfig, { service: 'Gmail', error: GmailError, fetch: transport.fetch });
		Object.assign(mutable, { clientId: 'changed', clientSecret: 'changed', refreshToken: 'changed' });
		for (let round = 0; round < 2; round += 1) {
			await first.request(apiUrl, {});
			await second.request(apiUrl, {});
		}
		const refreshRequests = transport.requests.filter((request) => request.url === tokenUrl);
		expect(refreshRequests).toHaveLength(2);
		expect(Object.fromEntries(new URLSearchParams(await refreshRequests[0].text()))).toEqual({
			grant_type: 'refresh_token', client_id: config.clientId, client_secret: config.clientSecret, refresh_token: config.refreshToken
		});
		expect(new URLSearchParams(await refreshRequests[1].text()).get('refresh_token')).toBe(secondConfig.refreshToken);
		expect(transport.requests.filter((request) => request.url !== tokenUrl)
			.map((request) => request.headers.get('Authorization')))
			.toEqual(['Bearer service-token-1', 'Bearer service-token-2', 'Bearer service-token-1', 'Bearer service-token-2']);
	});
});

describe('Google deadline and cancellation', () => {
	// These exercise native timeout-to-AbortSignal behavior, including work that ignores abort.
	for (const stage of ['oauth', 'api'] as const) {
		for (const stalled of ['fetch', 'body'] as const) {
			test(`bounds stalled ${stage} ${stalled} even when injected work ignores abort`, async () => {
				const transport = mockFetch((request) => {
					if (stage === 'api' && request.url === tokenUrl) return Response.json(token);
					if (stalled === 'fetch') return Promise.withResolvers<Response>().promise;
					return new Response(new ReadableStream({
						start(controller) { controller.enqueue(new TextEncoder().encode('{"partial":')); }
					}));
				});
				const client = createGoogleClient(config, { service: 'Gmail', error: GmailError, fetch: transport.fetch, timeoutMs: 20 });
				const error = await failure(() => client.request(apiUrl, {}), GmailError);
				expect(error.kind).toBe('upstream');
				expect(error.message).toBe('Gmail request timed out.');
				expect(transport.requests.at(-1)!.signal.aborted).toBe(true);
				expect(transport.requests).toHaveLength(stage === 'oauth' ? 1 : 2);
			});

			test(`cancels stalled ${stage} ${stalled} without exposing the reason`, async () => {
				const reached = Promise.withResolvers<void>();
				const transport = mockFetch((request) => {
					if (stage === 'api' && request.url === tokenUrl) return Response.json(token);
					if (stalled === 'fetch') {
						reached.resolve();
						return Promise.withResolvers<Response>().promise;
					}
					const response = Response.json({});
					response.json = () => {
						reached.resolve();
						return Promise.withResolvers().promise;
					};
					return response;
				});
				const controller = new AbortController();
				const client = createGoogleClient(config, { service: 'Gmail', error: GmailError, fetch: transport.fetch, timeoutMs: 1000 });
				const failed = failure(() => client.request(apiUrl, {}, controller.signal), GmailError);
				await reached.promise;
				controller.abort(new Error(sensitive.join(' ')));
				expect((await failed).message).toBe('Gmail request was cancelled.');
				expect(transport.requests.at(-1)!.signal.aborted).toBe(true);
				expect(transport.requests).toHaveLength(stage === 'oauth' ? 1 : 2);
			});
		}
	}

	test('bounds OAuth error-body reads as well as successful response reads', async () => {
		const transport = mockFetch(() => new Response(new ReadableStream(), { status: 400 }));
		const client = createGoogleClient(config, { service: 'Gmail', error: GmailError, fetch: transport.fetch, timeoutMs: 20 });
		expect((await failure(() => client.request(apiUrl, {}), GmailError)).message).toBe('Gmail request timed out.');
		expect(transport.requests[0].signal.aborted).toBe(true);
	});

	test('synchronous cancellation in fetch settles without an unhandled refresh rejection', async () => {
		const controller = new AbortController();
		const transport = mockFetch(() => {
			controller.abort(new Error(sensitive.join(' ')));
			return Response.json(token);
		});
		const client = createGoogleClient(config, { service: 'Gmail', error: GmailError, fetch: transport.fetch });
		expect((await failure(() => client.request(apiUrl, {}, controller.signal), GmailError)).message).toBe('Gmail request was cancelled.');
		expect(transport.requests).toHaveLength(1);
		expect(transport.requests[0].signal.aborted).toBe(true);
	});

	test('one cancelled waiter leaves the shared refresh available to a survivor', async () => {
		const started = Promise.withResolvers<void>();
		const response = Promise.withResolvers<Response>();
		const transport = mockFetch((request) => {
			if (request.url === tokenUrl) {
				started.resolve();
				return response.promise;
			}
			return Response.json({ id: 'id' });
		});
		const controller = new AbortController();
		const client = createGoogleClient(config, { service: 'Gmail', error: GmailError, fetch: transport.fetch });
		const cancelled = failure(() => client.request(apiUrl, {}, controller.signal), GmailError);
		const surviving = client.request(apiUrl, {});
		await started.promise;
		controller.abort(token.access_token);
		expect((await cancelled).message).toBe('Gmail request was cancelled.');
		expect(transport.requests[0].signal.aborted).toBe(false);
		response.resolve(Response.json(token));
		expect(await surviving).toEqual({ data: { id: 'id' }, status: 200 });
		await client.request(apiUrl, {});
		expect(transport.requests).toHaveLength(3);
	});

	test('all cancelled waiters abort the refresh; its stale response cannot overwrite a replacement token', async () => {
		const started = Promise.withResolvers<void>();
		const staleResponse = Promise.withResolvers<Response>();
		let refreshes = 0;
		const transport = mockFetch((request) => {
			if (request.url === tokenUrl) {
				if (++refreshes === 1) {
					started.resolve();
					return staleResponse.promise;
				}
				return Response.json({ ...token, access_token: 'replacement-token' });
			}
			return Response.json({ id: 'id' });
		});
		const controllers = [new AbortController(), new AbortController()];
		const client = createGoogleClient(config, { service: 'Gmail', error: GmailError, fetch: transport.fetch });
		const cancelled = controllers.map((controller) => failure(() => client.request(apiUrl, {}, controller.signal), GmailError));
		await started.promise;
		controllers.forEach((controller) => controller.abort());
		await Promise.all(cancelled);
		expect(transport.requests[0].signal.aborted).toBe(true);
		await client.request(apiUrl, {});
		staleResponse.resolve(Response.json(token));
		await client.request(apiUrl, {});
		expect(refreshes).toBe(2);
		expect(transport.requests.filter((request) => request.url !== tokenUrl)
			.map((request) => request.headers.get('Authorization')))
			.toEqual(['Bearer replacement-token', 'Bearer replacement-token']);
	});
});
