import { bootcampServices } from '#lib/server/bootcamp/runtime.ts';
import { eventReport, getEvent } from '#lib/server/bootcamp/admin.ts';
import { adminAction, requireAdminEvent } from '#lib/server/bootcamp/admin-route.ts';
import { requireViewer } from '#lib/server/bootcamp/http.ts';
import { BootcampError } from '#lib/server/bootcamp/validation.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	requireViewer(locals, 'admin', true);
	const { db, paymentEnabled, driveEnabled } = bootcampServices();
	const event = await requireAdminEvent(db, params.eventId, locals.language);
	return { event, report: await eventReport(db, event.id), paymentEnabled, driveEnabled };
};

const reportAction = (work: (services: ReturnType<typeof bootcampServices>, eventId: string) => Promise<unknown>) =>
	adminAction(async ({ services, params }) => {
		const event = await getEvent(services.db, params.eventId);
		if (!event) throw new BootcampError('invalid');
		return work(services, event.id);
	});

export const actions: Actions = {
	retryBackups: reportAction((s, eventId) => s.backup.drain({ eventId, limit: 3 })),
	reconcile: reportAction((s, eventId) => {
		if (!s.payment) throw new BootcampError('unavailable');
		return s.payment.drain(eventId, 3);
	})
};
