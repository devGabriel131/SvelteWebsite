import { error, fail } from '@sveltejs/kit';
import type { EnrollmentData } from '../student-invitations';
import { getViewer } from './auth/access';
import type { Database } from './db/connection';
import { completeStudentEnrollment, isInvitationToken, parseEnrollmentProfile, readStudentEnrollment, StudentInvitationError } from './student-invitations';

type AuthLocals = Pick<App.Locals, 'user' | 'session'>;
type DatabaseProvider = () => Database | Promise<Database>;

export async function loadStudentEnrollment(locals: AuthLocals, token: string | null, database: DatabaseProvider): Promise<EnrollmentData> {
	const returnTo = '/enroll';
	if (!isInvitationToken(token)) return { state: 'invalid', student: null, returnTo };
	const viewer = getViewer(locals);
	if (!viewer) return { state: 'signIn', student: null, returnTo };
	if (viewer.role !== 'student') return { state: 'invalid', student: null, returnTo };
	return { ...await readStudentEnrollment(await database(), viewer.id, token), returnTo };
}

export async function completeEnrollmentAction(locals: AuthLocals, request: Request, database: DatabaseProvider) {
	const viewer = getViewer(locals);
	if (!viewer) error(401);
	if (viewer.role !== 'student' || request.headers.get('origin') !== new URL(request.url).origin) error(403);
	try {
		const form = await request.formData();
		const token = form.get('token');
		if (!isInvitationToken(token)) throw new StudentInvitationError('invitation');
		const profile = parseEnrollmentProfile(form);
		await completeStudentEnrollment(await database(), viewer.id, token, profile);
		return { enrollment: { success: true as const } };
	} catch (cause) {
		const code = cause instanceof StudentInvitationError ? cause.code === 'invalid' ? 'invalid' : 'invitation' : 'storage';
		return fail(code === 'storage' ? 500 : 400, { enrollment: { success: false as const, error: code } });
	}
}
