import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { getIP } from 'better-auth/api';
import { verifyPassword } from 'better-auth/crypto';
import { eq, inArray } from 'drizzle-orm';
import { openLocalDatabase } from '../scripts/db/local-target';
import { migrateDatabase } from '../scripts/db/migrate';
import type { AuthConfig } from '../src/lib/server/auth/config';
import { AUTH_IP_HEADER, createAuth, type Auth } from '../src/lib/server/auth/core';
import type { AuthAudience } from '../src/lib/auth-credentials';
import { account, rateLimit, session, user } from '../src/lib/server/db/auth-schema';
import type { DatabaseConnection } from '../src/lib/server/db/connection';

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;
const invalidCredentialsError = {
	code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password'
};
const config: AuthConfig = {
	secret: randomBytes(32).toString('hex'),
	baseURL: 'https://auth.example.test',
	trustedOrigins: ['https://auth.example.test']
};

type RequestOptions = {
	method?: 'GET' | 'POST';
	body?: Record<string, unknown>;
	cookie?: string;
	origin?: string;
};

describeDatabase('real Better Auth with isolated PostgreSQL fixtures', () => {
	let connection: DatabaseConnection;
	let auth: Auth;
	let secondAuth: Auth;
	let adminAuth: Auth;
	let context: Awaited<Auth['$context']>;
	const fixtureEmails = new Set<string>();
	const rateKeys = new Set<string>();

	beforeAll(async () => {
		connection = await openLocalDatabase(databaseUrl, 'test');
		await migrateDatabase(connection.db);
		auth = createAuth(connection.db, config);
		secondAuth = createAuth(connection.db, config);
		adminAuth = createAuth(connection.db, config, 'admin');
		context = await auth.$context;
		await secondAuth.$context;
		await adminAuth.$context;
	}, 30000);

	afterAll(async () => {
		if (!connection) return;
		try {
			// Cascade only this suite's users; never truncate shared auth or limiter tables.
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

	function fixtureEmail() {
		const email = `db-auth-${randomUUID()}@example.test`;
		// Track before creation so an unexpectedly successful public signup is cleaned up too.
		fixtureEmails.add(email);
		return email;
	}

	async function createFixture(credential = '0042', role?: AuthAudience) {
		const email = fixtureEmail();
		const password = await context.password.hash(credential);
		const fixture = await context.internalAdapter.createUser({
			name: 'Authentication test fixture', email, emailVerified: true,
			...(role === undefined ? {} : { role })
		}, { method: 'admin' });
		await context.internalAdapter.createAccount({
			userId: fixture.id, accountId: fixture.id, providerId: 'credential', password
		});
		return fixture;
	}

	function uniqueIP() {
		// Better Auth groups IPv6 addresses by /64: randomize the subnet, not just the host.
		const subnet = randomBytes(7).toString('hex');
		return `fd${subnet.slice(0, 2)}:${subnet.slice(2, 6)}:${subnet.slice(6, 10)}:${subnet.slice(10, 14)}::1`;
	}

	function createClient(instance = auth, ip = uniqueIP()) {
		const headers = new Headers({ [AUTH_IP_HEADER]: ip });
		const normalizedIP = getIP(headers, instance.options);
		expect(normalizedIP).toStartWith('fd');
		// Better Auth 1.7.7 stores normalized-IP|path keys; retain exact keys for scoped cleanup.
		const keyFor = (path: string) => `${normalizedIP}|${path}`;
		const basePath = instance.options.basePath!;
		return {
			ip,
			keyFor,
			async request(path: string, options: RequestOptions = {}) {
				const requestHeaders = new Headers(headers);
				requestHeaders.set('origin', options.origin ?? config.baseURL);
				if (options.cookie) requestHeaders.set('cookie', options.cookie);
				if (options.body !== undefined) requestHeaders.set('content-type', 'application/json');
				const url = new URL(`${config.baseURL}${basePath}${path}`);
				rateKeys.add(keyFor(url.pathname.slice(basePath.length)));
				return instance.handler(new Request(url, {
					method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
					headers: requestHeaders,
					body: options.body === undefined ? undefined : JSON.stringify(options.body)
				}));
			}
		};
	}

	type Client = ReturnType<typeof createClient>;

	async function sessionsFor(userId: string) {
		return connection.db.select().from(session).where(eq(session.userId, userId));
	}

	async function expectNoSession(response: Response, userId: string) {
		expect(response.headers.getSetCookie()).toHaveLength(0);
		expect(await sessionsFor(userId)).toHaveLength(0);
	}

	async function signIn(client: Client, fixture: { id: string; email: string }, password = '0042') {
		const response = await client.request('/sign-in/email', {
			body: { email: fixture.email, password }
		});
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toMatchObject({ redirect: false, user: { id: fixture.id, email: fixture.email } });
		expect(body.token).toBeString();
		expect(body.token.length).toBeGreaterThan(0);
		const setCookie = response.headers.getSetCookie().find(
			(value) => value.startsWith(`${context.authCookies.sessionToken.name}=`)
		);
		expect(setCookie).toBeDefined();
		expect(setCookie).toMatch(/; HttpOnly/i);
		expect(setCookie).toMatch(/; Secure/i);
		expect(setCookie).toMatch(/; SameSite=Lax/i);
		expect(setCookie).toContain('Path=/');
		const rows = await sessionsFor(fixture.id);
		expect(rows).toHaveLength(1);
		expect(rows[0].token).toBe(body.token);
		expect(rows[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
		return { cookie: setCookie!.split(';')[0], storedSession: rows[0] };
	}

	async function expectRateCount(client: Client, count: number, path = '/sign-in/email') {
		const rows = await connection.db.select().from(rateLimit).where(eq(rateLimit.key, client.keyFor(path)));
		expect(rows).toHaveLength(1);
		expect(rows[0].count).toBe(count);
		expect(rows[0].lastRequest).toBeNumber();
		expect(rows[0].lastRequest).toBeGreaterThan(Date.now() - 60000);
		return rows[0];
	}

	test('provisions credentials privately with a salted Better Auth hash, never plaintext', async () => {
		const fixture = await createFixture();
		const [stored] = await connection.db.select().from(account).where(eq(account.userId, fixture.id));
		expect(stored).toMatchObject({ providerId: 'credential', accountId: fixture.id });
		const [identity] = await connection.db.select().from(user).where(eq(user.id, fixture.id));
		expect(identity.role).toBe('student');
		expect(stored.password).toBeString();
		expect(stored.password).not.toBe('0042');
		expect(stored.password).not.toBe(await context.password.hash('0042'));
		expect(await verifyPassword({ hash: stored.password!, password: '0042' })).toBe(true);
		expect(await context.password.verify({ hash: stored.password!, password: '0042' })).toBe(true);
		expect(await verifyPassword({ hash: stored.password!, password: '42' })).toBe(false);
		expect(await verifyPassword({ hash: stored.password!, password: '0043' })).toBe(false);
	});

	test('signs in with 0042 and validates the signed session cookie through GET /get-session', async () => {
		const fixture = await createFixture();
		const client = createClient();
		const { cookie, storedSession } = await signIn(client, fixture);
		const response = await client.request('/get-session', { cookie });
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			user: { id: fixture.id, email: fixture.email },
			session: { id: storedSession.id, userId: fixture.id, token: storedSession.token }
		});
		const anonymous = await client.request('/get-session');
		expect(anonymous.status).toBe(200);
		expect(await anonymous.json()).toBeNull();
	});

	test('does not accept a tampered cookie or an unsigned database session token', async () => {
		const fixture = await createFixture();
		const client = createClient();
		const { cookie, storedSession } = await signIn(client, fixture);
		for (const invalidCookie of [
			cookie.replace('=', '=tampered'),
			`${context.authCookies.sessionToken.name}=${storedSession.token}`
		]) {
			const response = await client.request('/get-session', { cookie: invalidCookie });
			expect(response.status).toBe(200);
			expect(await response.json()).toBeNull();
		}
		expect(await sessionsFor(fixture.id)).toHaveLength(1);
		const valid = await client.request('/get-session', { cookie });
		expect((await valid.json()).session.id).toBe(storedSession.id);
	});

	test('logout deletes the server session and invalidates replay of the original cookie', async () => {
		const fixture = await createFixture();
		const client = createClient();
		const { cookie } = await signIn(client, fixture);
		const response = await client.request('/sign-out', { method: 'POST', body: {}, cookie });
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ success: true });
		const expiredCookie = response.headers.getSetCookie().find(
			(value) => value.startsWith(`${context.authCookies.sessionToken.name}=`)
		);
		expect(expiredCookie).toMatch(/; Max-Age=0/i);
		expect(await sessionsFor(fixture.id)).toHaveLength(0);
		const replay = await client.request('/get-session', { cookie });
		expect(replay.status).toBe(200);
		expect(await replay.json()).toBeNull();
	});

	test('an expired database session cannot be revived by its still-signed cookie', async () => {
		const fixture = await createFixture();
		const client = createClient();
		const { cookie, storedSession } = await signIn(client, fixture);
		await connection.db.update(session).set({ expiresAt: new Date(Date.now() - 60000) })
			.where(eq(session.id, storedSession.id));
		const response = await client.request('/get-session', { cookie });
		expect(response.status).toBe(200);
		expect(await response.json()).toBeNull();
	});

	test('wrong PIN and unknown email return the same generic credential error with no session', async () => {
		const fixture = await createFixture();
		const client = createClient();
		for (const email of [fixture.email, fixtureEmail()]) {
			const response = await client.request('/sign-in/email', { body: { email, password: '0043' } });
			expect(response.status).toBe(401);
			expect(await response.json()).toEqual(invalidCredentialsError);
			await expectNoSession(response, fixture.id);
		}
	});

	const malformedPins: unknown[] = [
		undefined, null, 42, 1234, true, false, {}, [], ['0042'],
		'', '042', '00042', ' 0042', '0042 ', '00 2', '00a2', '+042', '4.20',
		'0042\n', '0042\r\n', '004\n', '00\t2', '00\u00002', '００４２', '٠٠٤٢', '۰۰۴۲', '𝟘𝟘𝟜𝟚'
	];
	for (const [index, password] of malformedPins.entries()) {
		test(`HTTP sign-in rejects malformed PIN #${index}: ${JSON.stringify(password)} without a session`, async () => {
			const fixture = await createFixture();
			const response = await createClient().request('/sign-in/email', {
				body: { email: fixture.email, password }
			});
			// Better Call may reject non-string types before the auth PIN hook runs.
			expect([400, 401]).toContain(response.status);
			if (typeof password === 'string') {
				expect(response.status).toBe(401);
				expect(await response.json()).toEqual(invalidCredentialsError);
			}
			await expectNoSession(response, fixture.id);
		});
	}

	test('public signup is HTTP 404 and cannot create a user or session', async () => {
		const email = fixtureEmail();
		const response = await createClient().request('/sign-up/email', {
			body: { name: 'Forbidden public signup', email, password: '0042' }
		});
		expect(response.status).toBe(404);
		expect(response.headers.getSetCookie()).toHaveLength(0);
		expect(await connection.db.select().from(user).where(eq(user.email, email))).toHaveLength(0);
	});

	test('recovery and mutation endpoints remain disabled even with a valid session', async () => {
		const fixture = await createFixture();
		const client = createClient();
		const { cookie, storedSession } = await signIn(client, fixture);
		const before = await connection.db.select().from(account).where(eq(account.userId, fixture.id));
		const endpoints = [
			{ path: '/request-password-reset', body: { email: fixture.email } },
			{ path: '/reset-password', body: { token: randomUUID(), newPassword: '9999' } },
			{ path: '/change-password', body: { currentPassword: '0042', newPassword: '9999' } },
			{ path: '/set-password', body: { newPassword: '9999' } },
			{ path: '/verify-password', body: { password: '0042' } },
			{ path: '/change-email', body: { newEmail: fixtureEmail() } },
			{ path: '/update-user', body: { name: 'Forbidden change', role: 'admin', isAdmin: true } },
			{ path: '/delete-user', body: { password: '0042' } },
			{ path: '/send-verification-email', body: { email: fixture.email } },
			{ path: '/unlink-account', body: { providerId: 'credential', accountId: fixture.id } }
		];
		for (const { path, body } of endpoints) {
			const response = await client.request(path, { body, cookie });
			expect(response.status).toBe(404);
			expect(response.headers.getSetCookie()).toHaveLength(0);
		}
		const resetCallback = await client.request(`/reset-password/${randomUUID()}`, { cookie });
		expect(resetCallback.status).toBe(404);
		expect(await connection.db.select().from(account).where(eq(account.userId, fixture.id))).toEqual(before);
		const [unchanged] = await connection.db.select().from(user).where(eq(user.id, fixture.id));
		expect(unchanged).toMatchObject({ name: fixture.name, email: fixture.email, role: 'student' });
		expect((await sessionsFor(fixture.id)).map(({ id }) => id)).toEqual([storedSession.id]);
	});

	for (const password of ['Admin!42', 'a longer administrator password', 'a'.repeat(128)]) {
		test(`admin sign-in accepts a ${password.length}-character Better Auth credential without changing its hash`, async () => {
			const fixture = await createFixture(password, 'admin');
			const [stored] = await connection.db.select().from(account).where(eq(account.userId, fixture.id));
			const adminContext = await adminAuth.$context;
			expect(adminContext).not.toBe(context);
			expect(auth.options.basePath).toBe('/api/auth');
			expect(adminAuth.options.basePath).toBe('/admin/auth');
			expect(adminContext.authCookies.sessionToken).toEqual(context.authCookies.sessionToken);
			expect(stored.password).not.toBe(password);
			expect(await verifyPassword({ hash: stored.password!, password })).toBe(true);
			expect(await adminContext.password.verify({ hash: stored.password!, password })).toBe(true);
			const client = createClient(adminAuth);
			const { cookie, storedSession } = await signIn(client, fixture, password);
			const response = await client.request('/get-session', { cookie });
			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({
				user: { id: fixture.id, email: fixture.email, role: 'admin' },
				session: { id: storedSession.id, userId: fixture.id }
			});
			expect(await connection.db.select().from(account).where(eq(account.userId, fixture.id))).toEqual([stored]);
		});
	}

	for (const password of ['Admin!7', 'a'.repeat(129)]) {
		test(`admin sign-in rejects a matching ${password.length}-character fixture hash outside the 8..128 policy`, async () => {
			const fixture = await createFixture(password, 'admin');
			const [stored] = await connection.db.select().from(account).where(eq(account.userId, fixture.id));
			expect(await verifyPassword({ hash: stored.password!, password })).toBe(true);
			const response = await createClient(adminAuth).request('/sign-in/email', {
				body: { email: fixture.email, password }
			});
			expect(response.status).toBe(401);
			expect(await response.json()).toEqual(invalidCredentialsError);
			await expectNoSession(response, fixture.id);
		});
	}

	test('admin sign-in rejects missing and non-string passwords without a session', async () => {
		const fixture = await createFixture('Admin!42', 'admin');
		for (const password of [undefined, null, 12345678, true, {}, ['Admin!42']]) {
			const response = await createClient(adminAuth).request('/sign-in/email', {
				body: { email: fixture.email, password }
			});
			// Better Call can reject invalid body types before the credential hook runs.
			expect([400, 401]).toContain(response.status);
			await expectNoSession(response, fixture.id);
		}
	});

	for (const { role, password, audience } of [
		{ role: 'student', password: '0042', audience: 'admin' },
		{ role: 'student', password: 'Student!42', audience: 'admin' },
		{ role: 'student', password: 'Student!42', audience: 'student' },
		{ role: 'admin', password: 'Admin!42', audience: 'student' },
		{ role: 'admin', password: '0042', audience: 'student' }
	] as const) {
		test(`${audience} entry point rejects a stored ${role} with a matching ${password.length}-character hash`, async () => {
			const fixture = await createFixture(password, role);
			const [stored] = await connection.db.select().from(account).where(eq(account.userId, fixture.id));
			expect(await verifyPassword({ hash: stored.password!, password })).toBe(true);
			const response = await createClient(audience === 'admin' ? adminAuth : auth).request('/sign-in/email', {
				body: { email: fixture.email, password }
			});
			expect(response.status).toBe(401);
			expect(await response.json()).toEqual(invalidCredentialsError);
			await expectNoSession(response, fixture.id);
		});
	}

	test('wrong admin password and unknown email return the same generic credential error', async () => {
		const fixture = await createFixture('Admin!42', 'admin');
		const client = createClient(adminAuth);
		for (const email of [fixture.email, fixtureEmail()]) {
			const response = await client.request('/sign-in/email', { body: { email, password: 'Wrong!42' } });
			expect(response.status).toBe(401);
			expect(await response.json()).toEqual(invalidCredentialsError);
			await expectNoSession(response, fixture.id);
		}
	});

	test('spoofed role and admin flags cannot elevate a successful student sign-in', async () => {
		const fixture = await createFixture();
		const client = createClient();
		const response = await client.request('/sign-in/email', {
			body: { email: fixture.email, password: '0042', role: 'admin', admin: true, isAdmin: true }
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ user: { id: fixture.id, role: 'student' } });
		const cookie = response.headers.getSetCookie().find(
			(value) => value.startsWith(`${context.authCookies.sessionToken.name}=`)
		)?.split(';')[0];
		expect(cookie).toBeDefined();
		const current = await client.request('/get-session', { cookie });
		expect((await current.json()).user.role).toBe('student');
		expect(await sessionsFor(fixture.id)).toHaveLength(1);
		const [stored] = await connection.db.select().from(user).where(eq(user.id, fixture.id));
		expect(stored.role).toBe('student');
	});

	test('spoofed admin flags cannot override a stored student role even with an admin-length credential', async () => {
		const password = 'Student!42';
		const fixture = await createFixture(password);
		const response = await createClient(adminAuth).request('/sign-in/email', {
			body: { email: fixture.email, password, role: 'admin', admin: true, isAdmin: true }
		});
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual(invalidCredentialsError);
		await expectNoSession(response, fixture.id);
		const [stored] = await connection.db.select().from(user).where(eq(user.id, fixture.id));
		expect(stored.role).toBe('student');
	});

	test('neither entry point allows role mutation using a valid student or admin session', async () => {
		for (const role of ['student', 'admin'] as const) {
			const password = role === 'admin' ? 'Admin!42' : '0042';
			const fixture = await createFixture(password, role);
			const { cookie, storedSession } = await signIn(createClient(role === 'admin' ? adminAuth : auth), fixture, password);
			const [before] = await connection.db.select().from(user).where(eq(user.id, fixture.id));
			for (const instance of [auth, adminAuth]) {
				expect(instance.options.user?.additionalFields?.role.input).toBe(false);
				const response = await createClient(instance).request('/update-user', {
					cookie, body: { role: role === 'admin' ? 'student' : 'admin', isAdmin: true }
				});
				expect(response.status).toBe(404);
				expect(response.headers.getSetCookie()).toHaveLength(0);
			}
			expect(await connection.db.select().from(user).where(eq(user.id, fixture.id))).toEqual([before]);
			expect((await sessionsFor(fixture.id)).map(({ id }) => id)).toEqual([storedSession.id]);
		}
	});

	test('admin public signup cannot provision an administrator through body role fields', async () => {
		const email = fixtureEmail();
		const response = await createClient(adminAuth).request('/sign-up/email', {
			body: { name: 'Forbidden administrator', email, password: 'Admin!42', role: 'admin', isAdmin: true }
		});
		expect(response.status).toBe(404);
		expect(response.headers.getSetCookie()).toHaveLength(0);
		expect(await connection.db.select().from(user).where(eq(user.email, email))).toHaveLength(0);
	});

	// No test-only auth overrides: these must exercise the application's real Origin policy.
	test('blocks an untrusted Origin before creating a session', async () => {
		const fixture = await createFixture();
		const response = await createClient().request('/sign-in/email', {
			origin: 'https://evil.example.test', body: { email: fixture.email, password: '0042' }
		});
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ code: 'INVALID_ORIGIN', message: 'Invalid origin' });
		await expectNoSession(response, fixture.id);
	});

	test('blocks untrusted absolute and protocol-relative callback URLs without redirecting', async () => {
		const fixture = await createFixture();
		const client = createClient();
		for (const callbackURL of [
			'https://evil.example.test/after', '//evil.example.test/after',
			'https://auth.example.test.evil.test/after'
		]) {
			const response = await client.request('/sign-in/email', {
				body: { email: fixture.email, password: '0042', callbackURL }
			});
			expect(response.status).toBe(403);
			expect(await response.json()).toEqual({ code: 'INVALID_CALLBACK_URL', message: 'Invalid callbackURL' });
			expect(response.headers.get('location')).toBeNull();
			await expectNoSession(response, fixture.id);
		}
	});

	test('admin sign-in enforces Origin and callback URL protection with valid credentials', async () => {
		const password = 'Admin!42';
		const fixture = await createFixture(password, 'admin');
		const client = createClient(adminAuth);
		const response = await client.request('/sign-in/email', {
			origin: 'https://evil.example.test', body: { email: fixture.email, password }
		});
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ code: 'INVALID_ORIGIN', message: 'Invalid origin' });
		await expectNoSession(response, fixture.id);
		for (const callbackURL of ['https://evil.example.test/after', '//evil.example.test/after']) {
			const callback = await client.request('/sign-in/email', { body: { email: fixture.email, password, callbackURL } });
			expect(callback.status).toBe(403);
			expect(await callback.json()).toEqual({ code: 'INVALID_CALLBACK_URL', message: 'Invalid callbackURL' });
			expect(callback.headers.get('location')).toBeNull();
			await expectNoSession(callback, fixture.id);
		}
	});

	test('the sixth sign-in attempt is 429 even when it supplies the correct PIN', async () => {
		const fixture = await createFixture();
		const client = createClient();
		for (let attempt = 0; attempt < 5; attempt++) {
			const response = await client.request('/sign-in/email', { body: { email: fixture.email, password: '9999' } });
			expect(response.status).toBe(401);
		}
		const response = await client.request('/sign-in/email', { body: { email: fixture.email, password: '0042' } });
		expect(response.status).toBe(429);
		expect(Number(response.headers.get('x-retry-after'))).toBeGreaterThan(0);
		expect(Number(response.headers.get('x-retry-after'))).toBeLessThanOrEqual(60);
		await expectNoSession(response, fixture.id);
		await expectRateCount(client, 5);
	});

	test('malformed PINs consume the database limiter before validation; the sixth is 429', async () => {
		const fixture = await createFixture();
		const client = createClient();
		for (const password of [null, 42, [], 'abc', '0042\n']) {
			const response = await client.request('/sign-in/email', { body: { email: fixture.email, password } });
			expect([400, 401]).toContain(response.status);
		}
		for (const password of ['0042\n', '0042']) {
			const response = await client.request('/sign-in/email', { body: { email: fixture.email, password } });
			expect(response.status).toBe(429);
			await expectNoSession(response, fixture.id);
		}
		await expectRateCount(client, 5);
	});

	test('admin malformed credentials consume five attempts per 60 seconds before validation', async () => {
		const fixture = await createFixture('Admin!42', 'admin');
		const client = createClient(adminAuth);
		for (const password of [null, 12345678, [], 'Admin!7', 'a'.repeat(129)]) {
			const response = await client.request('/sign-in/email', { body: { email: fixture.email, password } });
			expect([400, 401]).toContain(response.status);
			if (typeof password === 'string') expect(await response.json()).toEqual(invalidCredentialsError);
			await expectNoSession(response, fixture.id);
		}
		for (const password of [null, 'Admin!7', 'Admin!42']) {
			const response = await client.request('/sign-in/email', { body: { email: fixture.email, password } });
			expect(response.status).toBe(429);
			expect(Number(response.headers.get('x-retry-after'))).toBeGreaterThan(0);
			expect(Number(response.headers.get('x-retry-after'))).toBeLessThanOrEqual(60);
			await expectNoSession(response, fixture.id);
		}
		await expectRateCount(client, 5);
	});

	test('student and admin entry points share the normalized sign-in bucket, but another IP is independent', async () => {
		const student = await createFixture();
		const admin = await createFixture('Admin!42', 'admin');
		const studentClient = createClient();
		const adminClient = createClient(adminAuth, studentClient.ip);
		expect(adminClient.keyFor('/sign-in/email')).toBe(studentClient.keyFor('/sign-in/email'));
		for (const client of [adminClient, studentClient, adminClient, studentClient, adminClient]) {
			const response = await client.request('/sign-in/email', { body: { email: admin.email, password: 'bad' } });
			expect(response.status).toBe(401);
			expect(await response.json()).toEqual(invalidCredentialsError);
		}
		for (const [client, fixture, password] of [
			[studentClient, student, '0042'], [adminClient, admin, 'Admin!42']
		] as const) {
			const response = await client.request('/sign-in/email', { body: { email: fixture.email, password } });
			expect(response.status).toBe(429);
			await expectNoSession(response, fixture.id);
			await expectRateCount(client, 5);
		}
		const independent = createClient(adminAuth);
		await signIn(independent, admin, 'Admin!42');
		await expectRateCount(independent, 1);
	});

	test('two real auth instances share the same database limit, but another IP is independent', async () => {
		const fixture = await createFixture();
		const first = createClient();
		const second = createClient(secondAuth, first.ip);
		expect(await secondAuth.$context).not.toBe(context);
		for (const client of [first, first, first, second, second]) {
			const response = await client.request('/sign-in/email', { body: { email: fixture.email, password: 'bad' } });
			expect(response.status).toBe(401);
		}
		for (const client of [first, second]) {
			const response = await client.request('/sign-in/email', { body: { email: fixture.email, password: '0042' } });
			expect(response.status).toBe(429);
			await expectNoSession(response, fixture.id);
		}
		await expectRateCount(first, 5);
		const independent = createClient(secondAuth);
		expect((await independent.request('/sign-in/email', {
			body: { email: fixture.email, password: 'bad' }
		})).status).toBe(401);
		await expectRateCount(independent, 1);
	});

	test('concurrent first requests across two instances create one limiter row and allow only five', async () => {
		const fixture = await createFixture();
		const first = createClient();
		const second = createClient(secondAuth, first.ip);
		const responses = await Promise.all([first, second, first, second, first, second].map(
			(client) => client.request('/sign-in/email', { body: { email: fixture.email, password: 'bad' } })
		));
		expect(responses.filter(({ status }) => status === 401)).toHaveLength(5);
		expect(responses.filter(({ status }) => status === 429)).toHaveLength(1);
		for (const response of responses) await expectNoSession(response, fixture.id);
		await expectRateCount(first, 5);
	});

	test('the default route limit permits 100 requests and rejects request 101', async () => {
		const client = createClient();
		for (let attempt = 0; attempt < 100; attempt++) {
			const response = await client.request('/get-session');
			expect(response.status).toBe(200);
			expect(await response.json()).toBeNull();
		}
		expect((await client.request('/get-session')).status).toBe(429);
		await expectRateCount(client, 100, '/get-session');
	}, 15000);

	test('PostgreSQL defaults roles to student and permits only non-null student or admin roles', async () => {
		const email = fixtureEmail();
		const [fixture] = await connection.db.insert(user).values({
			id: randomUUID(), name: 'Database role constraint fixture', email
		}).returning();
		expect(fixture.role).toBe('student');
		await connection.db.update(user).set({ role: 'admin' }).where(eq(user.id, fixture.id));
		for (const role of ['owner', 'ADMIN', '']) {
			await expect(Promise.resolve(connection.client.unsafe(
				'UPDATE public.auth_user SET role = $1 WHERE id = $2', [role, fixture.id]
			))).rejects.toMatchObject({ code: '23514', constraint_name: 'auth_user_role_check' });
		}
		await expect(Promise.resolve(connection.client.unsafe(
			'UPDATE public.auth_user SET role = NULL WHERE id = $1', [fixture.id]
		))).rejects.toMatchObject({ code: '23502' });
		const [unchanged] = await connection.db.select().from(user).where(eq(user.id, fixture.id));
		expect(unchanged.role).toBe('admin');
	});

	test('PostgreSQL enforces one non-null limiter key and required counter/timestamp values', async () => {
		const key = `db-auth-constraint-${randomUUID()}`;
		rateKeys.add(key);
		const row = { id: randomUUID(), key, count: 1, lastRequest: Date.now() };
		await connection.db.insert(rateLimit).values(row);
		await expect(connection.db.insert(rateLimit).values({ ...row, id: randomUUID() }).execute())
			.rejects.toMatchObject({ cause: { code: '23505' } });
		for (const column of ['key', 'count', 'last_request']) {
			await expect(Promise.resolve(connection.client.unsafe(
				`UPDATE public.auth_rate_limit SET "${column}" = NULL WHERE id = $1`, [row.id]
			))).rejects.toMatchObject({ code: '23502' });
		}
		expect(await connection.db.select().from(rateLimit).where(eq(rateLimit.key, key))).toEqual([row]);
	});
});
