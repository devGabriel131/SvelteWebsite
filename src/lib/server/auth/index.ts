import { dev } from '$app/env';
import {
	LOCAL_ADMIN_ENABLED,
	BETTER_AUTH_SECRET,
	BETTER_AUTH_TRUSTED_ORIGINS,
	BETTER_AUTH_URL
} from '$app/env/private';
import { getDatabase } from '../db';
import { readAuthConfig } from './config';
import { createAuth, type Auth } from './core';
import type { AuthAudience } from './credentials';
import { isLocalAdminEnabled } from './local-admin';

export { readAuthConfig, type AuthConfig, type AuthEnvironment } from './config';
export { AUTH_IP_HEADER, createAuth, type Auth } from './core';
export { isValidPin } from './pin';

const instances: Partial<Record<AuthAudience, Auth | null>> = {};

function getAuthEnvironment() {
	return {
		BETTER_AUTH_SECRET,
		BETTER_AUTH_URL,
		BETTER_AUTH_TRUSTED_ORIGINS,
		LOCAL_ADMIN_ENABLED,
		NODE_ENV: dev ? 'development' : 'production',
		RAILWAY_PROJECT_ID: process.env.RAILWAY_PROJECT_ID,
		RAILWAY_ENVIRONMENT_ID: process.env.RAILWAY_ENVIRONMENT_ID
	};
}

export function getLocalAdminEnabled() {
	return isLocalAdminEnabled(getAuthEnvironment());
}

export function getAuth(audience: AuthAudience = 'student'): Auth | null {
	if (instances[audience] !== undefined) return instances[audience];
	const config = readAuthConfig(getAuthEnvironment());
	const auth = config ? createAuth(getDatabase(), config, audience) : null;
	instances[audience] = auth;
	return auth;
}
