import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { bootcampServices } from '#lib/server/bootcamp/runtime.ts';
import { saveEvent } from '#lib/server/bootcamp/admin.ts';
import { adminAction, requireAdminEvent } from '#lib/server/bootcamp/admin-route.ts';
import { requireViewer } from '#lib/server/bootcamp/http.ts';
import { id } from '#lib/server/bootcamp/validation.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	requireViewer(locals, 'admin', true);
	const { db } = bootcampServices();
	return { event: await requireAdminEvent(db, params.eventId, locals.language) };
};

export const actions: Actions = {
	saveEvent: adminAction(
		({ services, adminId, form, params }) => saveEvent(services.db, adminId, form, id(params.eventId)),
		() => redirect(303, resolve('/admin/bootcamps'))
	)
};
