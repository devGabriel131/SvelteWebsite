import { loadAdminRoster } from '#lib/server/admin-roster.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => loadAdminRoster(locals, async () =>
	(await import('#lib/server/db/index.ts')).getDatabase()
);
