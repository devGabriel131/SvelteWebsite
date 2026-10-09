import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { getDatabase } from '#lib/server/db/index.ts';
import { updateEvent } from '#lib/server/bootcamp/admin.ts';
import { bootcampAction, requireAdminEvent, requireViewer } from '#lib/server/bootcamp/http.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	requireViewer(locals, 'admin', true);
	return { event: await requireAdminEvent(getDatabase(), params.eventId, locals.language) };
};

export const actions: Actions = {
	saveEvent: bootcampAction('admin',
		({ services, form, params }) => updateEvent(services.db, params.eventId, form),
		() => redirect(303, resolve('/admin/bootcamps'))
	)
};
