import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	DATABASE_URL: {
		public: false,
		static: false,
		// Ordinary development and builds do not require a database connection.
		schema: (value: string | undefined) => value,
		description: 'Server-only PostgreSQL connection URL; required when database features are used.'
	},
	LOCAL_ADMIN_ENABLED: {
		public: false,
		static: false,
		schema: (value: string | undefined) => value,
		description: 'Opt in to the seeded admin/admin account in loopback development only; ignored in production.'
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
	GOOGLE_OAUTH_CLIENT_ID: {
		public: false,
		static: false,
		schema: (value: string | undefined) => value,
		description: 'Google OAuth client ID; required when Drive report archiving is enabled.'
	},
	GOOGLE_OAUTH_CLIENT_SECRET: {
		public: false,
		static: false,
		schema: (value: string | undefined) => value,
		description: 'Server-only Google OAuth client secret for Drive report archiving.'
	},
	DRIVE_OAUTH_REFRESH_TOKEN: {
		public: false,
		static: false,
		schema: (value: string | undefined) => value,
		description: 'Server-only Google OAuth refresh token authorized for the drive.file scope.'
	},
	DRIVE_REPORTS_FOLDER_ID: {
		public: false,
		static: false,
		schema: (value: string | undefined) => value,
		description: 'Private destination folder ID for every generated English and Spanish report.'
	},
	ATH_PUBLIC_TOKEN: {
		public: false, static: false, schema: (value: string | undefined) => value,
		description: 'ATH Business merchant public token; kept server-side for bootcamp REST checkout.'
	},
	ATH_PRIVATE_TOKEN: {
		public: false, static: false, schema: (value: string | undefined) => value,
		description: 'ATH Business private token for authoritative transaction verification.'
	},
	BOOTCAMP_PAYMENT_KEY: {
		public: false, static: false, schema: (value: string | undefined) => value,
		description: '64 hexadecimal characters: encryption key for saved ATH payment capabilities. Retain securely.'
	},
	BOOTCAMP_PAYMENTS_ENABLED: {
		public: false, static: false, schema: (value: string | undefined) => value,
		description: 'Set true only after merchant protocol verification and approved live checkout validation.'
	},
	BOOTCAMP_WORKER_SECRET: {
		public: false, static: false, schema: (value: string | undefined) => value,
		description: 'At least 32 characters for the private bootcamp queue-drain endpoint.'
	},
	BETTER_AUTH_TRUSTED_ORIGINS: {
		public: false,
		static: false,
		schema: (value: string | undefined) => value,
		description: 'Optional comma-separated exact auth origins; defaults to BETTER_AUTH_URL.'
	}
});
