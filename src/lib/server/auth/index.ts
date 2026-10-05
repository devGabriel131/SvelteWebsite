import {
	BETTER_AUTH_SECRET,
	BETTER_AUTH_TRUSTED_ORIGINS,
	BETTER_AUTH_URL
} from '$app/env/private';
import { getDatabase } from '../db';
import { readAuthConfig } from './config';
import { createAuth, type Auth } from './core';
import type { AuthAudience } from './credentials';

export { readAuthConfig, type AuthConfig, type AuthEnvironment } from './config';
export { AUTH_IP_HEADER, createAuth, type Auth } from './core';
export { isValidPin } from './pin';

const instances: Partial<Record<AuthAudience, Auth | null>> = {};

export function getAuth(audience: AuthAudience = 'student'): Auth | null {
	if (instances[audience] !== undefined) return instances[audience];
	const config = readAuthConfig({
		BETTER_AUTH_SECRET,
		BETTER_AUTH_URL,
		BETTER_AUTH_TRUSTED_ORIGINS
	});
	const auth = config ? createAuth(getDatabase(), config, audience) : null;
	instances[audience] = auth;
	return auth;
}
