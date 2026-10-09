import { eq } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import { requireActionViewer, type AuthLocals } from './auth/access';
import type { Database } from './db/connection';
import { studentAccounts, students, studentSubjectScores } from './db/schema';
import { subjects } from '../admin/roster';
import { isStudentId, isValidDateOfBirth, studentClassTypes, studentGenders, studentStatuses, type StudentClassType, type StudentGender, type StudentStatus } from '../student';

export class StudentEditError extends Error {
	constructor(public code: 'invalid' | 'missing' | 'duplicate' | 'linkedEmail' | 'storage') { super(code); }
}
export function parseStudentEdit(form: FormData, today = new Date().toISOString().slice(0, 10)) {
	const text = (key: string) => { const value = form.get(key); if (typeof value !== 'string') throw new StudentEditError('invalid'); return value.trim(); };
	const id = text('id');
	const firstName = text('firstName'), lastName = text('lastName'), email = text('email').toLowerCase();
	const dateOfBirth = text('dateOfBirth') || null, gender = text('gender') || null;
	const classType = text('classType'), status = text('status');
	if (!isStudentId(id) || !firstName || !lastName || !/^[^\s@]+@[^\s@]+$/.test(email) || !studentClassTypes.includes(classType as StudentClassType) || !studentStatuses.includes(status as StudentStatus) || (gender !== null && !studentGenders.includes(gender as StudentGender))) throw new StudentEditError('invalid');
	if (dateOfBirth && !isValidDateOfBirth(dateOfBirth, today)) throw new StudentEditError('invalid');
	const values = subjects.map((subject) => text(subject));
	let scores: { ar: number; pc: number; wk: number; mk: number } | null = null;
	if (values.some(Boolean)) {
		if (values.some((value) => !/^\d{1,3}$/.test(value) || Number(value) > 100)) throw new StudentEditError('invalid');
		scores = { ar: Number(values[0]), pc: Number(values[1]), wk: Number(values[2]), mk: Number(values[3]) };
	}
	return { id, profile: { firstName, lastName, email, dateOfBirth, gender: gender as StudentGender | null, classType: classType as StudentClassType, status: status as StudentStatus }, scores };
}
export async function updateAdminStudent(db: Database, form: FormData) {
	const input = parseStudentEdit(form);
	await db.transaction(async (tx) => {
		const [student] = await tx.select({ email: students.email })
			.from(students).where(eq(students.id, input.id)).for('update');
		if (!student) throw new StudentEditError('missing');
		const [association] = await tx.select({ userId: studentAccounts.userId }).from(studentAccounts).where(eq(studentAccounts.studentId, input.id));
		if (association && student.email.trim().toLowerCase() !== input.profile.email) throw new StudentEditError('linkedEmail');
		await tx.update(students).set(input.profile).where(eq(students.id, input.id));
		if (input.scores) await tx.insert(studentSubjectScores).values({ studentId: input.id, ...input.scores }).onConflictDoUpdate({ target: studentSubjectScores.studentId, set: input.scores });
		else await tx.delete(studentSubjectScores).where(eq(studentSubjectScores.studentId, input.id));
	});
}
export async function editStudentAction(locals: AuthLocals, request: Request, database: () => Database | Promise<Database>) {
	requireActionViewer(locals, request, 'admin');
	let id: string | null = null;
	try {
		const form = await request.formData();
		id = typeof form.get('id') === 'string' ? String(form.get('id')) : null;
		await updateAdminStudent(await database(), form);
		return { studentEdit: { id, success: true as const } };
	} catch (cause) {
		const pg = cause as { code?: string; constraint_name?: string; cause?: { code?: string; constraint_name?: string } };
		const detail = pg.cause ?? pg;
		const code = cause instanceof StudentEditError ? cause.code : detail.code === '23505' && detail.constraint_name === 'students_email_normalized_unique' ? 'duplicate' : 'storage';
		return fail(code === 'storage' ? 500 : code === 'missing' ? 404 : 400, { studentEdit: { id, success: false as const, error: code } });
	}
}
