import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	dialect: 'postgresql',
	schema: [
		'./src/lib/server/db/schema.ts',
		'./src/lib/server/db/game-schema.ts',
		'./src/lib/server/db/auth-schema.ts',
		'./src/lib/server/db/bootcamp-schema.ts',
		'./src/lib/server/db/views.ts'
	],
	out: './drizzle',
	strict: true
});
