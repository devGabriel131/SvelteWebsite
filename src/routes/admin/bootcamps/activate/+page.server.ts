import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { activateEvent } from '#lib/server/bootcamp/admin.ts';
import { adminAction } from '#lib/server/bootcamp/admin-route.ts';
import { requireViewer } from '#lib/server/bootcamp/http.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	requireViewer(locals, 'admin', true);
	return {};
};

export const actions: Actions = {
	saveEvent: adminAction(
		({ services, adminId, form }) => activateEvent(services.db, adminId, form),
		() => redirect(303, resolve('/admin/bootcamps'))
	)
};
