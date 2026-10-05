import { fail } from '@sveltejs/kit';
import { presentAttendanceCertificate } from '#lib/attendance/presentation.ts';
import { attendanceFields, type AttendanceCertificate, type AttendanceFormValues } from '#lib/attendance/types.ts';
import { readAttendanceFormData, validateAttendanceInput } from '#lib/attendance/validation.ts';
import { generateAttendancePdf } from '#lib/server/attendance-pdf.ts';
import type { Actions } from './$types';

export const actions = {
	default: async ({ request, setHeaders }) => {
		setHeaders({ 'cache-control': 'no-store' });
		const raw = readAttendanceFormData(await request.formData());
		const values = Object.fromEntries(attendanceFields.map((field) => [
			field, typeof raw[field] === 'string' ? raw[field] : ''
		])) as AttendanceFormValues;
		const validation = validateAttendanceInput(raw);
		if (!validation.valid) {
			return fail(400, { values, errors: validation.errors, certificate: null, reports: null, serverError: false });
		}

		// Both downloads share the same validated details and server-controlled issue date.
		const certificate: AttendanceCertificate = { input: validation.input, issuedAt: new Date().toISOString() };
		try {
			const [english, spanish] = await Promise.all([
				generateAttendancePdf(presentAttendanceCertificate(certificate, 'en')),
				generateAttendancePdf(presentAttendanceCertificate(certificate, 'es'))
			]);
			return {
				values, errors: {}, certificate, serverError: false,
				reports: { en: english.toString('base64'), es: spanish.toString('base64') }
			};
		} catch {
			console.error('Unable to generate attendance certificate PDFs');
			return fail(503, { values, errors: {}, certificate: null, reports: null, serverError: true });
		}
	}
} satisfies Actions;
