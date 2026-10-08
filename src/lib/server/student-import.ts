import { error, fail } from '@sveltejs/kit';
import type { StudentImportResult } from '../student-invitations';
import { getViewer } from './auth/access';
import type { Database } from './db/connection';
import { MAX_IMPORT_BYTES, parseStudentWorkbook, StudentImportFileError } from './student-import-file';
import { createStudentImportReview, verifyStudentImportReview, type StudentImportOptions } from './student-import-review';
import { findStudentImportConflicts, provisionImportedStudents, resendStudentInvitation,
	sendImportedStudentInvitations, StudentInvitationError, type InvitationDelivery } from './student-invitations';

export type StudentImportDependencies = {
	database(): Database | Promise<Database>;
	authentication(): Promise<{ secret: string; baseURL: string; hashPin(pin: string): Promise<string> }>;
	delivery(): InvitationDelivery | Promise<InvitationDelivery>;
};
type AuthLocals = Pick<App.Locals, 'user' | 'session'>;

function requireAdmin(locals: AuthLocals, request: Request) {
	const viewer = getViewer(locals);
	if (!viewer) error(401);
	if (viewer.role !== 'admin' || request.headers.get('origin') !== new URL(request.url).origin) error(403);
	return viewer;
}

async function readImportForm(request: Request) {
	const limit = MAX_IMPORT_BYTES + 64 * 1024;
	const reader = request.body?.getReader();
	if (!reader) throw new StudentImportFileError('file');
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > limit) {
				await reader.cancel();
				throw new StudentImportFileError('limit');
			}
			chunks.push(value);
		}
	} finally { reader.releaseLock(); }
	const body = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
	try { return await new Request(request.url, { method: 'POST', headers: request.headers, body }).formData(); }
	catch { throw new StudentImportFileError('file'); }
}

export function parseStudentImportOptions(form: FormData): StudentImportOptions {
	const classType = form.get('classType'), emailLanguage = form.get('emailLanguage');
	if ((classType !== 'basic' && classType !== 'regular') || (emailLanguage !== 'en' && emailLanguage !== 'es')) throw new StudentInvitationError('invalid');
	return { classType, emailLanguage };
}

function importFailure(cause: unknown): NonNullable<StudentImportResult['error']> {
	if (cause instanceof StudentImportFileError) return cause.code;
	if (cause instanceof StudentInvitationError) return cause.code === 'invitation' ? 'invalid' : cause.code;
	const pg = cause as { code?: string; cause?: { code?: string } } | null;
	return (pg?.cause?.code ?? pg?.code) === '23505' ? 'conflict' : 'storage';
}

export async function studentImportAction(locals: AuthLocals, request: Request, phase: 'preview' | 'import', dependencies: StudentImportDependencies) {
	const admin = requireAdmin(locals, request);
	try {
		const form = await readImportForm(request);
		const options = parseStudentImportOptions(form);
		const file = form.get('file');
		if (!(file instanceof File)) throw new StudentImportFileError('file');
		if (file.size > MAX_IMPORT_BYTES) throw new StudentImportFileError('limit');
		const bytes = new Uint8Array(await file.arrayBuffer());
		const authentication = await dependencies.authentication();
		const reviewInput = { ...options, adminId: admin.id, file: bytes };
		if (phase === 'import' && !verifyStudentImportReview(authentication.secret, form.get('reviewToken'), reviewInput)) {
			return fail(400, { studentImport: { phase, success: false, error: 'review' } satisfies StudentImportResult });
		}
		const parsed = await parseStudentWorkbook(file);
		const db = await dependencies.database();
		const issues = [...parsed.issues, ...await findStudentImportConflicts(db, parsed.students)].sort((a, b) => a.row - b.row);
		const rows = parsed.students.map(({ row, firstName, lastName, email }) => ({ row, firstName, lastName, email }));
		if (issues.length) {
			return fail(400, { studentImport: { phase, success: false, rows, issues, options, error: 'invalid' } satisfies StudentImportResult });
		}
		// Configuration checks do not send mail. Never commit accounts unless invitation sending is configured.
		const delivery = await dependencies.delivery();
		if (delivery.baseURL !== authentication.baseURL) throw new StudentInvitationError('unavailable');
		if (phase === 'preview') {
			return { studentImport: { phase, success: true, rows, options, reviewToken: createStudentImportReview(authentication.secret, reviewInput), testMode: delivery.testMode } satisfies StudentImportResult };
		}
		const invitations = await provisionImportedStudents(db, admin.id, parsed.students, options, authentication.hashPin, delivery.testMode);
		const sends = await sendImportedStudentInvitations(db, invitations, delivery);
		return { studentImport: { phase, success: true, created: invitations.length, ...sends, testMode: delivery.testMode } satisfies StudentImportResult };
	} catch (cause) {
		const code = importFailure(cause);
		return fail(code === 'storage' ? 500 : code === 'unavailable' ? 503 : 400, { studentImport: { phase, success: false, error: code } satisfies StudentImportResult });
	}
}

export async function resendInvitationAction(locals: AuthLocals, request: Request, dependencies: StudentImportDependencies) {
	const admin = requireAdmin(locals, request);
	let studentId: string | null = null;
	try {
		const form = await readImportForm(request);
		studentId = typeof form.get('studentId') === 'string' ? String(form.get('studentId')) : null;
		if (!studentId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(studentId)) throw new StudentInvitationError('invalid');
		const delivery = await dependencies.delivery();
		const success = await resendStudentInvitation(await dependencies.database(), admin.id, studentId, delivery);
		if (!success) return fail(503, { invitationResend: { studentId, success: false as const, error: 'unavailable' as const, testMode: delivery.testMode } });
		return { invitationResend: { studentId, success: true as const, testMode: delivery.testMode } };
	} catch (cause) {
		const code = cause instanceof StudentInvitationError ? cause.code === 'unavailable' ? 'unavailable' : 'invalid' : cause instanceof StudentImportFileError ? 'invalid' : 'storage';
		return fail(code === 'storage' ? 500 : code === 'unavailable' ? 503 : 400, { invitationResend: { studentId, success: false as const, error: code } });
	}
}
