import type { StudentImportDependencies } from './student-import';
import { StudentInvitationError } from './student-invitations';

export const studentImportDependencies: StudentImportDependencies = {
	async database() { return (await import('./db')).getDatabase(); },
	async authentication() {
		const auth = (await import('./auth')).getAuth('admin');
		if (!auth || typeof auth.options.secret !== 'string' || typeof auth.options.baseURL !== 'string') throw new StudentInvitationError('unavailable');
		const context = await auth.$context;
		return { secret: auth.options.secret, baseURL: auth.options.baseURL, hashPin: context.password.hash };
	},
	async delivery() {
		const { baseURL } = await this.authentication();
		try {
			const gmail = await import('./gmail');
			const config = gmail.getGmailConfig();
			const client = gmail.getGmailClient();
			return { baseURL, testMode: config.testMode, send: (email, signal) => client.send(email, signal) };
		} catch { throw new StudentInvitationError('unavailable'); }
	}
};
