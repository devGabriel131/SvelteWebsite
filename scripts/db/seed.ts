import { students, type NewStudent } from '../../src/lib/server/db/schema';
import { openLocalDatabase } from './local-target';

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
		status: 'inactive'
	}
];

export async function seedStudents(databaseUrl: string | undefined): Promise<{ id: string }[]> {
	const connection = await openLocalDatabase(databaseUrl, 'seed');
	try {
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
	const inserted = await seedStudents(process.env.DATABASE_URL);
	console.info(`Inserted ${inserted.length} fictitious students; existing records were left unchanged.`);
}
