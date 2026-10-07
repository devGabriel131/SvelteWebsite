import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { getIP } from 'better-auth/api';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { eq, inArray } from 'drizzle-orm';
import { assertLocalDatabaseUrl, verifyLocalDatabase } from '../scripts/db/local-target';
import { migrateDatabase } from '../scripts/db/migrate';
import { seedLocalAdmin } from '../scripts/db/seed-admin';
import { readAuthConfig, type AuthEnvironment } from '../src/lib/server/auth/config';
import { AUTH_IP_HEADER, createAuth } from '../src/lib/server/auth/core';
import type { AuthAudience } from '../src/lib/server/auth/credentials';
import { LOCAL_ADMIN_EMAIL } from '../src/lib/server/auth/local-admin';
import { account, rateLimit, session, user } from '../src/lib/server/db/auth-schema';
import { createDatabase, type DatabaseConnection } from '../src/lib/server/db/connection';

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;
const testUrl = 'postgresql://sveltewebsite_test:sveltewebsite_test@127.0.0.1:5434/sveltewebsite_test';
const localAuthEnvironment: AuthEnvironment = {
	NODE_ENV: 'development',
	LOCAL_ADMIN_ENABLED: 'true',
	BETTER_AUTH_URL: 'http://127.0.0.1:5173',
	BETTER_AUTH_SECRET: randomBytes(32).toString('hex')
};
const invalidCredentialsError = {
	code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password'
};

describe('local admin seed safety', () => {
	for (const url of [
		'postgresql://app:secret@db.example.test:5432/app',
		'postgresql://sveltewebsite_test:secret@127.0.0.1:5434/production',
		`${testUrl}?host=db.example.test`
	]) {
		test(`rejects an unsafe target before connecting: ${new URL(url).host}${new URL(url).pathname}`, async () => {
			await expect(seedLocalAdmin(url)).rejects.toThrow(/Refusing/);
		});
	}

	for (const key of ['NODE_ENV', 'RAILWAY_PROJECT_ID', 'RAILWAY_ENVIRONMENT_ID']) {
		test(`rejects production/hosted execution through ${key}`, async () => {
			const previous = process.env[key];
			process.env[key] = key === 'NODE_ENV' ? 'production' : 'test-project';
			try {
				await expect(seedLocalAdmin(testUrl)).rejects.toThrow(/production or Railway/);
			} finally {
				if (previous === undefined) delete process.env[key];
				else process.env[key] = previous;
			}
		});
	}
});

describeDatabase('local admin seed with isolated PostgreSQL fixtures', () => {
	let connection: DatabaseConnection;
	let fixtureId: string | undefined;
	let setupReady = false;
	const rateKeys = new Set<string>();

	beforeAll(async () => {
		const target = assertLocalDatabaseUrl(databaseUrl!, 'test');
		connection = createDatabase(databaseUrl!);
		await verifyLocalDatabase(connection, target);
		await migrateDatabase(connection.db);
		const [existing] = await connection.db.select().from(user).where(eq(user.email, LOCAL_ADMIN_EMAIL));
		if (existing) {
			throw new Error(`Refusing to run local admin fixtures: ${LOCAL_ADMIN_EMAIL} already exists.`);
		}
		setupReady = true;
	}, 30000);

	beforeEach(async () => {
		if (!setupReady) throw new Error('Local admin fixture setup did not pass its safety checks.');
		const result = await seedLocalAdmin(databaseUrl!);
		if (!result.created) {
			throw new Error('Refusing to claim an existing local admin account as a test fixture.');
		}
		const [created] = await connection.db.select().from(user).where(eq(user.email, LOCAL_ADMIN_EMAIL));
		fixtureId = created.id;
	});

	afterEach(async () => {
		if (!fixtureId) return;
		try {
			// Cascade only the user this suite created, never a preexisting fixed-email account.
			await connection.db.delete(user).where(eq(user.id, fixtureId));
		} finally {
			fixtureId = undefined;
		}
	});

	afterAll(async () => {
		if (!connection) return;
		try {
			if (rateKeys.size) {
				await connection.db.delete(rateLimit).where(inArray(rateLimit.key, [...rateKeys]));
			}
		} finally {
			await connection.client.end();
		}
	});

	async function readFixture() {
		const users = await connection.db.select().from(user).where(eq(user.id, fixtureId!));
		const accounts = await connection.db.select().from(account)
			.where(eq(account.userId, fixtureId!)).orderBy(account.id);
		return { users, accounts };
	}

	function createClient(overrides: AuthEnvironment = {}, audience: AuthAudience = 'admin') {
		const config = readAuthConfig({ ...localAuthEnvironment, ...overrides })!;
		const instance = createAuth(connection.db, config, audience);
		// Better Auth groups IPv6 addresses by /64, so each client needs a distinct subnet.
		const subnet = randomBytes(7).toString('hex');
		const ip = `fd${subnet.slice(0, 2)}:${subnet.slice(2, 6)}:${subnet.slice(6, 10)}:${subnet.slice(10, 14)}::1`;
		const headers = new Headers({ [AUTH_IP_HEADER]: ip });
		const normalizedIP = getIP(headers, instance.options);
		expect(normalizedIP).toStartWith('fd');
		const keyFor = (path: string) => `${normalizedIP}|${path}`;
		return {
			config,
			instance,
			keyFor,
			async request(path: string, options: { body?: Record<string, unknown>; cookie?: string } = {}) {
				const requestHeaders = new Headers(headers);
				requestHeaders.set('origin', config.baseURL);
				if (options.cookie) requestHeaders.set('cookie', options.cookie);
				if (options.body !== undefined) requestHeaders.set('content-type', 'application/json');
				rateKeys.add(keyFor(path));
				return instance.handler(new Request(`${config.baseURL}${instance.options.basePath}${path}`, {
					method: options.body === undefined ? 'GET' : 'POST',
					headers: requestHeaders,
					body: options.body === undefined ? undefined : JSON.stringify(options.body)
				}));
			}
		};
	}

	async function sessionsForFixture() {
		return connection.db.select().from(session).where(eq(session.userId, fixtureId!));
	}

	async function expectNoSession(response: Response) {
		expect(response.headers.getSetCookie()).toHaveLength(0);
		expect(await sessionsForFixture()).toHaveLength(0);
	}

	async function expectRejected(response: Response) {
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual(invalidCredentialsError);
		await expectNoSession(response);
	}

	async function signIn(client: ReturnType<typeof createClient>, email = 'admin', password = 'admin') {
		const response = await client.request('/sign-in/email', { body: { email, password } });
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toMatchObject({
			user: { id: fixtureId, email: email === 'admin' ? LOCAL_ADMIN_EMAIL : email, role: 'admin' }
		});
		expect(body.token).toBeString();
		const context = await client.instance.$context;
		const cookieName = context.authCookies.sessionToken.name;
		const setCookie = response.headers.getSetCookie().find((value) => value.startsWith(`${cookieName}=`));
		expect(setCookie).toBeDefined();
		expect(setCookie).toMatch(/; HttpOnly/i);
		expect(setCookie).toMatch(/; SameSite=Lax/i);
		const rows = await sessionsForFixture();
		expect(rows).toHaveLength(1);
		expect(rows[0].token).toBe(body.token);
		return { cookie: setCookie!.split(';')[0], cookieName, storedSession: rows[0] };
	}

	test('creates an admin and a salted Better Auth credential', async () => {
		const { users, accounts } = await readFixture();
		expect(users).toHaveLength(1);
		expect(users[0]).toMatchObject({ email: 'admin@local.example.test', role: 'admin' });
		expect(accounts).toHaveLength(1);
		const credential = accounts[0];
		expect(credential).toMatchObject({
			providerId: 'credential', accountId: users[0].id, userId: users[0].id
		});
		const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
		expect(users[0].id).toMatch(uuid);
		expect(credential.id).toMatch(uuid);
		expect(credential.id).not.toBe(users[0].id);
		expect(credential.password).toBeString();
		expect(credential.password).not.toBe('admin');
		expect(credential.password).not.toBe(await hashPassword('admin'));
		expect(await verifyPassword({ hash: credential.password!, password: 'admin' })).toBe(true);
		expect(await verifyPassword({ hash: credential.password!, password: 'wrong' })).toBe(false);
	});

	test('reruns are no-ops, preserving IDs, hashes, and timestamps', async () => {
		const before = await readFixture();
		expect(await seedLocalAdmin(databaseUrl!)).toEqual({ created: false });
		expect(await seedLocalAdmin(databaseUrl!)).toEqual({ created: false });
		expect(await readFixture()).toEqual(before);
	});

	test.each([
		'non-admin role', 'wrong password', 'missing password', 'malformed hash',
		'missing credential', 'mismatched account ID', 'duplicate credential'
	])('refuses a collision with %s without overwriting or promoting it', async (collision) => {
		switch (collision) {
			case 'non-admin role':
				await connection.db.update(user).set({ role: 'student' }).where(eq(user.id, fixtureId!));
				break;
			case 'wrong password':
				await connection.db.update(account).set({ password: await hashPassword('another-password') })
					.where(eq(account.userId, fixtureId!));
				break;
			case 'missing password':
				await connection.db.update(account).set({ password: null }).where(eq(account.userId, fixtureId!));
				break;
			case 'malformed hash':
				await connection.db.update(account).set({ password: 'not-a-hash' }).where(eq(account.userId, fixtureId!));
				break;
			case 'missing credential':
				await connection.db.delete(account).where(eq(account.userId, fixtureId!));
				break;
			case 'mismatched account ID':
				await connection.db.update(account).set({ accountId: randomUUID() }).where(eq(account.userId, fixtureId!));
				break;
			case 'duplicate credential': {
				const { accounts } = await readFixture();
				await connection.db.insert(account).values({ ...accounts[0], id: randomUUID() });
				break;
			}
		}
		const before = await readFixture();
		await expect(seedLocalAdmin(databaseUrl!)).rejects.toThrow(/Refusing to overwrite or promote/);
		expect(await readFixture()).toEqual(before);
	});

	test('admin/admin creates a signed admin session and logout revokes the cookie', async () => {
		const before = await readFixture();
		const client = createClient();
		expect(client.config.localAdmin).toBe(true);
		const { cookie, cookieName, storedSession } = await signIn(client);
		const current = await client.request('/get-session', { cookie });
		expect(current.status).toBe(200);
		expect(await current.json()).toMatchObject({
			user: { id: fixtureId, email: LOCAL_ADMIN_EMAIL, role: 'admin' },
			session: { id: storedSession.id, userId: fixtureId, token: storedSession.token }
		});
		expect(await readFixture()).toEqual(before);

		const logout = await client.request('/sign-out', { cookie, body: {} });
		expect(logout.status).toBe(200);
		expect(await logout.json()).toMatchObject({ success: true });
		expect(logout.headers.getSetCookie().find((value) => value.startsWith(`${cookieName}=`)))
			.toMatch(/; Max-Age=0/i);
		expect(await sessionsForFixture()).toHaveLength(0);
		const replay = await client.request('/get-session', { cookie });
		expect(replay.status).toBe(200);
		expect(await replay.json()).toBeNull();
	});

	test('the alias does not bypass password verification', async () => {
		const response = await createClient().request('/sign-in/email', {
			body: { email: 'admin', password: 'incorrect-password' }
		});
		await expectRejected(response);
	});

	for (const { label, overrides, audience } of [
		{ label: 'the student endpoint', overrides: {}, audience: 'student' },
		{ label: 'the flag is off', overrides: { LOCAL_ADMIN_ENABLED: 'false' }, audience: 'admin' },
		{ label: 'production configuration', overrides: { NODE_ENV: 'production' }, audience: 'admin' },
		{ label: 'a non-loopback origin', overrides: { BETTER_AUTH_URL: 'https://auth.example.test' }, audience: 'admin' }
	] as const) {
		test(`rejects local credentials with ${label}`, async () => {
			const client = createClient(overrides, audience);
			if (audience === 'admin') expect(client.config.localAdmin).not.toBe(true);
			for (const email of ['admin', LOCAL_ADMIN_EMAIL]) {
				await expectRejected(await client.request('/sign-in/email', { body: { email, password: 'admin' } }));
			}
		});
	}

	test.each(['password', 'role'])('the stored %s remains authoritative for alias sign-in', async (field) => {
		if (field === 'password') {
			await connection.db.update(account).set({ password: await hashPassword('changed-password') })
				.where(eq(account.userId, fixtureId!));
		} else {
			await connection.db.update(user).set({ role: 'student' }).where(eq(user.id, fixtureId!));
		}
		const before = await readFixture();
		await expectRejected(await createClient().request('/sign-in/email', {
			body: { email: 'admin', password: 'admin' }
		}));
		expect(await readFixture()).toEqual(before);
	});

	test('numeric email is a clean client error, not a server error', async () => {
		const response = await createClient().request('/sign-in/email', {
			body: { email: 42, password: 'Admin!42' }
		});
		expect([400, 401]).toContain(response.status);
		await expectNoSession(response);
	});

	test('the local exception does not relax the eight-character policy for other admins', async () => {
		const email = `local-admin-policy-${randomUUID()}@example.test`;
		await connection.db.update(user).set({ email }).where(eq(user.id, fixtureId!));
		const client = createClient();
		// The existing hash matches "admin", but this is no longer the dedicated local identity.
		await expectRejected(await client.request('/sign-in/email', { body: { email, password: 'admin' } }));
		await connection.db.update(account).set({ password: await hashPassword('Admin!42') })
			.where(eq(account.userId, fixtureId!));
		await signIn(client, email, 'Admin!42');
	});

	test('five alias attempts exhaust the shared limiter until its 60-second window expires', async () => {
		const client = createClient();
		for (let attempt = 0; attempt < 5; attempt++) {
			await expectRejected(await client.request('/sign-in/email', {
				body: { email: 'admin', password: 'incorrect-password' }
			}));
		}
		const blocked = await client.request('/sign-in/email', { body: { email: 'admin', password: 'admin' } });
		expect(blocked.status).toBe(429);
		expect(Number(blocked.headers.get('x-retry-after'))).toBeGreaterThan(0);
		expect(Number(blocked.headers.get('x-retry-after'))).toBeLessThanOrEqual(60);
		await expectNoSession(blocked);
		const key = client.keyFor('/sign-in/email');
		const rows = await connection.db.select().from(rateLimit).where(eq(rateLimit.key, key));
		expect(rows).toHaveLength(1);
		expect(rows[0].count).toBe(5);
		expect(rows[0].lastRequest).toBeGreaterThan(Date.now() - 60000);

		await connection.db.update(rateLimit).set({ lastRequest: Date.now() - 61000 }).where(eq(rateLimit.key, key));
		await signIn(client);
		const [reset] = await connection.db.select().from(rateLimit).where(eq(rateLimit.key, key));
		expect(reset.count).toBe(1);
	});
});
