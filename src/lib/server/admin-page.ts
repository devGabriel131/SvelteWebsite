import { INVITATIONS_PAGE_SIZE } from '../student-invitations';
import { readAdminRoster } from './admin-roster';
import { getAdminPageState, type AuthLocals } from './auth/access';
import type { Database } from './db/connection';
import { parseInvitationPage, readAdminStudentInvitations } from './student-invitations';

export async function loadAdminPage(
	locals: AuthLocals & Pick<App.Locals, 'localAdmin'>,
	url: URL,
	database: () => Database | Promise<Database>
) {
	const state = getAdminPageState(locals);
	const localAdmin = locals.localAdmin === true;
	if (!state.isAdmin) return {
		...state, localAdmin, students: [], invitations: [], invitationPage: 1, hasMoreInvitations: false
	};
	const invitationPage = parseInvitationPage(url.searchParams.get('invitationPage'));
	const db = await database();
	const [students, invitations] = await Promise.all([
		readAdminRoster(db), readAdminStudentInvitations(db, invitationPage)
	]);
	return {
		...state, localAdmin, students, invitations: invitations.slice(0, INVITATIONS_PAGE_SIZE),
		invitationPage, hasMoreInvitations: invitations.length > INVITATIONS_PAGE_SIZE
	};
}
