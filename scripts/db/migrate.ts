import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDatabase, requireDatabaseUrl, type Database } from '../../src/lib/server/db/connection';

export async function migrateDatabase(db: Database): Promise<void> {
	await migrate(db, {
		migrationsFolder: fileURLToPath(new URL('../../drizzle/', import.meta.url))
	});
}

if (import.meta.main) {
	const connection = createDatabase(requireDatabaseUrl(process.env.DATABASE_URL));
	try {
		await migrateDatabase(connection.db);
		console.info('Database migrations applied.');
	} finally {
		await connection.client.end();
	}
}
