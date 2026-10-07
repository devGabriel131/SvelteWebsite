import { timingSafeEqual } from 'node:crypto';
import { BOOTCAMP_WORKER_SECRET } from '$app/env/private';
import { bootcampServices } from '#lib/server/bootcamp/runtime.ts';
import type { RequestHandler } from './$types';

// Invoke from an external scheduler. Work is durable; requests may safely overlap or restart.
export const POST: RequestHandler = async ({ request }) => {
	const expected = BOOTCAMP_WORKER_SECRET;
	const provided = request.headers.get('authorization');
	if (!expected || expected.length < 32 || !provided ||
		Buffer.byteLength(provided) !== Buffer.byteLength(`Bearer ${expected}`) ||
		!timingSafeEqual(Buffer.from(provided), Buffer.from(`Bearer ${expected}`))) {
		return new Response(null, { status: 401, headers: { 'cache-control': 'no-store' } });
	}
	try {
		const { backup, payment } = bootcampServices();
		const [documents, payments] = await Promise.all([backup.drain({ limit: 3 }), payment?.drain(undefined, 3) ?? []]);
		return Response.json({ documents: documents.length, payments: payments.length }, { headers: { 'cache-control': 'no-store' } });
	} catch { return new Response(null, { status: 503, headers: { 'cache-control': 'no-store' } }); }
};
