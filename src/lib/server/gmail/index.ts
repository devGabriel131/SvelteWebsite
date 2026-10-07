import {
	GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN,
	GMAIL_SENDER_ADDRESS, EMAIL_TEST_MODE
} from '$app/env/private';
import { createGmailClient, type GmailClient } from './client';
import { readGmailConfig } from './config';
import type { Email } from './message';

export { createGmailClient, readGmailConfig };
export { GmailError } from './error';
export type { GmailClient, Email };
export type { EmailAttachment } from './message';
export type { GmailConfig, GmailEnvironment } from './config';
export type { GoogleClientOptions, GoogleErrorKind } from '../google/client';

let client: GmailClient | undefined;

export function getGmailClient(): GmailClient {
	client ??= createGmailClient(readGmailConfig({
		GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN,
		GMAIL_SENDER_ADDRESS, EMAIL_TEST_MODE
	}));
	return client;
}

export async function sendEmail(email: Email, signal?: AbortSignal): Promise<string> {
	return getGmailClient().send(email, signal);
}
