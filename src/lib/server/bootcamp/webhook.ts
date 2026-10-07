import { uuidPattern } from './validation';

// The provider does not document signed notifications. These are lookup hints, never receipts.
export function webhookHints(value: unknown): { attemptId?: string; reference?: string } | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const data = value as Record<string, unknown>;
	if (typeof data.transactionType !== 'string' || data.transactionType.toUpperCase() !== 'ECOMMERCE') return null;
	const attemptId = typeof data.metadata1 === 'string' && uuidPattern.test(data.metadata1) ? data.metadata1 : undefined;
	const reference = typeof data.ecommerceId === 'string' && uuidPattern.test(data.ecommerceId) ? data.ecommerceId : undefined;
	return attemptId || reference ? { attemptId, reference } : null;
}

export async function webhookBody(request: Request): Promise<unknown> {
	if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') ?? '')) return null;
	const reader = request.body?.getReader();
	if (!reader) return null;
	let size = 0;
	const chunks: Uint8Array[] = [];
	try {
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > 32_768) { await reader.cancel(); return null; }
			chunks.push(value);
		}
		return JSON.parse(Buffer.concat(chunks).toString('utf8'));
	} catch { return null; }
	finally { reader.releaseLock(); }
}
