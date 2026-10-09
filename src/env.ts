import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (value: string | undefined) => value;

// Variables default to server-only, runtime-read; schemas keep missing values optional.
export const variables = defineEnvVars({
	DATABASE_URL: {
		// Ordinary development and builds do not require a database connection.
		schema: optional,
		description: 'Server-only PostgreSQL connection URL; required when database features are used.'
	},
	LOCAL_ADMIN_ENABLED: {
		schema: optional,
		description: 'Opt in to the seeded admin/admin account in loopback development only; ignored in production.'
	},
	BETTER_AUTH_SECRET: {
		// Validate auth configuration together, only when authentication is used.
		schema: optional,
		description: 'Server-only Better Auth secret with at least 32 characters; required with BETTER_AUTH_URL.'
	},
	BETTER_AUTH_URL: {
		schema: optional,
		description: 'Explicit auth origin using HTTPS, or HTTP on loopback; required with BETTER_AUTH_SECRET.'
	},
	GOOGLE_OAUTH_CLIENT_ID: {
		schema: optional,
		description: 'Google OAuth client ID shared by Drive report archiving and Gmail sending.'
	},
	GOOGLE_OAUTH_CLIENT_SECRET: {
		schema: optional,
		description: 'Server-only Google OAuth client secret shared by Drive report archiving and Gmail sending.'
	},
	DRIVE_OAUTH_REFRESH_TOKEN: {
		schema: optional,
		description: 'Server-only Google OAuth refresh token authorized for the drive.file scope.'
	},
	DRIVE_REPORTS_FOLDER_ID: {
		schema: optional,
		description: 'Private destination folder ID for every generated English and Spanish report.'
	},
	GOOGLE_OAUTH_REFRESH_TOKEN: {
		schema: optional,
		description: 'Server-only Gmail OAuth refresh token with gmail.send scope; legacy name, separate from DRIVE_OAUTH_REFRESH_TOKEN.'
	},
	GMAIL_SENDER_ADDRESS: {
		schema: optional,
		description: 'Gmail sender mailbox for the authenticated Google user or a verified send-as address; required only when sending.'
	},
	EMAIL_TEST_MODE: {
		schema: optional,
		description: 'Gmail test mode: 1/true/yes/on sends real email only to the sender; 0/false/no/off/blank defaults to normal sending.'
	},
	ATH_PUBLIC_TOKEN: {
		schema: optional,
		description: 'ATH Business merchant public token; kept server-side for bootcamp REST checkout.'
	},
	ATH_PRIVATE_TOKEN: {
		schema: optional,
		description: 'ATH Business private token for authoritative transaction verification.'
	},
	BOOTCAMP_PAYMENT_KEY: {
		schema: optional,
		description: '64 hexadecimal characters: encryption key for saved ATH payment capabilities. Retain securely.'
	},
	BOOTCAMP_PAYMENTS_ENABLED: {
		schema: optional,
		description: 'Set true only after merchant protocol verification and approved live checkout validation.'
	},
	BOOTCAMP_WORKER_SECRET: {
		schema: optional,
		description: 'At least 32 characters for the private bootcamp queue-drain endpoint.'
	},
	BETTER_AUTH_TRUSTED_ORIGINS: {
		schema: optional,
		description: 'Optional comma-separated exact auth origins; defaults to BETTER_AUTH_URL.'
	}
});
