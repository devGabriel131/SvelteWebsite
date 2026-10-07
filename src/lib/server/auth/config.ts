import { isLocalAdminEnabled } from './local-admin';

export type AuthEnvironment = {
	BETTER_AUTH_SECRET?: string;
	BETTER_AUTH_URL?: string;
	BETTER_AUTH_TRUSTED_ORIGINS?: string;
	LOCAL_ADMIN_ENABLED?: string;
	NODE_ENV?: string;
	RAILWAY_PROJECT_ID?: string;
	RAILWAY_ENVIRONMENT_ID?: string;
};

export type AuthConfig = {
	secret: string;
	baseURL: string;
	trustedOrigins: string[];
	localAdmin?: boolean;
};

function readOrigin(value: string, name: string): string {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error(`${name} must be an exact HTTPS origin (HTTP is allowed only on loopback).`);
	}

	const isLoopback =
		url.hostname === 'localhost' ||
		url.hostname === '[::1]' ||
		/^127(?:\.[0-9]{1,3}){3}$/.test(url.hostname);
	if (
		value !== url.origin ||
		value.includes('*') ||
		(url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback))
	) {
		throw new Error(
			`${name} must be an exact HTTPS origin (HTTP is allowed only on loopback), without credentials, paths, query strings, fragments, or wildcards.`
		);
	}
	return url.origin;
}

export function readAuthConfig(env: AuthEnvironment): AuthConfig | null {
	const {
		BETTER_AUTH_SECRET: secret,
		BETTER_AUTH_URL: baseURL,
		BETTER_AUTH_TRUSTED_ORIGINS: trustedOrigins
	} = env;

	if (secret === undefined && baseURL === undefined && trustedOrigins === undefined) return null;
	if (secret === undefined || baseURL === undefined) {
		throw new Error('Set both BETTER_AUTH_SECRET and BETTER_AUTH_URL before using authentication.');
	}
	if (secret.length < 32 || !secret.trim()) {
		throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters and cannot be blank.');
	}

	const origin = readOrigin(baseURL, 'BETTER_AUTH_URL');
	const origins = trustedOrigins === undefined
		? [origin]
		: trustedOrigins.split(',').map((value) => readOrigin(value.trim(), 'BETTER_AUTH_TRUSTED_ORIGINS'));

	return {
		secret, baseURL: origin, trustedOrigins: [...new Set(origins)],
		...(isLocalAdminEnabled(env) ? { localAdmin: true } : {})
	};
}
