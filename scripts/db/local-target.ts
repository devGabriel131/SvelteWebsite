import type { DatabaseConnection } from '../../src/lib/server/db/connection';
import { requireDatabaseUrl } from '../../src/lib/server/db/connection';

type LocalDatabaseTarget = { database: string; username: string; port: string };

const developmentTarget: LocalDatabaseTarget = {
	database: 'sveltewebsite',
	username: 'sveltewebsite',
	port: '5433'
};
const testTarget: LocalDatabaseTarget = {
	database: 'sveltewebsite_test',
	username: 'sveltewebsite_test',
	port: '5434'
};

export function assertLocalDatabaseUrl(
	databaseUrl: string,
	purpose: 'seed' | 'test'
): LocalDatabaseTarget {
	if (
		process.env.NODE_ENV === 'production' ||
		process.env.RAILWAY_PROJECT_ID ||
		process.env.RAILWAY_ENVIRONMENT_ID
	) {
		throw new Error(`Refusing to ${purpose} in a production or Railway environment.`);
	}

	const url = new URL(requireDatabaseUrl(databaseUrl));
	const targets = purpose === 'test' ? [testTarget] : [developmentTarget, testTarget];
	const target = targets.find(
		(candidate) =>
			url.pathname === `/${candidate.database}` &&
			url.username === candidate.username &&
			url.port === candidate.port
	);
	// Query parameters can override driver connection options; none are needed locally.
	if (
		!target ||
		!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
		url.search ||
		url.hash
	) {
		throw new Error(`Refusing to ${purpose}: use the dedicated local Compose database URL.`);
	}
	return target;
}

export async function verifyLocalDatabase(
	connection: DatabaseConnection,
	target: LocalDatabaseTarget
): Promise<void> {
	const [identity] = await connection.client<{ database: string; username: string }[]>`
		SELECT current_database() AS database, session_user AS username
	`;
	if (identity.database !== target.database || identity.username !== target.username) {
		throw new Error('Refusing to modify a database whose actual identity differs from its local URL.');
	}
}
