import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	DATABASE_URL: {
		public: false,
		static: false,
		// Ordinary development and builds do not require a database connection.
		schema: (value: string | undefined) => value,
		description: 'Server-only PostgreSQL connection URL; required when database features are used.'
	}
});
