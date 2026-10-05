import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as studentSchema from './schema';
import * as gameSchema from './game-schema';
import * as views from './views';

const schema = { ...studentSchema, ...gameSchema, ...views };

export function requireDatabaseUrl(value: string | undefined): string {
	if (!value?.trim()) throw new Error('Set the server-only DATABASE_URL before using the database.');
	try {
		const url = new URL(value);
		if (
			!['postgres:', 'postgresql:'].includes(url.protocol) ||
			!url.hostname ||
			url.pathname.length <= 1
		) {
			throw new Error();
		}
	} catch {
		throw new Error('DATABASE_URL must be a PostgreSQL connection URL with a database name.');
	}
	return value;
}

export function createDatabase(databaseUrl: string) {
	const client = postgres(requireDatabaseUrl(databaseUrl), {
		max: 5,
		connect_timeout: 10,
		idle_timeout: 20
	});
	return { db: drizzle(client, { schema }), client };
}

export type DatabaseConnection = ReturnType<typeof createDatabase>;
export type Database = DatabaseConnection['db'];
