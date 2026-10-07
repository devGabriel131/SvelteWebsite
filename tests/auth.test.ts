import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { readAuthConfig, type AuthEnvironment } from '../src/lib/server/auth/config';
import { AUTH_IP_HEADER, createAuth, type Auth } from '../src/lib/server/auth/core';
import { isValidPin } from '../src/lib/server/auth/pin';
import { isValidCredential } from '../src/lib/server/auth/credentials';
import { createDatabase, type DatabaseConnection } from '../src/lib/server/db/connection';

const secret = randomBytes(32).toString('hex');
const baseURL = 'https://auth.example.test';
const configuredEnvironment = { BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: baseURL };

describe('authentication configuration', () => {
	test('is optional only when all authentication variables are absent', () => {
		expect(readAuthConfig({})).toBeNull();
		expect(readAuthConfig({
			BETTER_AUTH_SECRET: undefined,
			BETTER_AUTH_URL: undefined,
			BETTER_AUTH_TRUSTED_ORIGINS: undefined
		})).toBeNull();
	});

	for (const environment of [
		{ BETTER_AUTH_SECRET: secret },
		{ BETTER_AUTH_URL: baseURL },
		{ BETTER_AUTH_TRUSTED_ORIGINS: baseURL },
		{ BETTER_AUTH_SECRET: secret, BETTER_AUTH_TRUSTED_ORIGINS: baseURL },
		{ BETTER_AUTH_URL: baseURL, BETTER_AUTH_TRUSTED_ORIGINS: baseURL }
	] satisfies AuthEnvironment[]) {
		test(`rejects partial configuration: ${Object.keys(environment).join(', ')}`, () => {
			expect(() => readAuthConfig(environment)).toThrow(/Set both BETTER_AUTH_SECRET and BETTER_AUTH_URL/);
		});
	}

	for (const invalidSecret of ['', 'short', 'a'.repeat(31), ' '.repeat(32), '\t\n'.repeat(32)]) {
		test(`rejects a short or blank secret (${JSON.stringify(invalidSecret)})`, () => {
			expect(() => readAuthConfig({
				...configuredEnvironment, BETTER_AUTH_SECRET: invalidSecret
			})).toThrow(/BETTER_AUTH_SECRET.*at least 32 characters.*blank/);
		});
	}

	test('accepts a 32-character secret without trimming or transforming it', () => {
		const exactSecret = ' 0123456789abcdef0123456789abcd ';
		expect(exactSecret).toHaveLength(32);
		expect(readAuthConfig({ ...configuredEnvironment, BETTER_AUTH_SECRET: exactSecret })).toEqual({
			secret: exactSecret, baseURL, trustedOrigins: [baseURL]
		});
	});

	for (const origin of [
		baseURL,
		'https://auth.example.test:8443',
		'http://localhost:5173',
		'http://127.0.0.1:5173',
		'http://127.10.20.30:5173',
		'http://[::1]:5173'
	]) {
		test(`accepts an exact HTTPS or HTTP loopback origin: ${origin}`, () => {
			expect(readAuthConfig({ ...configuredEnvironment, BETTER_AUTH_URL: origin })).toEqual({
				secret, baseURL: origin, trustedOrigins: [origin]
			});
			expect(readAuthConfig({
				...configuredEnvironment, BETTER_AUTH_TRUSTED_ORIGINS: origin
			})?.trustedOrigins).toEqual([origin]);
		});
	}

	for (const origin of [
		'', ' ', 'not-a-url', 'auth.example.test',
		'http://auth.example.test', 'http://192.168.1.10:5173', 'http://localhost.evil.test',
		'ftp://auth.example.test', 'https://*.example.test', '*',
		`${baseURL}/`, `${baseURL}/api/auth`, `${baseURL}?redirect=1`, `${baseURL}#fragment`,
		'https://user:password@auth.example.test', ` ${baseURL}`, `${baseURL} `,
		'https://AUTH.example.test', 'https://auth.example.test:443'
	]) {
		test(`rejects an unsafe or non-exact origin: ${JSON.stringify(origin)}`, () => {
			expect(() => readAuthConfig({
				...configuredEnvironment, BETTER_AUTH_URL: origin
			})).toThrow(/BETTER_AUTH_URL.*exact HTTPS origin/);
			// List entries may have surrounding whitespace; the base URL may not.
			if (origin.trim() !== baseURL) {
				expect(() => readAuthConfig({
					...configuredEnvironment, BETTER_AUTH_TRUSTED_ORIGINS: origin
				})).toThrow(/BETTER_AUTH_TRUSTED_ORIGINS.*exact HTTPS origin/);
			}
		});
	}

	test('trims comma-separated trusted origins and deduplicates exact origins', () => {
		expect(readAuthConfig({
			...configuredEnvironment,
			BETTER_AUTH_TRUSTED_ORIGINS: ` ${baseURL}, https://admin.example.test ,${baseURL}, http://localhost:5173 `
		})).toEqual({
			secret, baseURL,
			trustedOrigins: [baseURL, 'https://admin.example.test', 'http://localhost:5173']
		});
	});

	for (const origins of ['', ' ', `${baseURL},`, `,${baseURL}`, `${baseURL},,https://admin.example.test`]) {
		test(`rejects empty trusted-origin entries: ${JSON.stringify(origins)}`, () => {
			expect(() => readAuthConfig({
				...configuredEnvironment, BETTER_AUTH_TRUSTED_ORIGINS: origins
			})).toThrow(/BETTER_AUTH_TRUSTED_ORIGINS/);
		});
	}
});

describe('local admin configuration', () => {
	const localEnvironment: AuthEnvironment = {
		...configuredEnvironment,
		BETTER_AUTH_URL: 'http://localhost:5173',
		LOCAL_ADMIN_ENABLED: 'true',
		NODE_ENV: 'development'
	};

	for (const origin of ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://[::1]:5173']) {
		test(`enables the explicit development opt-in on ${origin}`, () => {
			expect(readAuthConfig({ ...localEnvironment, BETTER_AUTH_URL: origin })?.localAdmin).toBe(true);
		});
	}

	for (const overrides of [
		{ LOCAL_ADMIN_ENABLED: undefined }, { LOCAL_ADMIN_ENABLED: 'false' }, { LOCAL_ADMIN_ENABLED: 'TRUE' },
		{ NODE_ENV: undefined }, { NODE_ENV: 'production' }, { NODE_ENV: 'test' },
		{ BETTER_AUTH_URL: 'https://auth.example.test' },
		{ RAILWAY_PROJECT_ID: 'project' }, { RAILWAY_ENVIRONMENT_ID: 'environment' }
	] satisfies AuthEnvironment[]) {
		test(`does not enable the local login with ${JSON.stringify(overrides)}`, () => {
			expect(readAuthConfig({ ...localEnvironment, ...overrides })?.localAdmin).not.toBe(true);
		});
	}
});

describe('four-digit PIN validation', () => {
	for (const pin of ['0000', '0042', '1234', '9999']) {
		test(`accepts the exact ASCII string ${pin} without removing leading zeroes`, () => {
			expect(isValidPin(pin)).toBe(true);
			expect(pin).toHaveLength(4);
		});
	}

	const invalidPins: unknown[] = [
		undefined, null, 42, 1234, true, false, {}, [], ['0042'], new String('0042'),
		'', '0', '042', '00042', '123456', ' 0042', '0042 ', '00 2',
		'0042\n', '0042\r', '0042\r\n', '\n0042', '004\n', '00\t2', '00\u00002',
		'00a2', '+042', '-042', '4.20', '４２４２', '٠٠٤٢', '۰۰۴۲', '𝟘𝟘𝟜𝟚'
	];
	for (const [index, pin] of invalidPins.entries()) {
		test(`rejects malformed PIN #${index}: ${JSON.stringify(pin)}`, () => {
			expect(isValidPin(pin)).toBe(false);
		});
	}
});

describe('audience-specific credential validation', () => {
	for (const password of ['abcdefgh', '12345678', 'a longer password', 'a'.repeat(128)]) {
		test(`accepts an admin password of ${password.length} characters without composition rules`, () => {
			expect(isValidCredential('admin', password)).toBe(true);
			expect(isValidCredential('student', password)).toBe(false);
		});
	}

	for (const password of [undefined, null, 12345678, {}, [], '0042', 'admin', '1234567', 'a'.repeat(129)]) {
		test(`rejects an invalid admin credential: ${JSON.stringify(password)}`, () => {
			expect(isValidCredential('admin', password)).toBe(false);
		});
	}

	test('retains the exact PIN policy for students', () => {
		expect(isValidCredential('student', '0042')).toBe(true);
		for (const value of [42, '042', '0042\n', '４２４２', 'abcd']) {
			expect(isValidCredential('student', value)).toBe(false);
		}
	});
});

describe('real Better Auth options and default password crypto (no database I/O)', () => {
	let connection: DatabaseConnection;
	let auth: Auth;
	let context: Awaited<Auth['$context']>;

	beforeAll(async () => {
		// postgres.js is lazy: inspecting the real adapter/context and hashing never opens a socket.
		connection = createDatabase('postgresql://auth_unit:unused@127.0.0.1:1/auth_unit');
		auth = createAuth(connection.db, { secret, baseURL, trustedOrigins: [baseURL] });
		context = await auth.$context;
	});

	afterAll(async () => {
		await connection?.client.end();
	});

	test('uses the supplied configuration, the Drizzle adapter, and the auth API path', () => {
		expect(auth.options.secret).toBe(secret);
		expect(auth.options.baseURL).toBe(baseURL);
		expect(auth.options.basePath).toBe('/api/auth');
		expect(auth.options.trustedOrigins).toEqual([baseURL]);
		expect(context.adapter.id).toBe('drizzle');
		for (const model of ['user', 'session', 'account', 'verification', 'rateLimit']) {
			expect(context.tables).toHaveProperty(model);
		}
	});

	test('enables credential sign-in, never public signup or password recovery', () => {
		expect(context.options.emailAndPassword).toMatchObject({
			enabled: true, disableSignUp: true, minPasswordLength: 4, maxPasswordLength: 4
		});
		expect(context.options.emailAndPassword).not.toHaveProperty('sendResetPassword');
		expect(context.password.config).toEqual({ minPasswordLength: 4, maxPasswordLength: 4 });
	});

	test('admin entry point shares the store/cookie but uses eight-to-128-character passwords', async () => {
		const admin = createAuth(connection.db, { secret, baseURL, trustedOrigins: [baseURL] }, 'admin');
		const adminContext = await admin.$context;
		expect(admin.options.basePath).toBe('/admin/auth');
		expect(admin.options.emailAndPassword).toMatchObject({ enabled: true, disableSignUp: true });
		expect(adminContext.password.config).toEqual({ minPasswordLength: 8, maxPasswordLength: 128 });
		expect(adminContext.password.hash).toBe(hashPassword);
		expect(adminContext.password.verify).toBe(verifyPassword);
		expect(adminContext.authCookies).toEqual(context.authCookies);
	});

	test('role is a server-controlled additional field, defaulting to student', () => {
		expect(auth.options.user.additionalFields.role).toEqual({
			type: ['student', 'admin'], required: true, defaultValue: 'student', input: false
		});
	});

	test('disables signup, recovery, social authentication, and credential/profile mutations', () => {
		expect(auth.options.disabledPaths).toEqual(expect.arrayContaining([
			'/sign-up/email', '/sign-in/social', '/callback/:id',
			'/change-password', '/set-password', '/reset-password', '/reset-password/:token',
			'/request-password-reset', '/verify-password', '/change-email', '/update-user',
			'/delete-user', '/delete-user/callback', '/send-verification-email', '/verify-email',
			'/link-social', '/unlink-account', '/list-accounts', '/account-info',
			'/get-access-token', '/refresh-token'
		]));
		for (const path of ['/sign-in/email', '/get-session', '/sign-out']) {
			expect(auth.options.disabledPaths).not.toContain(path);
		}
	});

	test('enforces database limits of 100/minute globally and 5/minute for email sign-in', () => {
		expect(context.rateLimit).toMatchObject({
			enabled: true, storage: 'database', window: 60, max: 100,
			customRules: { '/sign-in/email': { window: 60, max: 5 } }
		});
		expect(context.options.rateLimit).not.toHaveProperty('customStorage');
		expect(context.options).not.toHaveProperty('secondaryStorage');
	});

	test('uses only the server-owned IP header and database-validated, secure cookies', () => {
		expect(AUTH_IP_HEADER).toBe('x-auth-client-ip');
		expect(auth.options.advanced.ipAddress.ipAddressHeaders).toEqual([AUTH_IP_HEADER]);
		expect(auth.options.session.cookieCache.enabled).toBe(false);
		expect(context.authCookies.sessionToken.attributes).toMatchObject({
			httpOnly: true, secure: true, sameSite: 'lax', path: '/'
		});
		expect(context.options.advanced).not.toHaveProperty('disableCSRFCheck', true);
		expect(context.options.advanced).not.toHaveProperty('disableOriginCheck', true);
	});

	test('permits non-secure cookies only for the configured HTTP loopback development origin', async () => {
		const localAuth = createAuth(connection.db, {
			secret, baseURL: 'http://localhost:5173', trustedOrigins: ['http://localhost:5173']
		});
		expect(localAuth.options.advanced.useSecureCookies).toBe(false);
		expect((await localAuth.$context).authCookies.sessionToken.attributes.secure).toBe(false);
	});

	test('keeps Better Auth default hash/verify functions instead of overriding PIN crypto', () => {
		expect(context.options.emailAndPassword).not.toHaveProperty('password');
		expect(context.password.hash).toBe(hashPassword);
		expect(context.password.verify).toBe(verifyPassword);
	});

	test('salts each hash and verifies the exact 0042 string with Better Auth defaults', async () => {
		const [first, second] = await Promise.all([
			context.password.hash('0042'), context.password.hash('0042')
		]);
		expect(first).not.toBe('0042');
		expect(second).not.toBe('0042');
		expect(first).not.toBe(second);
		for (const hash of [first, second]) {
			expect(await verifyPassword({ hash, password: '0042' })).toBe(true);
			expect(await context.password.verify({ hash, password: '0043' })).toBe(false);
			expect(await context.password.verify({ hash, password: '42' })).toBe(false);
		}
	});
});
