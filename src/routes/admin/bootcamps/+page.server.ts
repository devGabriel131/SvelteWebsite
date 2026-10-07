import { bootcampServices } from '#lib/server/bootcamp/runtime.ts';
import { adminPage, linkStudent, saveEvent, toggleEvent } from '#lib/server/bootcamp/admin.ts';
import { actionResult, limitRequest, requireOrigin, requireViewer } from '#lib/server/bootcamp/http.ts';
import { BootcampError, id, readForm } from '#lib/server/bootcamp/validation.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	requireViewer(locals, 'admin', true);
	const { db, paymentEnabled, driveEnabled } = bootcampServices();
	return adminPage(db, url.searchParams.get('event'), paymentEnabled, driveEnabled);
};
const action = (work: (services: ReturnType<typeof bootcampServices>, adminId: string, form: FormData) => Promise<unknown>): Actions[string] =>
	async ({ locals, request, setHeaders }) => {
		const viewer = requireViewer(locals, 'admin');
		setHeaders({ 'cache-control': 'private, no-store' });
		return actionResult(async () => {
			requireOrigin(request);
			const services = bootcampServices();
			await limitRequest(services.db, `admin:${viewer.id}`, 30);
			return work(services, viewer.id, await readForm(request, 400_000));
		});
	};
export const actions: Actions = {
	saveEvent: action((s, userId, form) => saveEvent(s.db, userId, form)),
	toggle: action((s, _, form) => toggleEvent(s.db, form, s.paymentEnabled && s.driveEnabled)),
	linkStudent: action((s, userId, form) => linkStudent(s.db, userId, form)),
	retryBackups: action((s, _, form) => s.backup.drain({ eventId: id(form.get('eventId')), limit: 3 })),
	reconcile: action((s, _, form) => {
		if (!s.payment) throw new BootcampError('unavailable');
		return s.payment.drain(id(form.get('eventId')), 3);
	})
};
