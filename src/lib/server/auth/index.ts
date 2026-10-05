import {
	BETTER_AUTH_SECRET,
	BETTER_AUTH_TRUSTED_ORIGINS,
	BETTER_AUTH_URL
} from '$app/env/private';
import { getDatabase } from '../db';
import { readAuthConfig } from './config';
import { createAuth, type Auth } from './core';

export { readAuthConfig, type AuthConfig, type AuthEnvironment } from './config';
export { AUTH_IP_HEADER, createAuth, type Auth } from './core';
export { isValidPin } from './pin';

let auth: Auth | null | undefined;

export function getAuth(): Auth | null {
	if (auth !== undefined) return auth;
	const config = readAuthConfig({
		BETTER_AUTH_SECRET,
		BETTER_AUTH_URL,
		BETTER_AUTH_TRUSTED_ORIGINS
	});
	auth = config ? createAuth(getDatabase(), config) : null;
	return auth;
}
