import { describe, expect, spyOn, test } from 'bun:test';
import { Buffer } from 'node:buffer';
import { createGmailClient } from '../src/lib/server/gmail/client';
import type { GmailConfig } from '../src/lib/server/gmail/config';
import { GmailError } from '../src/lib/server/gmail/error';
import type { Email } from '../src/lib/server/gmail/message';
import { GoogleApiError } from '../src/lib/server/google/client';

const config: GmailConfig = {
	clientId: 'private-client-id+&= /',
	clientSecret: 'private-client-secret+&= /',
	refreshToken: 'private-refresh-token+&= /',
	senderAddress: 'Private Sender <private-sender@example.test>',
	testMode: false
};
const email: Email = {
	to: ['private-to@example.test'],
	cc: ['private-cc@example.test'],
	bcc: ['private-bcc@example.test'],
	subject: 'Private subject marker',
	body: 'Private message body marker.'
};
const token = { access_token: 'private-access-token', token_type: 'Bearer', expires_in: 3600 };
const tokenUrl = 'https://oauth2.googleapis.com/token';
const sendUrl = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const sensitive = [
	config.clientId, config.clientSecret, config.refreshToken, config.senderAddress,
	'private-sender@example.test', token.access_token,
	...email.to, ...email.cc!, ...email.bcc!, email.subject, email.body!,
	'private-report.pdf', 'private-upstream-detail'
];
const privateDetails = sensitive.join(' ');

function mockFetch(handler: (request: Request) => Response | Promise<Response>) {
	const requests: Request[] = [];
	const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
		const request = new Request(input, init);
		requests.push(request);
		return handler(request);
	};
	return { fetch: fetch as typeof globalThis.fetch, requests };
}

async function withoutLogs<T>(work: () => T | Promise<T>): Promise<T> {
	const logged: unknown[][] = [];
	const spies = (['log', 'info', 'warn', 'error', 'debug', 'trace', 'dir'] as const)
		.map((method) => spyOn(console, method).mockImplementation((...args: unknown[]) => { logged.push(args); }));
	try {
		return await work();
	} finally {
		for (const spy of spies) spy.mockRestore();
		// Silence also catches leaks of encoded MIME or request objects, not just literal secrets.
		expect(logged).toEqual([]);
	}
}

async function gmailError(work: () => unknown): Promise<GmailError> {
	let caught: unknown;
	try {
		await withoutLogs(work);
	} catch (error) {
		caught = error;
	}
	expect(caught).toBeInstanceOf(GmailError);
	expect(caught).toBeInstanceOf(GoogleApiError);
	const error = caught as GmailError;
	expect(error.name).toBe('GmailError');
	expect(error).not.toHaveProperty('cause');
	const exposed = `${String(error)} ${error.stack} ${JSON.stringify(error)} ${Bun.inspect(error)}`;
	for (const value of sensitive) {
		expect(exposed).not.toContain(value);
		expect(exposed).not.toContain(encodeURIComponent(value));
	}
	return error;
}

function expectSingleAttempt(requests: Request[]) {
	expect(requests.map((request) => request.url)).toEqual([tokenUrl, sendUrl]);
}

async function sentMime(request: Request): Promise<string> {
	const payload = await request.json();
	expect(Object.keys(payload)).toEqual(['raw']);
	expect(typeof payload.raw).toBe('string');
	expect(payload.raw).toMatch(/^[A-Za-z0-9_-]+$/);
	const bytes = Buffer.from(payload.raw, 'base64url');
	expect(bytes.toString('base64url')).toBe(payload.raw);
	return bytes.toString('utf8');
}

function header(mime: string, name: string): string | undefined {
	const headers = mime.split('\r\n\r\n', 1)[0].replace(/\r\n[ \t]+/g, ' ');
	return new RegExp(`^${name}: ([^\\r\\n]*)`, 'mi').exec(headers)?.[1];
}

describe('Gmail send integration', () => {
	test('posts base64url MIME with recipients, both bodies, and attachment bytes', async () => {
		const source = new Uint8Array([99, 0, 255, 195, 40, 13, 10, 1, 99]);
		const message: Email = {
			...email,
			htmlBody: '<p>Private message body marker.</p>',
			attachments: [
				{ filename: 'private-report.pdf', bytes: source.subarray(1, -1), mimeType: 'application/pdf' },
				{ filename: 'extra.bin', bytes: new Uint8Array([0, 254, 128, 10]) }
			]
		};
		const original = structuredClone(message);
		const transport = mockFetch((request) => Response.json(request.url === tokenUrl
			? token : { id: '18abc_DEF-123', threadId: 'ignored-thread' }));
		const client = createGmailClient(config, { fetch: transport.fetch });

		expect(await withoutLogs(() => client.send(message))).toBe('18abc_DEF-123');
		expectSingleAttempt(transport.requests);
		const send = transport.requests[1];
		expect(send.headers.get('Authorization')).toBe(`Bearer ${token.access_token}`);
		expect(send.headers.get('Content-Type')).toBe('application/json');

		const mime = await sentMime(send);
		expect(header(mime, 'From')).toBe(config.senderAddress);
		expect(header(mime, 'To')).toBe(email.to.join(', '));
		expect(header(mime, 'Cc')).toBe(email.cc!.join(', '));
		expect(header(mime, 'Bcc')).toBe(email.bcc!.join(', '));
		expect(header(mime, 'Subject')).toBe(email.subject);
		expect(mime).toContain('Content-Type: text/plain; charset=utf-8');
		expect(mime).toContain('Content-Type: text/html; charset=utf-8');
		expect(mime).toContain(email.body!);
		expect(mime).toContain(message.htmlBody!);
		const boundary = /boundary="([^"]+)"/.exec(header(mime, 'Content-Type')!)?.[1];
		expect(boundary).toBeDefined();
		const attachments = mime.split(`--${boundary}`).filter((part) => /^Content-Disposition: attachment;/m.test(part));
		expect(attachments).toHaveLength(2);
		for (const [index, attachment] of message.attachments!.entries()) {
			const part = attachments[index].trimStart();
			expect(header(part, 'Content-Type')).toStartWith(attachment.mimeType ?? 'application/octet-stream');
			expect(header(part, 'Content-Disposition')?.replaceAll('"', '')).toBe(`attachment; filename=${attachment.filename}`);
			expect(header(part, 'Content-Transfer-Encoding')).toBe('base64');
			const encoded = part.slice(part.indexOf('\r\n\r\n') + 4).trim();
			expect(Buffer.from(encoded, 'base64')).toEqual(Buffer.from(attachment.bytes));
		}
		expect(message).toEqual(original);
	});

	test('snapshots sender, test mode, and credentials before the caller mutates its configuration', async () => {
		const mutable = { ...config };
		const transport = mockFetch((request) => Response.json(request.url === tokenUrl ? token : { id: 'sent' }));
		const client = createGmailClient(mutable, { fetch: transport.fetch });
		expect(client.testMode).toBe(false);
		Object.assign(mutable, {
			clientId: 'changed-client', clientSecret: 'changed-secret', refreshToken: 'changed-refresh',
			senderAddress: 'changed@example.test', testMode: true
		});
		const { send } = client;
		expect(await send(email)).toBe('sent');
		expect(client.testMode).toBe(false);
		expectSingleAttempt(transport.requests);
		expect(Object.fromEntries(new URLSearchParams(await transport.requests[0].text()))).toEqual({
			grant_type: 'refresh_token', client_id: config.clientId,
			client_secret: config.clientSecret, refresh_token: config.refreshToken
		});
		const mime = await sentMime(transport.requests[1]);
		expect(header(mime, 'From')).toBe(config.senderAddress);
		expect(header(mime, 'To')).toBe(email.to[0]);
		expect(header(mime, 'Subject')).toBe(email.subject);
	});

	test('test mode routes only to the sender with a [TEST] subject, without mutating the original email', async () => {
		const original = structuredClone(email);
		const transport = mockFetch((request) => Response.json(request.url === tokenUrl ? token : { id: 'test-sent' }));
		const client = createGmailClient({ ...config, testMode: true }, { fetch: transport.fetch });
		expect(client.testMode).toBe(true);
		expect(await client.send(email)).toBe('test-sent');
		expectSingleAttempt(transport.requests);
		const mime = await sentMime(transport.requests[1]);
		expect(header(mime, 'From')).toBe(config.senderAddress);
		expect(header(mime, 'To')).toBe(config.senderAddress);
		expect(header(mime, 'Cc')).toBeUndefined();
		expect(header(mime, 'Bcc')).toBeUndefined();
		expect(header(mime, 'Subject')).toBe(`[TEST] ${email.subject}`);
		const body = mime.slice(mime.indexOf('\r\n\r\n') + 4);
		for (const recipient of [...email.to, ...email.cc!, ...email.bcc!]) expect(body).toContain(recipient);
		expect(body).toContain(email.body!);
		expect(email).toEqual(original);
	});
});

describe('Gmail validation before networking', () => {
	test('rejects malformed sender/testMode and shared transport config before networking', async () => {
		const transport = mockFetch(() => { throw new Error('Unexpected network request.'); });
		const invalid: unknown[] = [
			null, { ...config, testMode: undefined }, { ...config, testMode: 'false' },
			{ ...config, senderAddress: '' }, { ...config, senderAddress: `${config.senderAddress}\r\nBcc: ${email.bcc![0]}` },
			{ ...config, refreshToken: ' \n' }
		];
		for (const value of invalid) {
			const error = await gmailError(() => createGmailClient(value as GmailConfig, { fetch: transport.fetch }));
			expect(error.kind).toBe('configuration');
			expect(error.status).toBeUndefined();
		}
		const error = await gmailError(() => createGmailClient(config, { fetch: transport.fetch, timeoutMs: 0 }));
		expect(error.kind).toBe('configuration');
		expect(error.status).toBeUndefined();
		expect(transport.requests).toHaveLength(0);
	});

	test('validates email before OAuth even when test mode would replace its recipients', async () => {
		const transport = mockFetch(() => { throw new Error('Unexpected network request.'); });
		const invalid: Email[] = [
			{ ...email, to: [] },
			{ ...email, to: [`${email.to[0]}, ${email.bcc![0]}`] },
			{ ...email, cc: [`${email.cc![0]}\r\nBcc: ${email.bcc![0]}`] },
			{ ...email, bcc: ['private-upstream-detail'] },
			{ ...email, subject: `${email.subject}\r\nBcc: ${email.bcc![0]}` },
			{ ...email, body: undefined },
			{ ...email, attachments: [{ filename: '../private-report.pdf', bytes: new Uint8Array([1]) }] }
		];
		for (const testMode of [false, true]) {
			const client = createGmailClient({ ...config, testMode }, { fetch: transport.fetch });
			for (const message of invalid) {
				const error = await gmailError(() => client.send(message));
				expect(error.kind).toBe('bad_input');
				expect(error.status).toBeUndefined();
			}
		}
		expect(transport.requests).toHaveLength(0);
	});
});

describe('safe Gmail failures without automatic retries', () => {
	test('retains real Gmail subclass/service label and never replays a rejected send', async () => {
		const transport = mockFetch((request) => request.url === tokenUrl
			? Response.json(token) : new Response(privateDetails, { status: 403 }));
		const error = await gmailError(() => createGmailClient(config, { fetch: transport.fetch }).send(email));
		expect(error.kind).toBe('auth');
		expect(error.status).toBe(403);
		expect(error.message).toBe('Gmail request was rejected.');
		expectSingleAttempt(transport.requests);
	});

	test('rejects invalid success payloads and message IDs without retrying a possibly successful send', async () => {
		for (const data of [null, [], {}, { id: '' }, { id: ' ' }, { id: 42 }, { id: 'private-upstream-detail/invalid' }, { id: `${email.to[0]}\r\n` }]) {
			const transport = mockFetch((request) => request.url === tokenUrl
				? Response.json(token) : Response.json(data, { status: 201 }));
			const error = await gmailError(() => createGmailClient(config, { fetch: transport.fetch }).send(email));
			expect(error.kind).toBe('upstream');
			expect(error.status).toBe(201);
			expect(error.message).toBe('Gmail returned an invalid message ID.');
			expectSingleAttempt(transport.requests);
		}
	});
});

describe('Gmail send cancellation', () => {
	test('forwards in-flight send cancellation without replay or leaking the reason', async () => {
		const started = Promise.withResolvers<void>();
		const transport = mockFetch((request) => {
			if (request.url === tokenUrl) return Response.json(token);
			started.resolve();
			return Promise.withResolvers<Response>().promise;
		});
		const client = createGmailClient(config, { fetch: transport.fetch });
		const controller = new AbortController();
		const failed = gmailError(() => client.send(email, controller.signal));
		await started.promise;
		controller.abort(new Error(privateDetails));
		expect((await failed).message).toBe('Gmail request was cancelled.');
		expectSingleAttempt(transport.requests);
		expect(transport.requests[1].signal.aborted).toBe(true);
	});

	test('pre-aborted signal prevents MIME composition as well as all network requests', async () => {
		const transport = mockFetch(() => { throw new Error('Unexpected network request.'); });
		const controller = new AbortController();
		controller.abort(new Error(privateDetails));
		const client = createGmailClient(config, { fetch: transport.fetch });
		let reads = 0;
		const uncomposed = { ...email, get subject() { reads += 1; return email.subject; } };
		const error = await gmailError(() => client.send(uncomposed, controller.signal));
		expect(error.kind).toBe('upstream');
		expect(error.status).toBeUndefined();
		expect(error.message).toBe('Gmail request was cancelled.');
		expect(transport.requests).toHaveLength(0);
		expect(reads).toBe(0);
	});
});
