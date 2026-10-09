import { and, inArray, sql } from 'drizzle-orm';
import { students, studentSubjectScores } from '../../src/lib/server/db/schema';
import { openLocalDatabase } from './local-target';

export const fixtureEmails = Array.from({ length: 100 }, (_, index) =>
	`fake.student.${String(index + 1).padStart(3, '0')}@example.test`
);

export async function seedSubjectScores(databaseUrl: string | undefined) {
	const connection = await openLocalDatabase(databaseUrl, 'seed');
	try {
		return await connection.db.transaction(async (tx) => {
			const roster = await tx.select({ id: students.id }).from(students)
				.where(and(inArray(students.email, fixtureEmails), sql`${students.lastName} ~ '(^Test$| [(]Test[)]$)'`));
			if (roster.length !== 100) throw new Error(`Expected all 100 fictional Test students; found ${roster.length}. No scores inserted.`);
			// Arbitrary fixture values, not calculated from answers or an exam scoring model.
			const values = roster.map((student) => ({
				studentId: student.id,
				ar: Math.floor(Math.random() * 101), pc: Math.floor(Math.random() * 101),
				wk: Math.floor(Math.random() * 101), mk: Math.floor(Math.random() * 101),
				isFixture: true
			}));
			return await tx.insert(studentSubjectScores).values(values)
				.onConflictDoNothing({ target: studentSubjectScores.studentId })
				.returning({ studentId: studentSubjectScores.studentId });
		});
	} finally { await connection.client.end(); }
}

if (import.meta.main) {
	const inserted = await seedSubjectScores(process.env.DATABASE_URL);
	console.info(`Inserted ${inserted.length} fictional subject-score rows; existing students and scores were left unchanged.`);
}
