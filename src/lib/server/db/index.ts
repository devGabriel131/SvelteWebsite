import { DATABASE_URL } from '$app/env/private';
import { createDatabase, requireDatabaseUrl, type DatabaseConnection } from './connection';

let connection: DatabaseConnection | undefined;

export function getDatabase() {
	connection ??= createDatabase(requireDatabaseUrl(DATABASE_URL));
	return connection.db;
}
