import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { activateEvent } from '#lib/server/bootcamp/admin.ts';
import { bootcampAction, requireViewer } from '#lib/server/bootcamp/http.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	requireViewer(locals, 'admin', true);
	return {};
};

export const actions: Actions = {
	saveEvent: bootcampAction('admin',
		({ services, viewerId, form }) => activateEvent(services.db, viewerId, form, services.paymentEnabled && services.driveEnabled),
		() => redirect(303, resolve('/admin/bootcamps'))
	)
};
