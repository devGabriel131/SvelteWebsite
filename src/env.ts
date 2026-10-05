import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	DATABASE_URL: {
		public: false,
		static: false,
		// Ordinary development and builds do not require a database connection.
		schema: (value: string | undefined) => value,
		description: 'Server-only PostgreSQL connection URL; required when database features are used.'
	},
	BETTER_AUTH_SECRET: {
		public: false,
		static: false,
		// Validate auth configuration together, only when authentication is used.
		schema: (value: string | undefined) => value,
		description: 'Server-only Better Auth secret with at least 32 characters; required with BETTER_AUTH_URL.'
	},
	BETTER_AUTH_URL: {
		public: false,
		static: false,
		schema: (value: string | undefined) => value,
		description: 'Explicit auth origin using HTTPS, or HTTP on loopback; required with BETTER_AUTH_SECRET.'
	},
	BETTER_AUTH_TRUSTED_ORIGINS: {
		public: false,
		static: false,
		schema: (value: string | undefined) => value,
		description: 'Optional comma-separated exact auth origins; defaults to BETTER_AUTH_URL.'
	}
});
