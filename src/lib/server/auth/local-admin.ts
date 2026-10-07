export const LOCAL_ADMIN_EMAIL = 'admin@local.example.test';

type LocalAdminEnvironment = {
	LOCAL_ADMIN_ENABLED?: string;
	BETTER_AUTH_URL?: string;
	NODE_ENV?: string;
	RAILWAY_PROJECT_ID?: string;
	RAILWAY_ENVIRONMENT_ID?: string;
};

export function isLocalAdminEnabled(env: LocalAdminEnvironment): boolean {
	if (
		env.LOCAL_ADMIN_ENABLED !== 'true' ||
		env.NODE_ENV !== 'development' ||
		env.RAILWAY_PROJECT_ID ||
		env.RAILWAY_ENVIRONMENT_ID
	) return false;

	try {
		const url = new URL(env.BETTER_AUTH_URL ?? '');
		return url.origin === env.BETTER_AUTH_URL &&
			['http:', 'https:'].includes(url.protocol) &&
			['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
	} catch {
		return false;
	}
}
