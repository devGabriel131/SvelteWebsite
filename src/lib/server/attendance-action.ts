import { fail, type Actions } from '@sveltejs/kit';
import { presentAttendanceCertificate } from '#lib/attendance/presentation.ts';
import { attendanceFields, type AttendanceCertificate } from '#lib/attendance/types.ts';
import { validateAttendanceInput } from '#lib/attendance/validation.ts';
import { formValues, readFormFields } from '#lib/form-fields.ts';
import { generateAttendancePdf } from './attendance-pdf';
import type { GetReportArchive } from './drive/archive';
import { generateReportDownloads, type ReportActionEvent } from './report-downloads';

export function createAttendanceActions(getArchive: GetReportArchive) {
	return {
		default: async ({ request, setHeaders, locals }: ReportActionEvent) => {
			setHeaders({ 'cache-control': 'no-store' });
			const raw = readFormFields(await request.formData(), attendanceFields);
			const values = formValues(raw, attendanceFields);
			const validation = validateAttendanceInput(raw);
			if (!validation.valid) {
				return fail(400, { values, errors: validation.errors });
			}

			// Both downloads and archived copies share the same server-controlled issue date.
			const certificate: AttendanceCertificate = { input: validation.input, issuedAt: new Date().toISOString() };
			const result = await generateReportDownloads({
				getArchive, locals, signal: request.signal,
				generate: async () => {
					const english = presentAttendanceCertificate(certificate, 'en');
					const spanish = presentAttendanceCertificate(certificate, 'es');
					const [en, es] = await Promise.all([generateAttendancePdf(english), generateAttendancePdf(spanish)]);
					return { en: { bytes: en, filename: english.filename }, es: { bytes: es, filename: spanish.filename } };
				}
			});
			if (!result.ok) {
				return fail(result.status, { values, failure: result.failure });
			}
			return { values, certificate, reports: result.reports, archived: result.archived };
		}
	} satisfies Actions;
}
