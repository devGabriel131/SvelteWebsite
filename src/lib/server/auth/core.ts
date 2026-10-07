import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { BASE_ERROR_CODES, betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import * as authSchema from '../db/auth-schema';
import type { Database } from '../db/connection';
import type { AuthConfig } from './config';
import { isValidCredential, type AuthAudience } from './credentials';
import { LOCAL_ADMIN_EMAIL } from './local-admin';

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

export function createAuth(db: Database, config: AuthConfig, audience: AuthAudience = 'student') {
	return betterAuth({
		secret: config.secret,
		baseURL: config.baseURL,
		// Both entry points share the same identity/session store and signed cookie.
		basePath: audience === 'admin' ? '/admin/auth' : '/api/auth',
		trustedOrigins: config.trustedOrigins,
		database: drizzleAdapter(db, { provider: 'pg', schema: authSchema }),
		emailAndPassword: {
			enabled: true,
			disableSignUp: true,
			minPasswordLength: audience === 'admin' ? 8 : 4,
			maxPasswordLength: audience === 'admin' ? 128 : 4
		},
		user: {
			additionalFields: {
				role: { type: ['student', 'admin'], required: true, defaultValue: 'student', input: false }
			}
		},
		disabledPaths,
		hooks: {
			before: createAuthMiddleware(async (ctx) => {
				// disabledPaths only matches concrete HTTP paths, not parameterized routes
				// or direct API calls. Better Call gives pathless setPassword the path '/'.
				if (!ctx.path || ctx.path === '/' || disabledPaths.includes(ctx.path)) {
					throw new APIError('NOT_FOUND');
				}
				if (ctx.path === '/sign-in/email') {
					const localAdmin = audience === 'admin' && config.localAdmin === true;
					const email = typeof ctx.body?.email === 'string' ? ctx.body.email.toLowerCase() : null;
					if (localAdmin && email === 'admin') {
						ctx.body.email = LOCAL_ADMIN_EMAIL;
					}
					// This exception only permits verification of the seeded local account's hash.
					const localCredential = localAdmin && (email === 'admin' || email === LOCAL_ADMIN_EMAIL) &&
						ctx.body?.password === 'admin';
					if ((!localCredential && !isValidCredential(audience, ctx.body?.password)) || typeof ctx.body?.email !== 'string') {
						throw APIError.from('UNAUTHORIZED', BASE_ERROR_CODES.INVALID_EMAIL_OR_PASSWORD);
					}
					const identity = await ctx.context.adapter.findOne<{ role: AuthAudience }>({
						model: 'user',
						where: [{ field: 'email', value: ctx.body.email.toLowerCase() }]
					});
					// The server-selected endpoint is an entry point, never an authority to assign a role.
					if (!identity || identity.role !== audience) {
						// Match Better Auth's work for an unknown credential without inventing password crypto.
						await ctx.context.password.hash(ctx.body.password);
						throw APIError.from('UNAUTHORIZED', BASE_ERROR_CODES.INVALID_EMAIL_OR_PASSWORD);
					}
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
