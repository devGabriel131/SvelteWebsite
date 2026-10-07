import type { GoogleCredentials } from '../google/client';
import { GmailError } from './error';
import { parseMailbox } from './message';

export type GmailEnvironment = {
	GOOGLE_OAUTH_CLIENT_ID?: string;
	GOOGLE_OAUTH_CLIENT_SECRET?: string;
	GOOGLE_OAUTH_REFRESH_TOKEN?: string;
	GMAIL_SENDER_ADDRESS?: string;
	EMAIL_TEST_MODE?: string;
};

export type GmailConfig = GoogleCredentials & {
	senderAddress: string;
	testMode: boolean;
};

function readTestMode(value: string | undefined): boolean {
	switch (value?.trim().toLowerCase() ?? '') {
		case '1':
		case 'true':
		case 'yes':
		case 'on':
			return true;
		case '0':
		case 'false':
		case 'no':
		case 'off':
		case '':
			return false;
		default:
			throw new GmailError('configuration', 'Invalid Gmail configuration: EMAIL_TEST_MODE must be 1/true/yes/on, 0/false/no/off, or blank.');
	}
}

export function readGmailConfig(env: GmailEnvironment): GmailConfig {
	const values = {
		GOOGLE_OAUTH_CLIENT_ID: env.GOOGLE_OAUTH_CLIENT_ID?.trim(),
		GOOGLE_OAUTH_CLIENT_SECRET: env.GOOGLE_OAUTH_CLIENT_SECRET?.trim(),
		GOOGLE_OAUTH_REFRESH_TOKEN: env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim(),
		GMAIL_SENDER_ADDRESS: env.GMAIL_SENDER_ADDRESS
	};
	// Check blanks without trimming the sender: mailbox validation must see all control characters.
	const missing = Object.entries(values).filter(([, value]) => !value || /^\s*$/.test(value)).map(([name]) => name);
	if (missing.length) {
		throw new GmailError('configuration', `Missing Gmail configuration: ${missing.join(', ')}.`);
	}
	parseMailbox(values.GMAIL_SENDER_ADDRESS, 'configuration');

	return {
		clientId: values.GOOGLE_OAUTH_CLIENT_ID!,
		clientSecret: values.GOOGLE_OAUTH_CLIENT_SECRET!,
		refreshToken: values.GOOGLE_OAUTH_REFRESH_TOKEN!,
		senderAddress: values.GMAIL_SENDER_ADDRESS!.trim(),
		testMode: readTestMode(env.EMAIL_TEST_MODE)
	};
}
