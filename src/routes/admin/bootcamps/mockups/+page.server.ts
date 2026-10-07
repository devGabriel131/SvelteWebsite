import { requireViewer } from '#lib/server/bootcamp/http.ts';
import { readAdminRoster } from '#lib/server/admin-roster.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, setHeaders }) => {
	requireViewer(locals, 'admin', true);
	setHeaders({ 'cache-control': 'private, no-store' });
	const { getDatabase } = await import('#lib/server/db/index.ts');
	const roster = await readAdminRoster(getDatabase());
	return { roster: roster.map(({ id, name, email, classType }) => ({ id, name, email, classType })) };
};
