import { describe, expect, test } from 'bun:test';
import { readGmailConfig, type GmailConfig, type GmailEnvironment } from '../src/lib/server/gmail/config';
import { GmailError } from '../src/lib/server/gmail/error';
import { GoogleApiError } from '../src/lib/server/google/client';

const environment = {
	GOOGLE_OAUTH_CLIENT_ID: 'test-gmail-client-id',
	GOOGLE_OAUTH_CLIENT_SECRET: 'test-gmail-client-secret+&=',
	GOOGLE_OAUTH_REFRESH_TOKEN: 'test-gmail-refresh-token+&=',
	GMAIL_SENDER_ADDRESS: 'sender@example.com'
} satisfies GmailEnvironment;
const config: GmailConfig = {
	clientId: environment.GOOGLE_OAUTH_CLIENT_ID,
	clientSecret: environment.GOOGLE_OAUTH_CLIENT_SECRET,
	refreshToken: environment.GOOGLE_OAUTH_REFRESH_TOKEN,
	senderAddress: environment.GMAIL_SENDER_ADDRESS,
	testMode: false
};
const names = Object.keys(environment) as (keyof typeof environment)[];

function configurationError(env: GmailEnvironment, privateValues: string[] = []): GmailError {
	try {
		readGmailConfig(env);
	} catch (error) {
		expect(error).toBeInstanceOf(GmailError);
		expect(error).toBeInstanceOf(GoogleApiError);
		const failure = error as GmailError;
		expect(failure.name).toBe('GmailError');
		expect(failure.kind).toBe('configuration');
		expect(failure.status).toBeUndefined();
		expect(failure).not.toHaveProperty('cause');
		for (const value of [...Object.values(environment), ...privateValues]) {
			expect(`${String(failure)} ${failure.stack} ${JSON.stringify(failure)}`).not.toContain(value);
		}
		return failure;
	}
	throw new Error('Expected a safe Gmail configuration error.');
}

describe('Gmail configuration', () => {
	for (let mask = 0; mask < 16; mask += 1) {
		test(`validates required configuration subset ${mask} without exposing values`, () => {
			const env = Object.fromEntries(names.filter((_, index) => mask & (1 << index))
				.map((name) => [name, environment[name]])) as GmailEnvironment;
			if (mask === 15) {
				expect(readGmailConfig(env)).toEqual(config);
			} else {
				expect(configurationError(env).message).toBe(
					`Missing Gmail configuration: ${names.filter((name) => !env[name]).join(', ')}.`
				);
			}
		});
	}

	for (const name of names) {
		test(`treats empty and whitespace-only ${name} as missing`, () => {
			for (const value of ['', ' ', ' \t\r\n', '\u00a0']) {
				expect(configurationError({ ...environment, [name]: value }).message)
					.toBe(`Missing Gmail configuration: ${name}.`);
			}
		});
	}

	test('aggregates blank and missing settings before validating optional settings', () => {
		const error = configurationError({
			GOOGLE_OAUTH_CLIENT_ID: ' ', GOOGLE_OAUTH_REFRESH_TOKEN: '\t', EMAIL_TEST_MODE: 'private-invalid-mode'
		}, ['private-invalid-mode']);
		expect(error.message).toBe(`Missing Gmail configuration: ${names.join(', ')}.`);
	});

	test('trims credentials and surrounding sender spaces without mutating input', () => {
		const env = Object.freeze({
			GOOGLE_OAUTH_CLIENT_ID: ` \t${environment.GOOGLE_OAUTH_CLIENT_ID}\n`,
			GOOGLE_OAUTH_CLIENT_SECRET: `\n${environment.GOOGLE_OAUTH_CLIENT_SECRET} `,
			GOOGLE_OAUTH_REFRESH_TOKEN: ` ${environment.GOOGLE_OAUTH_REFRESH_TOKEN}\r\n`,
			GMAIL_SENDER_ADDRESS: `  ${environment.GMAIL_SENDER_ADDRESS}  `
		});
		expect(readGmailConfig(env)).toEqual(config);
		expect(env.GMAIL_SENDER_ADDRESS).toBe(`  ${environment.GMAIL_SENDER_ADDRESS}  `);
		expect(env.GOOGLE_OAUTH_REFRESH_TOKEN).toBe(` ${environment.GOOGLE_OAUTH_REFRESH_TOKEN}\r\n`);
	});

	test('uses the legacy Gmail refresh token, never the Drive refresh token', () => {
		const env = { ...environment, DRIVE_OAUTH_REFRESH_TOKEN: 'test-drive-only-refresh-token' };
		expect(readGmailConfig(env).refreshToken).toBe(environment.GOOGLE_OAUTH_REFRESH_TOKEN);
		expect(configurationError({ ...env, GOOGLE_OAUTH_REFRESH_TOKEN: undefined }, [env.DRIVE_OAUTH_REFRESH_TOKEN]).message)
			.toBe('Missing Gmail configuration: GOOGLE_OAUTH_REFRESH_TOKEN.');
	});

	test('accepts a single mailbox with an optional Unicode or quoted display name', () => {
		for (const senderAddress of [
			'sender+reports@example.com', 'Sender.Name@reports.example.com',
			'Equipo María <sender@example.com>', '"Menéndez, María" <sender@example.com>'
		]) {
			expect(readGmailConfig({ ...environment, GMAIL_SENDER_ADDRESS: ` ${senderAddress} ` }))
				.toEqual({ ...config, senderAddress });
		}
	});

	test('rejects sender controls before trimming, including leading and trailing whitespace controls', () => {
		const controls = [...Array.from({ length: 32 }, (_, index) => index),
			...Array.from({ length: 33 }, (_, index) => index + 127)];
		for (const code of controls) {
			const control = String.fromCharCode(code);
			for (const senderAddress of [
				`${control}sender@example.com`, `sender@example.com${control}`,
				`Sen${control}der <sender@example.com>`
			]) {
				configurationError({ ...environment, GMAIL_SENDER_ADDRESS: senderAddress }, [senderAddress]);
			}
		}
	});

	test('rejects unsupported sender syntax with generic configuration errors', () => {
		for (const senderAddress of [
			'not-a-mailbox', 'one@example.com, two@example.com',
			'Team: one@example.com;', 'sender(comment)@example.com',
			'"quoted.local"@example.com', 'josé@example.com', 'sender@exámple.com',
			'sender@[127.0.0.1]', '.sender@example.com', 'sender..name@example.com',
			'sender@example..com', 'sender@-example.com'
		]) {
			configurationError({ ...environment, GMAIL_SENDER_ADDRESS: senderAddress }, [senderAddress]);
		}
	});

	for (const value of ['1', 'true', 'yes', 'on', ' TRUE ', '\tYes\n', 'On']) {
		test(`enables test mode for ${JSON.stringify(value)}`, () => {
			expect(readGmailConfig({ ...environment, EMAIL_TEST_MODE: value })).toEqual({ ...config, testMode: true });
		});
	}

	for (const value of [undefined, '', ' \t\n', '0', 'false', 'no', 'off', ' FALSE ', '\tNo\n', 'Off']) {
		test(`disables test mode for ${JSON.stringify(value)}`, () => {
			expect(readGmailConfig({ ...environment, EMAIL_TEST_MODE: value })).toEqual(config);
		});
	}

	test('rejects unknown test-mode values rather than silently sending to the original recipients', () => {
		for (const value of ['2', '-1', 'enabled', 'disabled', 'tru', 'yes please', 'true\0', 'private-mode-secret']) {
			const error = configurationError({ ...environment, EMAIL_TEST_MODE: value });
			expect(error.message).toBe('Invalid Gmail configuration: EMAIL_TEST_MODE must be 1/true/yes/on, 0/false/no/off, or blank.');
		}
		configurationError({ ...environment, EMAIL_TEST_MODE: 'private-mode-secret' }, ['private-mode-secret']);
	});
});
