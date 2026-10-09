import { createGoogleClient, isNonblank, isRecord, type GoogleClientOptions } from '../google/client';
import type { GmailConfig } from './config';
import { GmailError } from './error';
import { composeEmail, parseMailbox, type Email } from './message';

export type GmailClient = {
	readonly testMode: boolean;
	send(email: Email, signal?: AbortSignal): Promise<string>;
};

const sendUrl = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

export function createGmailClient(config: GmailConfig, options: GoogleClientOptions = {}): GmailClient {
	if (!config || typeof config.testMode !== 'boolean') {
		throw new GmailError('configuration', 'Gmail client configuration requires a boolean testMode.');
	}
	parseMailbox(config.senderAddress, 'configuration');
	const { senderAddress, testMode } = config;
	const google = createGoogleClient(config, { ...options, service: 'Gmail', error: GmailError });

	return {
		testMode,
		async send(email, signal) {
			if (signal?.aborted) throw new GmailError('upstream', 'Gmail request was cancelled.');
			const mime = await composeEmail(email, senderAddress, testMode);
			const { data, status } = await google.request(sendUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ raw: mime.toString('base64url') })
			}, signal);
			if (!isRecord(data) || !isNonblank(data.id) || /[^A-Za-z0-9_-]/.test(data.id)) {
				throw new GmailError('upstream', 'Gmail returned an invalid message ID.', status);
			}
			return data.id;
		}
	};
}
