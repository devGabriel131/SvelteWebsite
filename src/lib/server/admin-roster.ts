import { asc, eq, sql } from 'drizzle-orm';
import type { Database } from './db/connection';
import { students, studentSubjectScores } from './db/schema';
import type { AdminStudent } from '../admin/roster';
import { getAdminPageState } from './auth/access';

export async function loadAdminRoster(
	locals: Pick<App.Locals, 'user' | 'session' | 'localAdmin'>,
	database: () => Database | Promise<Database>
) {
	const state = getAdminPageState(locals);
	return {
		...state,
		localAdmin: locals.localAdmin === true,
		students: state.isAdmin ? await readAdminRoster(await database()) : []
	};
}

export async function readAdminRoster(db: Database): Promise<AdminStudent[]> {
	const rows = await db.select({
		id: students.id, firstName: students.firstName, lastName: students.lastName,
		email: students.email, classType: students.classType, status: students.status,
				dateOfBirth: students.dateOfBirth, gender: students.gender,
				createdAt: students.createdAt, updatedAt: students.updatedAt,
		scores: studentSubjectScores,
		hasAccount: sql<boolean>`${students.authUserId} IS NOT NULL`
	}).from(students).leftJoin(studentSubjectScores, eq(students.id, studentSubjectScores.studentId))
		.orderBy(asc(students.lastName), asc(students.firstName), asc(students.id));
	return rows.map((row) => ({
		id: row.id, name: `${row.firstName} ${row.lastName}`, email: row.email,
		firstName: row.firstName, lastName: row.lastName, dateOfBirth: row.dateOfBirth, hasAccount: row.hasAccount,
				gender: row.gender, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
				classType: row.classType, status: row.status,
		subjectScores: row.scores ? {
			ar: row.scores.ar, pc: row.scores.pc, wk: row.scores.wk, mk: row.scores.mk,
			isFixture: row.scores.isFixture
		} : null
	}));
}
