import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { bootcampServices } from '#lib/server/bootcamp/runtime.ts';
import { listEvents, toggleEvent } from '#lib/server/bootcamp/admin.ts';
import { adminAction, requireAdminEvent } from '#lib/server/bootcamp/admin-route.ts';
import { requireViewer } from '#lib/server/bootcamp/http.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	requireViewer(locals, 'admin', true);
	const { db, paymentEnabled, driveEnabled } = bootcampServices();
	if (url.searchParams.has('event')) {
		const event = await requireAdminEvent(db, url.searchParams.get('event'), locals.language);
		redirect(303, resolve('/admin/bootcamps/[eventId]/report', { eventId: event.id }));
	}
	return { events: await listEvents(db), paymentEnabled, driveEnabled };
};

export const actions: Actions = {
	toggle: adminAction(({ services: s, form }) => toggleEvent(s.db, form, s.paymentEnabled && s.driveEnabled))
};
