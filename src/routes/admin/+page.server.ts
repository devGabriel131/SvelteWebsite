import { loadAdminPage } from '#lib/server/admin-page.ts';
import type { Actions, PageServerLoad } from './$types';
import { editStudentAction } from '#lib/server/admin-student.ts';
import { studentImportAction, resendInvitationAction } from '#lib/server/student-import.ts';
import { studentImportDependencies } from '#lib/server/student-invitation-runtime.ts';
import { getDatabase } from '#lib/server/db/index.ts';

export const actions: Actions = {
	editStudent: ({ locals, request, setHeaders }) => {
		setHeaders({ 'cache-control': 'private, no-store' });
		return editStudentAction(locals, request, getDatabase);
	},
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

export const load: PageServerLoad = ({ locals, url }) => loadAdminPage(locals, url, getDatabase);
