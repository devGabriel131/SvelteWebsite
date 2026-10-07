import { describe, expect, test } from 'bun:test';
import { DriveError } from '../src/lib/server/drive/client';
import {
	createGoogleClient, GoogleApiError, type GoogleClientOptions, type GoogleCredentials
} from '../src/lib/server/google/client';

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
			expect(`${String(result)} ${result.stack} ${JSON.stringify(result)}`).not.toContain(secret);
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
			const init: RequestInit = {
				method: 'POST', headers, body: JSON.stringify({ raw: 'test-message' }), redirect: 'follow', cache: 'no-store'
			};
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

	for (const [service, ErrorType] of [['Google Drive', DriveError], ['Gmail', GmailError]] as const) {
		test(`${service} uses its error subclass, invalidates rejected tokens, and never replays requests`, async () => {
			const transport = mockFetch((request) => request.url === tokenUrl
				? Response.json(token) : new Response(sensitive.join(' '), { status: 403 }));
			const client = createGoogleClient(config, { service, error: ErrorType, fetch: transport.fetch });
			for (let calls = 1; calls <= 2; calls += 1) {
				const error = await failure(() => client.request(apiUrl, { method: 'POST', body: '{}' }), ErrorType);
				expect(error.kind).toBe('auth');
				expect(error.status).toBe(403);
				expect(error.message).toBe(`${service} request was rejected.`);
				expect(transport.requests).toHaveLength(calls * 2);
			}
		});

		test(`${service} validates credentials and timeout settings without exposing values or networking`, async () => {
			const transport = mockFetch(() => { throw new Error('Unexpected network request.'); });
			const options = { service, error: ErrorType, fetch: transport.fetch };
			for (const key of Object.keys(config) as (keyof GoogleCredentials)[]) {
				const error = await failure(() => createGoogleClient({ ...config, [key]: ' \n' }, options), ErrorType);
				expect(error.kind).toBe('configuration');
			}
			for (const timeoutMs of [0, -1, 0.5, NaN, Infinity, 2_147_483_648, token.access_token]) {
				const error = await failure(() => createGoogleClient(config, {
					...options, timeoutMs: timeoutMs as GoogleClientOptions['timeoutMs']
				}), ErrorType);
				expect(error.kind).toBe('configuration');
				expect(error.message).toBe(`${service === 'Google Drive' ? 'Drive' : service} timeoutMs must be a positive, supported integer.`);
			}
			expect(transport.requests).toHaveLength(0);
		});
	}

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
