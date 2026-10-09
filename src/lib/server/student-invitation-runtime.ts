import { getAuth } from './auth';
import { getDatabase } from './db';
import { getGmailClient } from './gmail';
import type { StudentImportDependencies } from './student-import';
import { StudentInvitationError } from './student-invitations';

async function adminAuth() {
	const auth = getAuth('admin');
	if (!auth || typeof auth.options.secret !== 'string' || typeof auth.options.baseURL !== 'string') throw new StudentInvitationError('unavailable');
	const context = await auth.$context;
	return { secret: auth.options.secret, baseURL: auth.options.baseURL, hashPin: context.password.hash };
}

export const studentImportDependencies: StudentImportDependencies = {
	database: getDatabase,
	async authentication() {
		const { secret, hashPin } = await adminAuth();
		return { secret, hashPin };
	},
	async delivery() {
		const { baseURL } = await adminAuth();
		try {
			const client = getGmailClient();
			return { baseURL, testMode: client.testMode, send: client.send };
		} catch { throw new StudentInvitationError('unavailable'); }
	}
};
