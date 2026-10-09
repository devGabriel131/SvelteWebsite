import {
	GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN,
	GMAIL_SENDER_ADDRESS, EMAIL_TEST_MODE
} from '$app/env/private';
import { createGmailClient, type GmailClient } from './client';
import { readGmailConfig } from './config';

let client: GmailClient | undefined;

export function getGmailClient(): GmailClient {
	client ??= createGmailClient(readGmailConfig({
		GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN,
		GMAIL_SENDER_ADDRESS, EMAIL_TEST_MODE
	}));
	return client;
}
