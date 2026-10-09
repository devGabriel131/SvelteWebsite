import { error, fail, redirect, type Action } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { getViewer } from '../auth/access';
import { translations, type Language } from '../../i18n/translations';
import { BootcampError, readForm, type BootcampErrorCode } from './validation';
import { PaymentError } from './payments';
import { rateLimit } from '../db/auth-schema';
import type { Database } from '../db/connection';
import { sql } from 'drizzle-orm';
import { getEvent } from './admin';
import { bootcampServices, type BootcampServices } from './runtime';

type ActionContext = {
	services: BootcampServices;
	viewerId: string;
	form: FormData;
	params: Record<string, string>;
};
const actionLimits = {
	admin: { requests: 30, bytes: 400_000 },
	student: { requests: 20, bytes: 2_300_000 }
};

export function requireViewer(locals: App.Locals, role?: 'admin' | 'student', page = false) {
	const viewer = getViewer(locals);
	if (!viewer) {
		if (page) redirect(303, resolve(role === 'admin' ? '/admin' : '/login'));
		error(401, translations[locals.language].bootcamp.errors.unavailable);
	}
	if (role && viewer.role !== role) error(403, translations[locals.language].bootcamp.errors.ineligible);
	return viewer;
}
export async function requireAdminEvent(db: Database, eventId: unknown, language: Language) {
	const event = await getEvent(db, eventId);
	if (!event) error(404, translations[language].bootcamp.errors.invalid);
	return event;
}
export function requireOrigin(request: Request) {
	if (request.headers.get('origin') !== new URL(request.url).origin) throw new BootcampError('invalid');
}
export function errorCode(cause: unknown): BootcampErrorCode {
	if (cause instanceof BootcampError) return cause.code;
	if (cause instanceof PaymentError) {
		if (cause.code === 'ineligible') return 'ineligible';
		if (cause.code === 'invalid_input') return 'invalid';
		if (cause.code === 'unavailable') return 'closed';
		return 'payment';
	}
	return 'storage';
}
export async function actionResult(run: () => Promise<unknown>) {
	try { await run(); return { success: true }; }
	catch (cause) { return fail(400, { error: errorCode(cause) }); }
}
export function bootcampAction(
	role: 'admin' | 'student',
	work: (context: ActionContext) => Promise<unknown>,
	onSuccess?: () => never
): Action {
	return async ({ locals, request, params, setHeaders }) => {
		setHeaders({ 'cache-control': 'private, no-store' });
		const viewer = requireViewer(locals, role);
		const result = await actionResult(async () => {
			requireOrigin(request);
			const services = bootcampServices();
			const limits = actionLimits[role];
			await limitRequest(services.db, `${role}:${viewer.id}`, limits.requests);
			return work({ services, viewerId: viewer.id, form: await readForm(request, limits.bytes), params });
		});
		// Redirects must stay outside actionResult, which converts thrown values into failures.
		if ('success' in result) onSuccess?.();
		return result;
	};
}

export async function limitRequest(db: Database, bucket: string, maximum: number) {
	const now = Date.now();
	const [row] = await db.insert(rateLimit).values({ id: crypto.randomUUID(), key: `bootcamp:${bucket}`, count: 1, lastRequest: now }).onConflictDoUpdate({
		target: rateLimit.key,
		set: {
			count: sql`CASE WHEN ${rateLimit.lastRequest} <= ${now - 60_000} THEN 1 ELSE ${rateLimit.count} + 1 END`,
			lastRequest: sql`CASE WHEN ${rateLimit.lastRequest} <= ${now - 60_000} THEN ${now} ELSE ${rateLimit.lastRequest} END`
		}
	}).returning({ count: rateLimit.count });
	if (row.count > maximum) throw new BootcampError('unavailable');
}
export function pdfResponse(bytes: Buffer, filename: string) {
	return new Response(new Uint8Array(bytes), { headers: {
		'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${filename}"`,
		'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox"
	} });
}
