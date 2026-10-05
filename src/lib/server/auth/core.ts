import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { BASE_ERROR_CODES, betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import * as authSchema from '../db/auth-schema';
import type { Database } from '../db/connection';
import type { AuthConfig } from './config';
import { isValidPin } from './pin';

// The server hook must overwrite this header with event.getClientAddress().
export const AUTH_IP_HEADER = 'x-auth-client-ip';

const disabledPaths = [
	'/sign-up/email',
	'/sign-in/social',
	'/callback/:id',
	'/change-password',
	'/set-password',
	'/reset-password',
	'/reset-password/:token',
	'/request-password-reset',
	'/verify-password',
	'/change-email',
	'/update-user',
	'/delete-user',
	'/delete-user/callback',
	'/send-verification-email',
	'/verify-email',
	'/link-social',
	'/unlink-account',
	'/list-accounts',
	'/account-info',
	'/get-access-token',
	'/refresh-token'
];

export function createAuth(db: Database, config: AuthConfig) {
	return betterAuth({
		secret: config.secret,
		baseURL: config.baseURL,
		basePath: '/api/auth',
		trustedOrigins: config.trustedOrigins,
		database: drizzleAdapter(db, { provider: 'pg', schema: authSchema }),
		emailAndPassword: {
			enabled: true,
			disableSignUp: true,
			minPasswordLength: 4,
			maxPasswordLength: 4
		},
		disabledPaths,
		hooks: {
			before: createAuthMiddleware(async (ctx) => {
				// disabledPaths only matches concrete HTTP paths, not parameterized routes
				// or direct API calls. Better Call gives pathless setPassword the path '/'.
				if (!ctx.path || ctx.path === '/' || disabledPaths.includes(ctx.path)) {
					throw new APIError('NOT_FOUND');
				}
				if (ctx.path === '/sign-in/email' && !isValidPin(ctx.body?.password)) {
					throw APIError.from('UNAUTHORIZED', BASE_ERROR_CODES.INVALID_EMAIL_OR_PASSWORD);
				}
			})
		},
		rateLimit: {
			enabled: true,
			storage: 'database',
			window: 60,
			max: 100,
			customRules: {
				'/sign-in/email': { window: 60, max: 5 }
			}
		},
		session: { cookieCache: { enabled: false } },
		advanced: {
			// Keep the same security policy in tests as in production.
			disableOriginCheck: false,
			disableCSRFCheck: false,
			useSecureCookies: config.baseURL.startsWith('https://'),
			ipAddress: { ipAddressHeaders: [AUTH_IP_HEADER] }
		}
	});
}

export type Auth = ReturnType<typeof createAuth>;
