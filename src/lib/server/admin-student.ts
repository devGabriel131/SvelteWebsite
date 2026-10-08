import { eq } from 'drizzle-orm';
import { error, fail } from '@sveltejs/kit';
import { getViewer } from './auth/access';
import type { Database } from './db/connection';
import { students, studentSubjectScores } from './db/schema';
import { subjects } from '../admin/roster';

export class StudentEditError extends Error {
	constructor(public code: 'invalid' | 'missing' | 'duplicate' | 'linkedEmail' | 'storage') { super(code); }
}
export function parseStudentEdit(form: FormData, today = new Date().toISOString().slice(0, 10)) {
	const text = (key: string) => { const value = form.get(key); if (typeof value !== 'string') throw new StudentEditError('invalid'); return value.trim(); };
	const id = text('id');
	const firstName = text('firstName'), lastName = text('lastName'), email = text('email').toLowerCase();
	const dateOfBirth = text('dateOfBirth') || null, gender = text('gender') || null;
	const classType = text('classType'), status = text('status');
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !firstName || !lastName || !/^[^\s@]+@[^\s@]+$/.test(email) || !['basic', 'regular'].includes(classType) || !['active', 'inactive', 'invited'].includes(status) || (gender !== null && !['male', 'female'].includes(gender))) throw new StudentEditError('invalid');
	if (dateOfBirth && (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || dateOfBirth < '0001-01-01' || dateOfBirth > today || !Number.isFinite(Date.parse(dateOfBirth)) || new Date(dateOfBirth).toISOString().slice(0, 10) !== dateOfBirth)) throw new StudentEditError('invalid');
	const values = subjects.map((subject) => text(subject));
	let scores: { ar: number; pc: number; wk: number; mk: number } | null = null;
	if (values.some(Boolean)) {
		if (values.some((value) => !/^\d{1,3}$/.test(value) || Number(value) > 100)) throw new StudentEditError('invalid');
		scores = { ar: Number(values[0]), pc: Number(values[1]), wk: Number(values[2]), mk: Number(values[3]) };
	}
	return { id, profile: { firstName, lastName, email, dateOfBirth, gender: gender as 'male' | 'female' | null, classType: classType as 'basic' | 'regular', status: status as 'active' | 'inactive' | 'invited' }, scores };
}
export async function updateAdminStudent(db: Database, form: FormData) {
	const input = parseStudentEdit(form);
	await db.transaction(async (tx) => {
		const [student] = await tx.select({ authUserId: students.authUserId, email: students.email })
			.from(students).where(eq(students.id, input.id)).for('update');
		if (!student) throw new StudentEditError('missing');
		if (student.authUserId && student.email.trim().toLowerCase() !== input.profile.email) throw new StudentEditError('linkedEmail');
		await tx.update(students).set(input.profile).where(eq(students.id, input.id));
		if (input.scores) await tx.insert(studentSubjectScores).values({ studentId: input.id, ...input.scores }).onConflictDoUpdate({ target: studentSubjectScores.studentId, set: input.scores });
		else await tx.delete(studentSubjectScores).where(eq(studentSubjectScores.studentId, input.id));
	});
}
export async function editStudentAction(locals: Pick<App.Locals, 'user' | 'session'>, request: Request, database: () => Database | Promise<Database>) {
	const viewer = getViewer(locals);
	if (!viewer) error(401);
	if (viewer.role !== 'admin') error(403);
	if (request.headers.get('origin') !== new URL(request.url).origin) error(403);
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
