import { loadAdminRoster } from '#lib/server/admin-roster.ts';
import type { Actions, PageServerLoad } from './$types';
import { editStudentAction } from '#lib/server/admin-student.ts';
import { studentImportAction, resendInvitationAction } from '#lib/server/student-import.ts';
import { studentImportDependencies } from '#lib/server/student-invitation-runtime.ts';
import { parseInvitationPage, readAdminStudentInvitations } from '#lib/server/student-invitations.ts';
import { INVITATIONS_PAGE_SIZE } from '#lib/student-invitations.ts';

export const actions: Actions = {
	editStudent: ({ locals, request }) => editStudentAction(locals, request, async () =>
		(await import('#lib/server/db/index.ts')).getDatabase()),
	previewStudents: ({ locals, request, setHeaders }) => {
		setHeaders({ 'cache-control': 'private, no-store' });
		return studentImportAction(locals, request, 'preview', studentImportDependencies);
	},
	importStudents: ({ locals, request, setHeaders }) => {
		setHeaders({ 'cache-control': 'private, no-store' });
		return studentImportAction(locals, request, 'import', studentImportDependencies);
	},
	resendInvitation: ({ locals, request, setHeaders }) => {
		setHeaders({ 'cache-control': 'private, no-store' });
		return resendInvitationAction(locals, request, studentImportDependencies);
	}
};

export const load: PageServerLoad = async ({ locals, url }) => {
	const roster = await loadAdminRoster(locals, studentImportDependencies.database);
	const invitationPage = parseInvitationPage(url.searchParams.get('invitationPage'));
	const invitations = roster.isAdmin ? await readAdminStudentInvitations(await studentImportDependencies.database(), invitationPage) : [];
	return { ...roster, invitations: invitations.slice(0, INVITATIONS_PAGE_SIZE), invitationPage, hasMoreInvitations: invitations.length > INVITATIONS_PAGE_SIZE };
};
