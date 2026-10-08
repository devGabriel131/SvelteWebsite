import type { Actions, PageServerLoad } from './$types';
import { completeEnrollmentAction, loadStudentEnrollment } from '#lib/server/student-enrollment.ts';
import { INVITATION_REFERRER_POLICY } from '#lib/student-invitations.ts';

const database = async () => (await import('#lib/server/db/index.ts')).getDatabase();

export const load: PageServerLoad = ({ locals, url, setHeaders, request }) => {
	if (request.method !== 'POST') setHeaders({ 'referrer-policy': INVITATION_REFERRER_POLICY });
	return loadStudentEnrollment(locals, url.searchParams.get('token'), database);
};

export const actions: Actions = {
	complete: ({ locals, request, setHeaders }) => {
		setHeaders({ 'cache-control': 'private, no-store', 'referrer-policy': INVITATION_REFERRER_POLICY });
		return completeEnrollmentAction(locals, request, database);
	}
};
