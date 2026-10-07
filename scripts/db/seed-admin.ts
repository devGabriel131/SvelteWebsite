import { randomUUID } from 'node:crypto';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { and, eq } from 'drizzle-orm';
import { LOCAL_ADMIN_EMAIL } from '../../src/lib/server/auth/local-admin';
import { account, user } from '../../src/lib/server/db/auth-schema';
import { createDatabase, requireDatabaseUrl } from '../../src/lib/server/db/connection';
import { assertLocalDatabaseUrl, verifyLocalDatabase } from './local-target';

export async function seedLocalAdmin(databaseUrl: string): Promise<{ created: boolean }> {
	const target = assertLocalDatabaseUrl(databaseUrl, 'seed');
	const connection = createDatabase(databaseUrl);
	try {
		await verifyLocalDatabase(connection, target);
		return await connection.db.transaction(async (tx) => {
			const [created] = await tx.insert(user).values({
				id: randomUUID(),
				name: 'Local administrator',
				email: LOCAL_ADMIN_EMAIL,
				role: 'admin',
				emailVerified: true
			}).onConflictDoNothing({ target: user.email }).returning({ id: user.id });

			if (created) {
				await tx.insert(account).values({
					id: randomUUID(),
					accountId: created.id,
					providerId: 'credential',
					userId: created.id,
					password: await hashPassword('admin'),
					updatedAt: new Date()
				});
				return { created: true };
			}

			const [existing] = await tx.select().from(user).where(eq(user.email, LOCAL_ADMIN_EMAIL));
			const credentials = existing
				? await tx.select().from(account).where(and(
					eq(account.userId, existing.id), eq(account.providerId, 'credential')
				))
				: [];
			const credential = credentials[0];
			if (
				existing?.role !== 'admin' ||
				credentials.length !== 1 ||
				credential.accountId !== existing.id ||
				!credential.password ||
				!await verifyPassword({ hash: credential.password, password: 'admin' }).catch(() => false)
			) {
				throw new Error(
					`Refusing to overwrite or promote the existing account ${LOCAL_ADMIN_EMAIL}: ` +
					'expected role "admin" and one matching credential for the local-only password "admin".'
				);
			}
			return { created: false };
		});
	} finally {
		await connection.client.end();
	}
}

if (import.meta.main) {
	await seedLocalAdmin(requireDatabaseUrl(process.env.DATABASE_URL));
	console.info(`Local-development-only admin account ready: ${LOCAL_ADMIN_EMAIL} (password: admin).`);
}
