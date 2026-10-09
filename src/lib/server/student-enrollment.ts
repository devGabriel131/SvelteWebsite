import { fail } from '@sveltejs/kit';
import type { EnrollmentData } from '../student-invitations';
import { getViewer, requireActionViewer, type AuthLocals } from './auth/access';
import type { Database } from './db/connection';
import { completeStudentEnrollment, isInvitationToken, parseEnrollmentProfile, readStudentEnrollment, StudentInvitationError } from './student-invitations';

type DatabaseProvider = () => Database | Promise<Database>;

export async function loadStudentEnrollment(locals: AuthLocals, token: string | null, database: DatabaseProvider): Promise<EnrollmentData> {
	if (!isInvitationToken(token)) return { state: 'invalid', student: null };
	const viewer = getViewer(locals);
	if (!viewer) return { state: 'signIn', student: null };
	if (viewer.role !== 'student') return { state: 'invalid', student: null };
	return readStudentEnrollment(await database(), viewer.id, token);
}

export async function completeEnrollmentAction(locals: AuthLocals, request: Request, database: DatabaseProvider) {
	const viewer = requireActionViewer(locals, request, 'student');
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
