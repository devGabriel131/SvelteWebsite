import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Handle } from '@sveltejs/kit/hooks';
import { getIP } from 'better-auth/api';
import { eq, inArray } from 'drizzle-orm';
import { assertLocalDatabaseUrl, verifyLocalDatabase } from '../scripts/db/local-target';
import { migrateDatabase } from '../scripts/db/migrate';
import { getAdminPageState, getViewer } from '../src/lib/server/auth/access';
import type { AuthConfig } from '../src/lib/server/auth/config';
import { AUTH_IP_HEADER, createAuth, type Auth } from '../src/lib/server/auth/core';
import type { AuthAudience } from '../src/lib/server/auth/credentials';
import { createAuthHandle } from '../src/lib/server/auth/handle';
import { rateLimit, session, user } from '../src/lib/server/db/auth-schema';
import { createDatabase, type DatabaseConnection } from '../src/lib/server/db/connection';
import { load as loadRootLayout } from '../src/routes/+layout.server';
import { load as loadAdminPage } from '../src/routes/admin/+page.server';

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;
const config: AuthConfig = {
	secret: randomBytes(32).toString('hex'),
	baseURL: 'https://auth-hook.example.test',
	trustedOrigins: ['https://auth-hook.example.test']
};
type HookEvent = Parameters<Handle>[0]['event'];
type Resolve = Parameters<Handle>[0]['resolve'];
type RequestOptions = {
	method?: 'GET' | 'POST';
	body?: Record<string, unknown>;
	cookie?: string;
	origin?: string;
	headers?: HeadersInit;
};

function uniqueIP() {
	// Better Auth groups IPv6 by /64, so randomize the subnet rather than just the host.
	const subnet = randomBytes(7).toString('hex');
	return `fd${subnet.slice(0, 2)}:${subnet.slice(2, 6)}:${subnet.slice(6, 10)}:${subnet.slice(10, 14)}::1`;
}

function unexpectedResolve(): never {
	throw new Error('The official Better Auth handler must serve this API request, not resolve');
}

describeDatabase('auth hook with real Better Auth and isolated PostgreSQL fixtures', () => {
	let connection: DatabaseConnection;
	let auth: Auth;
	let adminAuth: Auth;
	let context: Awaited<Auth['$context']>;
	let handle: Handle;
	const fixtureEmails = new Set<string>();
	const rateKeys = new Set<string>();
	const selectedAudiences: AuthAudience[] = [];

	beforeAll(async () => {
		const target = assertLocalDatabaseUrl(databaseUrl!, 'test');
		connection = createDatabase(databaseUrl!);
		await verifyLocalDatabase(connection, target);
		await migrateDatabase(connection.db);
		auth = createAuth(connection.db, config);
		adminAuth = createAuth(connection.db, config, 'admin');
		context = await auth.$context;
		await adminAuth.$context;
		handle = createAuthHandle((audience) => {
			selectedAudiences.push(audience);
			return audience === 'admin' ? adminAuth : auth;
		}, false);
	}, 30000);

	afterAll(async () => {
		if (!connection) return;
		try {
			// Cascade only this suite's fixtures; other suites share this database.
			if (fixtureEmails.size) {
				await connection.db.delete(user).where(inArray(user.email, [...fixtureEmails]));
			}
		} finally {
			try {
				if (rateKeys.size) {
					await connection.db.delete(rateLimit).where(inArray(rateLimit.key, [...rateKeys]));
				}
			} finally {
				await connection.client.end();
			}
		}
	});

	async function createFixture(credential = '0042', role?: AuthAudience) {
		const email = `db-auth-hook-${randomUUID()}@example.test`;
		fixtureEmails.add(email);
		const password = await context.password.hash(credential);
		const fixture = await context.internalAdapter.createUser({
			name: 'Authentication hook test fixture', email, emailVerified: true,
			...(role === undefined ? {} : { role })
		}, { method: 'admin' });
		await context.internalAdapter.createAccount({
			userId: fixture.id, accountId: fixture.id, providerId: 'credential', password
		});
		return fixture;
	}

	function createClient(ip = uniqueIP()) {
		const normalizedIP = (address: string) => getIP(new Headers({ [AUTH_IP_HEADER]: address }), auth.options);
		expect(normalizedIP(ip)).toStartWith('fd');
		// Better Auth 1.7.7 uses normalized-IP|path keys; track exact keys, never whole tables.
		const keyFor = (path: string, address = ip) => `${normalizedIP(address)}|${path}`;
		return {
			ip,
			keyFor,
			async request(path: string, options: RequestOptions = {}, resolve: Resolve = unexpectedResolve) {
				const url = new URL(path, config.baseURL);
				const headers = new Headers(options.headers);
				headers.set('origin', options.origin ?? config.baseURL);
				if (options.cookie) headers.set('cookie', options.cookie);
				if (options.body !== undefined) headers.set('content-type', 'application/json');
				const basePath = ['/api/auth', '/admin/auth'].find(
					(path) => url.pathname === path || url.pathname.startsWith(`${path}/`)
				);
				if (basePath) {
					const authPath = url.pathname.slice(basePath.length);
					rateKeys.add(keyFor(authPath));
					// Also clean up submitted buckets if a regression unexpectedly trusts a spoof.
					for (const name of [AUTH_IP_HEADER, 'x-forwarded-for']) {
						const submittedIP = headers.get(name);
						if (submittedIP) rateKeys.add(keyFor(authPath, submittedIP));
					}
				}
				let addressCalls = 0;
				const event = {
					url,
					request: new Request(url, {
						method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
						headers,
						body: options.body === undefined ? undefined : JSON.stringify(options.body)
					}),
					locals: { language: 'es' },
					getClientAddress() { addressCalls++; return ip; }
				} as HookEvent;
				const audienceOffset = selectedAudiences.length;
				const response = await handle({ event, resolve });
				return { response, event, addressCalls, audiences: selectedAudiences.slice(audienceOffset) };
			}
		};
	}

	type Client = ReturnType<typeof createClient>;

	async function sessionsFor(userId: string) {
		return connection.db.select().from(session).where(eq(session.userId, userId));
	}

	function sessionCookie(response: Response) {
		const cookie = response.headers.getSetCookie().find(
			(value) => value.startsWith(`${context.authCookies.sessionToken.name}=`)
		);
		expect(cookie).toBeDefined();
		return cookie!;
	}

	async function signIn(
		client: Client, fixture: { id: string; email: string }, password = '0042', audience: AuthAudience = 'student'
	) {
		const basePath = audience === 'admin' ? '/admin/auth' : '/api/auth';
		const { response, event, addressCalls, audiences } = await client.request(`${basePath}/sign-in/email`, {
			body: { email: fixture.email, password }
		});
		expect(response.status).toBe(200);
		expect(addressCalls).toBe(1);
		expect(audiences).toEqual([audience]);
		expect(event.locals).toEqual({ language: 'es', user: null, session: null });
		const body = await response.json();
		expect(body).toMatchObject({ redirect: false, user: { id: fixture.id, email: fixture.email } });
		const setCookie = sessionCookie(response);
		expect(setCookie).toMatch(/; HttpOnly/i);
		expect(setCookie).toMatch(/; Secure/i);
		expect(setCookie).toMatch(/; SameSite=Lax/i);
		expect(setCookie).toContain('Path=/');
		const rows = await sessionsFor(fixture.id);
		expect(rows).toHaveLength(1);
		expect(rows[0].token).toBe(body.token);
		expect(rows[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
		return {
			cookie: setCookie.split(';')[0],
			browserCookie: response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; '),
			storedSession: rows[0]
		};
	}

	async function render(
		client: Client, cookie: string, inspectLocals: (locals: App.Locals) => void | Promise<void>, path = '/account'
	) {
		const routeCookies = [
			'language=es; Path=/; SameSite=Lax',
			'page-preference=compact; Path=/; Expires=Wed, 21 Oct 2037 07:28:00 GMT'
		];
		const page = new Response('server-rendered account page', {
			status: 203,
			statusText: 'Rendered account',
			headers: {
				'content-type': 'text/html; charset=utf-8',
				'cache-control': 'public, max-age=3600',
				'x-route-header': 'preserved',
				vary: 'Accept-Language'
			}
		});
		for (const value of routeCookies) page.headers.append('set-cookie', value);
		let resolveCalls = 0;
		const result = await client.request(path, { cookie }, async (event) => {
			resolveCalls++;
			expect(event.request.headers.get('cookie')).toBe(cookie);
			expect(event.locals.language).toBe('es');
			await inspectLocals(event.locals);
			return page;
		});
		expect(resolveCalls).toBe(1);
		expect(result.addressCalls).toBe(0);
		expect(result.audiences).toEqual(['student']);
		expect(result.response.status).toBe(page.status);
		expect(result.response.statusText).toBe(page.statusText);
		for (const name of ['content-type', 'x-route-header', 'vary']) {
			expect(result.response.headers.get(name)).toBe(page.headers.get(name));
		}
		expect(result.response.headers.get('cache-control')).toBe('private, no-store');
		expect(result.response.headers.getSetCookie().slice(0, routeCookies.length)).toEqual(routeCookies);
		expect(page.headers.getSetCookie()).toEqual(routeCookies);
		expect(page.headers.get('cache-control')).toBe('public, max-age=3600');
		expect(await result.response.text()).toBe('server-rendered account page');
		return result;
	}

	function expectAnonymous(locals: App.Locals) {
		expect(locals).toEqual({ language: 'es', user: null, session: null });
	}

	test('routes login through the official handler and populates verified SSR locals before resolve', async () => {
		const fixture = await createFixture();
		const client = createClient();
		const { cookie, storedSession } = await signIn(client, fixture);
		const { response, event } = await render(client, cookie, (locals) => {
			expect(locals.user).toMatchObject({ id: fixture.id, email: fixture.email, emailVerified: true });
			expect(locals.session).toMatchObject({
				id: storedSession.id, userId: fixture.id, token: storedSession.token,
				expiresAt: storedSession.expiresAt
			});
			expect(locals.session?.expiresAt).toBeInstanceOf(Date);
			expect(locals.user).not.toHaveProperty('password');
		});
		expect(event.locals.session?.id).toBe(storedSession.id);
		// A fresh session needs no rolling cookie, only the two cookies set by resolve.
		expect(response.headers.getSetCookie()).toHaveLength(2);
	});

	test('an anonymous admin page has no viewer or admin state and does not initialize auth', async () => {
		const { response, audiences, addressCalls } = await createClient().request('/admin', {}, async ({ locals }) => {
			expectAnonymous(locals);
			expect(getViewer(locals)).toBeNull();
			expect(getAdminPageState(locals)).toEqual({ isAdmin: false });
			return Response.json(await loadAdminPage({ locals } as Parameters<typeof loadAdminPage>[0]));
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ isAdmin: false });
		expect(audiences).toEqual([]);
		expect(addressCalls).toBe(0);
	});

	test('a verified student gets only public viewer fields and is redirected away from the admin page', async () => {
		const fixture = await createFixture();
		const client = createClient();
		const { cookie, storedSession } = await signIn(client, fixture);
		await render(client, cookie, (locals) => {
			expect(getViewer(locals)).toEqual({
				id: fixture.id, name: fixture.name, email: fixture.email, role: 'student'
			});
			expect(locals.session?.id).toBe(storedSession.id);
		}, '/');
		await expect(client.request('/admin', { cookie }, async ({ locals }) => {
			expect(locals.user?.role).toBe('student');
			return Response.json(await loadAdminPage({ locals } as Parameters<typeof loadAdminPage>[0]));
		})).rejects.toMatchObject({ status: 303, location: '/' });
		expect((await sessionsFor(fixture.id)).map(({ id }) => id)).toEqual([storedSession.id]);
	});

	test('an admin cookie is shared by both real auth instances and student-instance SSR, with a minimal viewer', async () => {
		const fixture = await createFixture('Admin!42', 'admin');
		const client = createClient();
		const { browserCookie: cookie, storedSession } = await signIn(client, fixture, 'Admin!42', 'admin');
		for (const [path, audience] of [
			['/api/auth/get-session', 'student'], ['/admin/auth/get-session', 'admin']
		] as const) {
			const { response, audiences } = await client.request(path, { cookie });
			expect(audiences).toEqual([audience]);
			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({
				user: { id: fixture.id, email: fixture.email, role: 'admin' },
				session: { id: storedSession.id, userId: fixture.id, token: storedSession.token }
			});
		}
		for (const path of ['/', '/admin']) {
			await render(client, cookie, async (locals) => {
				const viewer = { id: fixture.id, name: fixture.name, email: fixture.email, role: 'admin' } as const;
				expect(getViewer(locals)).toEqual(viewer);
				const layoutHeaders = new Headers();
				expect(await loadRootLayout({
					locals,
					setHeaders(headers) {
						for (const [name, value] of Object.entries(headers)) layoutHeaders.set(name, value);
					}
				} as Parameters<typeof loadRootLayout>[0])).toEqual({ language: 'es', viewer });
				expect(layoutHeaders.get('cache-control')).toBe('private, no-store');
				expect(getAdminPageState(locals)).toEqual({ isAdmin: true });
				if (path === '/admin') {
					expect(await loadAdminPage({ locals } as Parameters<typeof loadAdminPage>[0])).toEqual({ isAdmin: true });
				}
				expect(locals.session?.id).toBe(storedSession.id);
			}, path);
		}
		// A user record by itself, or a session for someone else, must never project admin authority.
		await render(client, cookie, (locals) => {
			for (const unverified of [
				{ user: locals.user, session: null },
				{ user: null, session: locals.session },
				{ user: locals.user, session: { ...storedSession, userId: randomUUID() } }
			]) {
				expect(getViewer(unverified)).toBeNull();
				expect(getAdminPageState(unverified)).toEqual({ isAdmin: false });
			}
		}, '/admin');
	});

	test('server-side demotion is visible with the same signed cookie and immediately removes admin page access', async () => {
		const fixture = await createFixture('Admin!42', 'admin');
		const client = createClient();
		// Replay every browser cookie so accidentally enabling a stale session cache cannot hide here.
		const { browserCookie: cookie, storedSession } = await signIn(client, fixture, 'Admin!42', 'admin');
		await render(client, cookie, (locals) => {
			expect(getViewer(locals)?.role).toBe('admin');
			expect(getAdminPageState(locals)).toEqual({ isAdmin: true });
		}, '/admin');
		await connection.db.update(user).set({ role: 'student' }).where(eq(user.id, fixture.id));
		for (const path of ['/api/auth/get-session', '/admin/auth/get-session']) {
			const { response } = await client.request(path, { cookie });
			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({
				user: { id: fixture.id, role: 'student' }, session: { id: storedSession.id }
			});
		}
		await render(client, cookie, (locals) => {
			expect(getViewer(locals)).toEqual({
				id: fixture.id, name: fixture.name, email: fixture.email, role: 'student'
			});
		}, '/');
		await expect(client.request('/admin', { cookie }, async ({ locals }) => {
			expect(locals.user?.role).toBe('student');
			return Response.json(await loadAdminPage({ locals } as Parameters<typeof loadAdminPage>[0]));
		})).rejects.toMatchObject({ status: 303, location: '/' });
		const { response } = await client.request('/admin/auth/sign-in/email', {
			body: { email: fixture.email, password: 'Admin!42' }
		});
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' });
		expect(response.headers.getSetCookie()).toHaveLength(0);
		expect((await sessionsFor(fixture.id)).map(({ id }) => id)).toEqual([storedSession.id]);
	});

	test('admin logout through the student endpoint revokes the shared cookie in both APIs and both SSR views', async () => {
		const fixture = await createFixture('Admin!42', 'admin');
		const client = createClient();
		const { browserCookie: cookie } = await signIn(client, fixture, 'Admin!42', 'admin');
		const { response, event, audiences, addressCalls } = await client.request('/api/auth/sign-out', {
			method: 'POST', body: {}, cookie
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ success: true });
		expect(audiences).toEqual(['student']);
		expect(addressCalls).toBe(1);
		expectAnonymous(event.locals);
		expect(sessionCookie(response)).toMatch(/; Max-Age=0/i);
		expect(await sessionsFor(fixture.id)).toHaveLength(0);
		for (const path of ['/api/auth/get-session', '/admin/auth/get-session']) {
			const replay = await client.request(path, { cookie });
			expect(replay.response.status).toBe(200);
			expect(await replay.response.json()).toBeNull();
		}
		for (const path of ['/', '/admin']) {
			const replay = await render(client, cookie, (locals) => {
				expectAnonymous(locals);
				expect(getViewer(locals)).toBeNull();
				expect(getAdminPageState(locals)).toEqual({ isAdmin: false });
			}, path);
			expect(sessionCookie(replay.response)).toMatch(/; Max-Age=0/i);
		}
	});

	test('the admin hook preserves Better Auth Origin protection', async () => {
		const fixture = await createFixture('Admin!42', 'admin');
		const { response, event, audiences, addressCalls } = await createClient().request('/admin/auth/sign-in/email', {
			origin: 'https://evil.example.test', body: { email: fixture.email, password: 'Admin!42' }
		});
		expect(audiences).toEqual(['admin']);
		expect(addressCalls).toBe(1);
		expectAnonymous(event.locals);
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ code: 'INVALID_ORIGIN', message: 'Invalid origin' });
		expect(response.headers.getSetCookie()).toHaveLength(0);
		expect(await sessionsFor(fixture.id)).toHaveLength(0);
	});

	test('routes logout through the official handler, deletes the session, and rejects SSR cookie replay', async () => {
		const fixture = await createFixture();
		const client = createClient();
		const { cookie } = await signIn(client, fixture);
		const { response, event, addressCalls } = await client.request('/api/auth/sign-out', {
			method: 'POST', body: {}, cookie
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ success: true });
		expect(addressCalls).toBe(1);
		expectAnonymous(event.locals);
		expect(sessionCookie(response)).toMatch(/; Max-Age=0/i);
		expect(await sessionsFor(fixture.id)).toHaveLength(0);

		const replay = await render(client, cookie, expectAnonymous);
		expect(sessionCookie(replay.response)).toMatch(/; Max-Age=0/i);
		expect(await sessionsFor(fixture.id)).toHaveLength(0);
	});

	test('malformed, tampered, and unsigned session cookies never authenticate SSR locals', async () => {
		const fixture = await createFixture();
		const client = createClient();
		const { cookie, storedSession } = await signIn(client, fixture);
		for (const invalidCookie of [
			`${context.authCookies.sessionToken.name}=malformed`,
			cookie.replace('=', '=tampered'),
			`${context.authCookies.sessionToken.name}=${storedSession.token}`
		]) {
			await render(client, invalidCookie, expectAnonymous);
			expect(await sessionsFor(fixture.id)).toHaveLength(1);
		}
		// Rejecting forged cookies must not invalidate the genuine session.
		await render(client, cookie, (locals) => {
			expect(locals.user?.id).toBe(fixture.id);
			expect(locals.session?.id).toBe(storedSession.id);
		});
	});

	test('forwards a real rolling-session cookie while preserving resolve cookies, status, headers, and body', async () => {
		const fixture = await createFixture();
		const client = createClient();
		const { cookie, storedSession } = await signIn(client, fixture);
		const { expiresIn, updateAge } = context.sessionConfig;
		const oldUpdatedAt = new Date(Date.now() - updateAge * 1000 - 60000);
		const oldExpiresAt = new Date(oldUpdatedAt.getTime() + expiresIn * 1000);
		expect(oldExpiresAt.getTime()).toBeGreaterThan(Date.now());
		await context.internalAdapter.updateSession(storedSession.token, {
			createdAt: oldUpdatedAt, updatedAt: oldUpdatedAt, expiresAt: oldExpiresAt
		});

		const { response, event } = await render(client, cookie, (locals) => {
			expect(locals.user?.id).toBe(fixture.id);
			expect(locals.session?.id).toBe(storedSession.id);
			expect(locals.session?.expiresAt.getTime()).toBeGreaterThan(oldExpiresAt.getTime());
			expect(locals.session?.updatedAt.getTime()).toBeGreaterThan(oldUpdatedAt.getTime());
		});
		const renewedCookie = sessionCookie(response);
		expect(response.headers.getSetCookie()).toHaveLength(3);
		expect(renewedCookie).toContain(`Max-Age=${expiresIn}`);
		expect(renewedCookie).toMatch(/; HttpOnly/i);
		expect(renewedCookie).toMatch(/; Secure/i);
		expect(renewedCookie).toMatch(/; SameSite=Lax/i);
		const rows = await sessionsFor(fixture.id);
		expect(rows).toHaveLength(1);
		if (!event.locals.session) throw new Error('Expected a renewed session in SSR locals');
		expect(rows[0].expiresAt).toEqual(event.locals.session.expiresAt);
		expect(rows[0].updatedAt).toEqual(event.locals.session.updatedAt);
		await render(client, renewedCookie.split(';')[0], (locals) => {
			expect(locals.user?.id).toBe(fixture.id);
			expect(locals.session?.id).toBe(storedSession.id);
		});
	});

	test('expires a real session, forwards every cleanup cookie, and deletes only the expired session', async () => {
		const fixture = await createFixture();
		const client = createClient();
		const { cookie, storedSession } = await signIn(client, fixture);
		const otherFixture = await createFixture();
		const otherClient = createClient();
		const other = await signIn(otherClient, otherFixture);
		await context.internalAdapter.updateSession(storedSession.token, {
			expiresAt: new Date(Date.now() - 60000)
		});

		const { response } = await render(client, cookie, expectAnonymous);
		const cleanupCookies = response.headers.getSetCookie().slice(2);
		const expectedNames = [
			context.authCookies.sessionToken.name,
			context.authCookies.sessionData.name,
			context.authCookies.dontRememberToken.name
		];
		expect(cleanupCookies.map((value) => value.split('=')[0])).toEqual(expect.arrayContaining(expectedNames));
		for (const value of cleanupCookies) expect(value).toMatch(/; Max-Age=0/i);
		expect(await sessionsFor(fixture.id)).toHaveLength(0);
		expect(await sessionsFor(otherFixture.id)).toHaveLength(1);
		await render(otherClient, other.cookie, (locals) => {
			expect(locals.user?.id).toBe(otherFixture.id);
			expect(locals.session?.id).toBe(other.storedSession.id);
		});
	});

	test('the hook shares one five-attempt bucket across admin and student paths despite forged IPs', async () => {
		const fixture = await createFixture('Admin!42', 'admin');
		const client = createClient();
		const spoofedKeys: string[] = [];
		const attempts = [
			['/admin/auth/sign-in/email', null],
			['/api/auth/sign-in/email', 42],
			['/admin/auth/sign-in/email', []],
			['/api/auth/sign-in/email', 'bad'],
			['/admin/auth/sign-in/email', 'Admin!7'],
			['/admin/auth/sign-in/email', null],
			['/admin/auth/sign-in/email', 'Admin!42'],
			['/api/auth/sign-in/email', '0042']
		] as const;
		for (const [index, [path, password]] of attempts.entries()) {
			const submittedIP = uniqueIP();
			const forwardedIP = uniqueIP();
			spoofedKeys.push(client.keyFor('/sign-in/email', submittedIP), client.keyFor('/sign-in/email', forwardedIP));
			const { response, event, audiences, addressCalls } = await client.request(path, {
				body: { email: fixture.email, password },
				headers: { [AUTH_IP_HEADER]: submittedIP, 'x-forwarded-for': forwardedIP }
			});
			expect(audiences).toEqual([path.startsWith('/admin/') ? 'admin' : 'student']);
			expect(addressCalls).toBe(1);
			expectAnonymous(event.locals);
			expect(event.request.headers.get(AUTH_IP_HEADER)).toBe(submittedIP);
			if (index < 5) {
				expect([400, 401]).toContain(response.status);
			} else {
				expect(response.status).toBe(429);
				expect(Number(response.headers.get('x-retry-after'))).toBeGreaterThan(0);
				expect(Number(response.headers.get('x-retry-after'))).toBeLessThanOrEqual(60);
			}
			expect(response.headers.getSetCookie()).toHaveLength(0);
		}
		const rows = await connection.db.select().from(rateLimit)
			.where(eq(rateLimit.key, client.keyFor('/sign-in/email')));
		expect(rows).toHaveLength(1);
		expect(rows[0].count).toBe(5);
		expect(rows[0].lastRequest).toBeGreaterThan(Date.now() - 60000);
		expect(await connection.db.select().from(rateLimit).where(inArray(rateLimit.key, spoofedKeys))).toEqual([]);
		expect(await sessionsFor(fixture.id)).toHaveLength(0);
		await signIn(createClient(), fixture, 'Admin!42', 'admin');
	});

	test('five malformed sign-ins with different forged IPs still make the sixth request 429 for the authoritative /64', async () => {
		const fixture = await createFixture();
		const client = createClient();
		const spoofedKeys: string[] = [];
		for (let attempt = 0; attempt < 6; attempt++) {
			const submittedIP = uniqueIP();
			const forwardedIP = uniqueIP();
			spoofedKeys.push(client.keyFor('/sign-in/email', submittedIP), client.keyFor('/sign-in/email', forwardedIP));
			const { response, event, addressCalls } = await client.request('/api/auth/sign-in/email', {
				body: { email: fixture.email, password: 'bad' },
				headers: { [AUTH_IP_HEADER]: submittedIP, 'x-forwarded-for': forwardedIP }
			});
			expect(addressCalls).toBe(1);
			expectAnonymous(event.locals);
			// The hook clones the request for Better Auth rather than mutating the caller's headers.
			expect(event.request.headers.get(AUTH_IP_HEADER)).toBe(submittedIP);
			if (attempt < 5) {
				expect(response.status).toBe(401);
				expect(await response.json()).toEqual({
					code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password'
				});
			} else {
				expect(response.status).toBe(429);
				expect(Number(response.headers.get('x-retry-after'))).toBeGreaterThan(0);
				expect(Number(response.headers.get('x-retry-after'))).toBeLessThanOrEqual(60);
			}
			expect(response.headers.getSetCookie()).toHaveLength(0);
		}
		const rows = await connection.db.select().from(rateLimit)
			.where(eq(rateLimit.key, client.keyFor('/sign-in/email')));
		expect(rows).toHaveLength(1);
		expect(rows[0].count).toBe(5);
		expect(rows[0].lastRequest).toBeGreaterThan(Date.now() - 60000);
		expect(await connection.db.select().from(rateLimit).where(inArray(rateLimit.key, spoofedKeys))).toEqual([]);
		expect(await sessionsFor(fixture.id)).toHaveLength(0);

		// A genuinely different authoritative subnet remains independent of the exhausted bucket.
		const independent = createClient();
		expect(independent.keyFor('/sign-in/email')).not.toBe(client.keyFor('/sign-in/email'));
		await signIn(independent, fixture);
	});
});