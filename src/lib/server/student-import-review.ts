import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const IMPORT_REVIEW_TTL_MS = 15 * 60 * 1000;

export type StudentImportOptions = { classType: 'basic' | 'regular'; emailLanguage: 'en' | 'es' };
type ReviewInput = StudentImportOptions & { adminId: string; file: Uint8Array };

function fingerprint(input: ReviewInput) {
	const fileHash = createHash('sha256').update(input.file).digest('hex');
	return JSON.stringify([input.adminId, input.classType, input.emailLanguage, fileHash]);
}

function signature(secret: string, input: ReviewInput, expires: number) {
	return createHmac('sha256', secret).update('student-import-review:v1:')
		.update(String(expires)).update(':').update(fingerprint(input)).digest();
}

export function createStudentImportReview(secret: string, input: ReviewInput, now = Date.now()): string {
	const expires = now + IMPORT_REVIEW_TTL_MS;
	return `${expires}.${signature(secret, input, expires).toString('hex')}`;
}

export function verifyStudentImportReview(secret: string, receipt: unknown, input: ReviewInput, now = Date.now()): boolean {
	if (typeof receipt !== 'string' || !/^\d{13}\.[0-9a-f]{64}$/.test(receipt)) return false;
	const [expiry, hash] = receipt.split('.');
	const expires = Number(expiry);
	if (expires <= now || expires > now + IMPORT_REVIEW_TTL_MS) return false;
	return timingSafeEqual(Buffer.from(hash, 'hex'), signature(secret, input, expires));
}
