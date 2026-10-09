import { DATABASE_URL } from '$app/env/private';
import { createDatabase, type DatabaseConnection } from './connection';

let connection: DatabaseConnection | undefined;

export function getDatabase() {
	connection ??= createDatabase(DATABASE_URL);
	return connection.db;
}
