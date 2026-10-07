import { error, type Action } from '@sveltejs/kit';
import { translations, type Language } from '../../i18n/translations';
import type { Database } from '../db/connection';
import { getEvent } from './admin';
import { actionResult, limitRequest, requireOrigin, requireViewer } from './http';
import { bootcampServices } from './runtime';
import { readForm } from './validation';

type AdminActionContext = {
	services: ReturnType<typeof bootcampServices>;
	adminId: string;
	form: FormData;
	params: Record<string, string>;
};

export function adminAction(work: (context: AdminActionContext) => Promise<unknown>, onSuccess?: () => never): Action {
	return async ({ locals, request, params, setHeaders }) => {
		setHeaders({ 'cache-control': 'private, no-store' });
		const viewer = requireViewer(locals, 'admin');
		const result = await actionResult(async () => {
			requireOrigin(request);
			const services = bootcampServices();
			await limitRequest(services.db, `admin:${viewer.id}`, 30);
			return work({ services, adminId: viewer.id, form: await readForm(request, 400_000), params });
		});
		// Redirects must stay outside actionResult, which converts thrown values into failures.
		if ('success' in result) onSuccess?.();
		return result;
	};
}

export async function requireAdminEvent(db: Database, eventId: unknown, language: Language) {
	const event = await getEvent(db, eventId);
	if (!event) error(404, translations[language].bootcamp.errors.invalid);
	return event;
}
