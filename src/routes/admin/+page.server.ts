import { getAdminPageState } from '#lib/server/auth/access.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => getAdminPageState(locals);
