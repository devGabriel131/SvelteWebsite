import { depositCents, priceCents } from './types';

export function creditedCents(attempts: ReadonlyArray<{ status: string; amountCents: number }>): number {
	return attempts.reduce((total, attempt) => total + (attempt.status === 'completed' ? attempt.amountCents : 0), 0);
}

export function paymentNeedsAttention(attempt: { status: string; lastError: string | null }): boolean {
	return attempt.status === 'uncertain' || attempt.lastError !== null;
}

export function isPaymentAmount(value: unknown): value is number {
	return value === depositCents || value === priceCents;
}

export function normalizePhone(value: unknown): string | null {
	if (typeof value !== 'string' || value.length > 40) return null;
	const match = /^(?:\+?1)?(\d{10})$/.exec(value.replace(/[\s().-]/g, ''));
	return match ? match[1] : null;
}
