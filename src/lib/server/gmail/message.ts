import { Buffer } from 'node:buffer';
import MailComposer from 'nodemailer/lib/mail-composer';
import type { GoogleErrorKind } from '../google/client';
import { GmailError } from './error';

export type EmailAttachment = {
	filename: string;
	bytes: Uint8Array;
	mimeType?: string;
};

export type Email = {
	to: string[];
	cc?: string[];
	bcc?: string[];
	subject: string;
	body?: string;
	htmlBody?: string;
	attachments?: EmailAttachment[];
};

type Mailbox = { name: string; address: string };
const headerControls = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;
const localPart = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const domainLabel = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const mediaType = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+\/[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;

// Deliberately accept a strict mailbox subset instead of a forgiving parser that can
// silently repair malformed input or turn one array entry into several recipients.
export function parseMailbox(value: unknown, kind: GoogleErrorKind = 'bad_input'): Mailbox {
	const invalid = () => new GmailError(kind, 'Gmail requires a valid single mailbox for each address.');
	if (typeof value !== 'string' || headerControls.test(value)) throw invalid();
	const input = value.trim();
	let address = input;
	let name = '';
	if (input.includes('<') || input.includes('>')) {
		const match = /^(.*?)<([^<>]+)>$/u.exec(input);
		if (!match) throw invalid();
		name = match[1].trim();
		address = match[2];
		if (name.startsWith('"')) {
			if (!/^"(?:[^"\\]|\\["\\])*"$/u.test(name)) throw invalid();
			name = name.slice(1, -1).replace(/\\(["\\])/g, '$1');
		} else if (/["<>()[\],:;@\\]/u.test(name)) {
			throw invalid();
		}
	}
	const parts = address.split('@');
	if (parts.length !== 2 || address.length > 254 || parts[0].length > 64 ||
		!localPart.test(parts[0]) || !parts[1].split('.').every((label) => domainLabel.test(label))) {
		throw invalid();
	}
	return { name, address };
}

function validateEmail(email: Email): void {
	if (!email || !Array.isArray(email.to) || email.to.length === 0) {
		throw new GmailError('bad_input', 'Email requires at least one To recipient.');
	}
	for (const recipients of [email.to, email.cc, email.bcc]) {
		if (recipients === undefined) continue;
		if (!Array.isArray(recipients)) throw new GmailError('bad_input', 'Email recipients must be arrays of mailboxes.');
		for (const recipient of recipients) parseMailbox(recipient);
	}
	if (typeof email.subject !== 'string' || !email.subject.trim() || headerControls.test(email.subject)) {
		throw new GmailError('bad_input', 'Email subject must be nonblank and contain no control characters.');
	}
	if ((email.body !== undefined && typeof email.body !== 'string') ||
		(email.htmlBody !== undefined && typeof email.htmlBody !== 'string') ||
		(!email.body?.trim() && !email.htmlBody?.trim())) {
		throw new GmailError('bad_input', 'Email requires a plain-text or HTML body.');
	}
	if (email.attachments !== undefined) {
		if (!Array.isArray(email.attachments)) throw new GmailError('bad_input', 'Email attachments must be an array.');
		for (const attachment of email.attachments) {
			if (!attachment || typeof attachment.filename !== 'string' || !attachment.filename.trim() ||
				headerControls.test(attachment.filename) || /[/\\]/.test(attachment.filename) ||
				attachment.filename === '.' || attachment.filename === '..') {
				throw new GmailError('bad_input', 'Email attachment filename must be a nonblank name without paths or control characters.');
			}
			if (!(attachment.bytes instanceof Uint8Array)) {
				throw new GmailError('bad_input', 'Email attachment bytes must be a Uint8Array.');
			}
			if (attachment.mimeType !== undefined && (typeof attachment.mimeType !== 'string' ||
							headerControls.test(attachment.mimeType) || !mediaType.test(attachment.mimeType))) {
				throw new GmailError('bad_input', 'Email attachment MIME type must be a type/subtype without parameters.');
			}
		}
	}
}

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (character) => ({
		'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
	})[character]!);
}

export function rewriteForTestMode(email: Email, senderAddress: string): Email {
	const summary = [
		'--- TEST MODE: original recipients ---',
		`To: ${email.to.join(', ')}`,
		...(email.cc?.length ? [`Cc: ${email.cc.join(', ')}`] : []),
		...(email.bcc?.length ? [`Bcc: ${email.bcc.join(', ')}`] : []),
		'---'
	].join('\n');
	return {
		...email,
		to: [senderAddress], cc: [], bcc: [],
		subject: `[TEST] ${email.subject}`,
		body: `${summary}\n\n${email.body ?? ''}`,
		htmlBody: email.htmlBody ? `<pre>${escapeHtml(summary)}</pre>\n${email.htmlBody}` : undefined
	};
}

export async function composeEmail(email: Email, senderAddress: string, testMode = false): Promise<Buffer> {
	const from = parseMailbox(senderAddress, 'configuration');
	// Validate original recipients even when test mode would replace them.
	validateEmail(email);
	const message = testMode ? rewriteForTestMode(email, senderAddress) : email;
	try {
		const mime = new MailComposer({
			from,
			to: message.to.map((address) => parseMailbox(address)),
			cc: message.cc?.map((address) => parseMailbox(address)),
			bcc: message.bcc?.map((address) => parseMailbox(address)),
			subject: message.subject,
			text: message.body || undefined,
			html: message.htmlBody || undefined,
			attachments: message.attachments?.map((attachment) => ({
				filename: attachment.filename,
				content: Buffer.from(attachment.bytes),
				contentType: attachment.mimeType ?? 'application/octet-stream',
				contentDisposition: 'attachment',
				contentTransferEncoding: 'base64'
			})),
			disableFileAccess: true,
			disableUrlAccess: true,
			newline: 'windows'
		}).compile();
		// Gmail derives Bcc recipients from the raw message, not an SMTP envelope.
		mime.keepBcc = true;
		return await mime.build();
	} catch {
		throw new GmailError('bad_input', 'Email MIME composition failed.');
	}
}
