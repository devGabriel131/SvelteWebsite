import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import type { Handle } from '@sveltejs/kit/hooks';
import { AUTH_IP_HEADER, createAuth, type Auth } from '../src/lib/server/auth/core';
import { createAuthHandle } from '../src/lib/server/auth/handle';
import { createDatabase, type DatabaseConnection } from '../src/lib/server/db/connection';
import { load as loadAdminPage } from '../src/routes/admin/+page.server';

type HookEvent = Parameters<Handle>[0]['event'];
const baseURL = 'https://auth-hook.example.test';

function createEvent(
	path: string,
	cookie?: string,
	options: { request?: RequestInit; getClientAddress?: () => string } = {}
): HookEvent {
	const url = new URL(path, baseURL);
	return {
		url,
		request: new Request(url, { headers: cookie ? { cookie } : {}, ...options.request }),
		// Leave auth locals unset so the boundary must initialize them before resolving.
		locals: { language: 'es' },
		getClientAddress: options.getClientAddress ?? (() => {
			throw new Error('This request must not need a client address');
		})
	} as unknown as HookEvent;
}

function unexpectedAuth(): never {
	throw new Error('This request must not initialize authentication');
}

function unexpectedResolve(): never {
	throw new Error('An auth API request must not resolve a page');
}

async function expectAnonymousPassThrough(handle: Handle, event: HookEvent) {
	const page = new Response('public page', {
		status: 202,
		headers: { 'cache-control': 'public, max-age=60', 'set-cookie': 'language=es; Path=/' }
	});
	let resolveCalls = 0;
	const response = await handle({
		event,
		resolve(resolvedEvent) {
			resolveCalls++;
			expect(resolvedEvent).toBe(event);
			expect(resolvedEvent.locals).toEqual({ language: 'es', user: null, session: null });
			return Promise.resolve(page);
		}
	});
	expect(resolveCalls).toBe(1);
	expect(response).toBe(page);
	expect(response.headers.get('cache-control')).toBe('public, max-age=60');
	expect(response.headers.getSetCookie()).toEqual(['language=es; Path=/']);
}

describe('auth hook without database I/O', () => {
	for (const localAdmin of [false, true]) {
		test(`the local login flag (${localAdmin}) configures the form without granting admin access`, async () => {
			const event = createEvent('/admin');
			event.locals.user = null;
			event.locals.session = null;
			event.locals.localAdmin = localAdmin;
			expect(await loadAdminPage(event as Parameters<typeof loadAdminPage>[0])).toEqual({
				isAdmin: false, localAdmin, students: [], invitations: [], invitationPage: 1, hasMoreInvitations: false
			});
		});
	}
	for (const path of ['/', '/ist', '/admin', '/login', '/admin/auth-other', '/api/authentication', '/api/auth-other']) {
		test(`a public request without a session cookie bypasses the auth getter: ${path}`, async () => {
			await expectAnonymousPassThrough(createAuthHandle(unexpectedAuth, false), createEvent(path));
		});
	}

	for (const cookie of [
		'language=es; theme=dark',
		'not-better-auth.session_token=unrelated',
		'better-auth.session_data=untrusted-cache-only'
	]) {
		test(`unrelated cookies do not initialize auth: ${cookie}`, async () => {
			await expectAnonymousPassThrough(createAuthHandle(unexpectedAuth, false), createEvent('/ist', cookie));
		});
	}

	for (const path of ['/ist', '/admin', '/api/auth', '/api/auth/sign-in/email', '/admin/auth/sign-in/email']) {
		test(`building bypasses the getter even with a session cookie: ${path}`, async () => {
			await expectAnonymousPassThrough(
				createAuthHandle(unexpectedAuth, true),
				createEvent(path, '__Secure-better-auth.session_token=not-a-real-session')
			);
		});
	}

	for (const path of ['/api/auth', '/api/auth/', '/api/auth/get-session', '/api/auth/sign-in/email', '/admin/auth', '/admin/auth/sign-in/email']) {
		test(`unavailable auth returns an uncached 503 with anonymous locals: ${path}`, async () => {
			let getterCalls = 0;
			const handle = createAuthHandle((audience) => {
				getterCalls++;
				expect(audience).toBe(path.startsWith('/admin/auth') ? 'admin' : 'student');
				return null;
			}, false);
			const event = createEvent(path);
			const response = await handle({ event, resolve: unexpectedResolve });
			expect(getterCalls).toBe(1);
			expect(response.status).toBe(503);
			expect(response.headers.get('cache-control')).toBe('no-store');
			expect(response.headers.getSetCookie()).toEqual([]);
			expect(await response.json()).toEqual({ code: 'AUTH_NOT_CONFIGURED' });
			expect(event.locals).toEqual({ language: 'es', user: null, session: null });
		});
	}

	for (const name of ['better-auth.session_token', '__Secure-better-auth.session_token']) {
		test(`a session cookie remains anonymous when auth configuration is absent: ${name}`, async () => {
			let getterCalls = 0;
			const handle = createAuthHandle(() => { getterCalls++; return null; }, false);
			await expectAnonymousPassThrough(handle, createEvent('/account', `${name}=stale-session`));
			expect(getterCalls).toBe(1);
		});
	}
});

describe('auth hook with a real Better Auth instance, without database I/O', () => {
	let connection: DatabaseConnection;
	let auth: Auth;

	beforeAll(async () => {
		// postgres.js is lazy; these rejected requests must never reach the database adapter.
		connection = createDatabase('postgresql://auth_hook_unit:unused@127.0.0.1:1/auth_hook_unit');
		auth = createAuth(connection.db, {
			secret: randomBytes(32).toString('hex'), baseURL, trustedOrigins: [baseURL]
		});
		await auth.$context;
	});

	afterAll(async () => {
		await connection?.client.end();
	});

	test('a mismatched request URL origin returns 404 rather than resolving or trusting the Origin header', async () => {
		const event = createEvent('https://wrong-origin.example.test/api/auth/sign-in/email', undefined, {
			request: {
				method: 'POST',
				headers: { origin: baseURL, 'content-type': 'application/json' },
				body: JSON.stringify({ email: 'unused@example.test', password: '0042' })
			}
		});
		const response = await createAuthHandle(() => auth, false)({ event, resolve: unexpectedResolve });
		expect(response.status).toBe(404);
		expect(await response.text()).toBe('');
		expect(event.locals).toEqual({ language: 'es', user: null, session: null });
	});

	test('an unavailable authoritative client address throws instead of using spoofed headers', async () => {
		const unavailableAddress = new Error('Adapter cannot determine the client address');
		let addressCalls = 0;
		const event = createEvent('/api/auth/sign-in/email', undefined, {
			getClientAddress() { addressCalls++; throw unavailableAddress; },
			request: {
				method: 'POST',
				headers: {
					origin: baseURL, 'content-type': 'application/json',
					[AUTH_IP_HEADER]: '198.51.100.1', 'x-forwarded-for': '203.0.113.1'
				},
				body: JSON.stringify({ email: 'unused@example.test', password: 'bad' })
			}
		});
		await expect(createAuthHandle(() => auth, false)({ event, resolve: unexpectedResolve }))
			.rejects.toBe(unavailableAddress);
		expect(addressCalls).toBe(1);
		expect(event.locals).toEqual({ language: 'es', user: null, session: null });
	});
});
