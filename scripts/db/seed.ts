import { createDatabase, requireDatabaseUrl } from '../../src/lib/server/db/connection';
import { students, type NewStudent } from '../../src/lib/server/db/schema';
import { assertLocalDatabaseUrl, verifyLocalDatabase } from './local-target';

export const fictitiousStudents: NewStudent[] = [
	{
		id: '00000000-0000-4000-8000-000000000001',
		firstName: 'Alicia',
		lastName: 'Ejemplo',
		email: 'alicia.ejemplo@example.test',
		classType: 'basic'
	},
	{
		id: '00000000-0000-4000-8000-000000000002',
		firstName: 'Mateo',
		lastName: 'Prueba',
		email: 'mateo.prueba@example.test',
		dateOfBirth: '2001-04-12',
		gender: 'male',
		classType: 'regular'
	},
	{
		id: '00000000-0000-4000-8000-000000000003',
		firstName: 'María Elena',
		lastName: 'Ejemplo de Prueba',
		email: 'maria.ejemplo@example.test',
		dateOfBirth: '2002-09-23',
		gender: 'female',
		classType: 'regular',
		isActive: false
	}
];

export async function seedStudents(databaseUrl: string): Promise<{ id: string }[]> {
	const target = assertLocalDatabaseUrl(databaseUrl, 'seed');
	const connection = createDatabase(databaseUrl);
	try {
		await verifyLocalDatabase(connection, target);
		return await connection.db
			.insert(students)
			.values(fictitiousStudents)
			.onConflictDoNothing({ target: students.id })
			.returning({ id: students.id });
	} finally {
		await connection.client.end();
	}
}

if (import.meta.main) {
	const inserted = await seedStudents(requireDatabaseUrl(process.env.DATABASE_URL));
	console.info(`Inserted ${inserted.length} fictitious students; existing records were left unchanged.`);
}
