import { bootcampServices } from '#lib/server/bootcamp/runtime.ts';
import { limitRequest } from '#lib/server/bootcamp/http.ts';
import { webhookBody, webhookHints } from '#lib/server/bootcamp/webhook.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { db, payment } = bootcampServices();
		if (!payment) return new Response(null, { status: 503 });
		await limitRequest(db, 'webhook', 120);
		const hints = webhookHints(await webhookBody(request));
		if (hints) await payment.notify(hints);
		// Unknown and replayed notifications must not disclose which registrations exist.
		return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
	} catch {
		// Fail delivery rather than acknowledge a wakeup which could not be committed.
		return new Response(null, { status: 503, headers: { 'cache-control': 'no-store' } });
	}
};
