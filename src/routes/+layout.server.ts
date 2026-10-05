import { getViewer } from '#lib/server/auth/access.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, setHeaders }) => {
	setHeaders({ 'cache-control': 'private, no-store' });
	return { language: locals.language, viewer: getViewer(locals) };
};
