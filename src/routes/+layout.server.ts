import { getViewer } from '#lib/server/auth/access.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, request, setHeaders }) => {
	// Form actions already own the POST response's no-store header.
	if (request.method !== 'POST') setHeaders({ 'cache-control': 'private, no-store' });
	return { language: locals.language, viewer: getViewer(locals) };
};
