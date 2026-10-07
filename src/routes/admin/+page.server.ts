import { loadAdminRoster } from '#lib/server/admin-roster.ts';
import type { Actions, PageServerLoad } from './$types';
import { editStudentAction } from '#lib/server/admin-student.ts';

export const actions: Actions = {
	editStudent: ({ locals, request }) => editStudentAction(locals, request, async () =>
		(await import('#lib/server/db/index.ts')).getDatabase())
};

export const load: PageServerLoad = ({ locals }) => loadAdminRoster(locals, async () =>
	(await import('#lib/server/db/index.ts')).getDatabase()
);
