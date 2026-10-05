import { describe, expect, test } from 'bun:test';
import { actions } from '../src/routes/attendance/+page.server';
import { presentAttendanceCertificate } from '../src/lib/attendance/presentation';
import {
	attendanceFields, attendanceTextLimits,
	type AttendanceField, type AttendanceFormValues
} from '../src/lib/attendance/types';

function validValues(): AttendanceFormValues {
	return {
		studentName: 'María Sofía Pagán Cruz', studentSex: 'female',
		programStartDate: '2026-04-15', cohort: 'regular',
		employerName: 'Roberto Quiñones', employerPosition: 'Supervisor',
		employerWorkplace: 'Walgreens, Plaza del Sol'
	};
}

async function submit(values: Partial<AttendanceFormValues>, ...extras: [string, string | File][]) {
	const data = new FormData();
	for (const field of attendanceFields) {
		if (values[field] !== undefined) data.append(field, values[field]);
	}
	for (const extra of extras) data.append(...extra);
	const headers: Record<string, string> = {};
	const result = await actions.default({
		request: new Request('http://localhost/attendance', { method: 'POST', body: data }),
		setHeaders: (next: Record<string, string>) => Object.assign(headers, next)
	} as Parameters<typeof actions.default>[0]);
	return { result, headers };
}

function pageCount(bytes: Buffer): number {
	return [...bytes.toString('latin1').matchAll(/\/Type \/Page\b/g)].length;
}

describe('attendance certificate server action', () => {
	for (const cohort of ['basic', 'regular'] as const) {
		for (const studentSex of ['male', 'female'] as const) {
			test(`${cohort}/${studentSex} generates bilingual one-page PDFs from one uncached snapshot`, async () => {
				const values = { ...validValues(), cohort, studentSex };
				const before = Date.now();
				const { result, headers } = await submit(values);
				const after = Date.now();
				if ('status' in result || !result.certificate || !result.reports) {
					throw new Error('Expected a generated certificate');
				}
				expect(headers['cache-control']).toBe('no-store');
				expect(result.values).toEqual(values);
				expect(result.errors).toEqual({});
				expect(result.serverError).toBe(false);
				expect(result.certificate.input).toEqual(values);
				expect(Date.parse(result.certificate.issuedAt)).toBeGreaterThanOrEqual(before);
				expect(Date.parse(result.certificate.issuedAt)).toBeLessThanOrEqual(after);
				for (const language of ['en', 'es'] as const) {
					const bytes = Buffer.from(result.reports[language], 'base64');
					expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
					expect(pageCount(bytes)).toBe(1);
					const document = presentAttendanceCertificate(result.certificate, language);
					expect(document.paragraphs).toHaveLength(5);
					expect(document.filename.endsWith(`_${language}.pdf`)).toBe(true);
				}
				expect(result.reports.en).not.toBe(result.reports.es);
			});
		}
	}

	test('normalizes submitted text once and ignores client-provided issue dates and schedules', async () => {
		const { result } = await submit({
			...validValues(), studentName: '  MARI\u0301A   SOFI\u0301A PAGA\u0301N CRUZ  '
		}, ['issuedAt', '1999-01-01T00:00:00.000Z'], ['schedule', 'No classes'],
			['city', 'Ponce'], ['studentEmail', 'private@example.com'], ['ssnLast4', '1234']);
		if ('status' in result || !result.certificate) throw new Error('Expected a certificate');
		expect(result.certificate.input.studentName).toBe('MARÍA SOFÍA PAGÁN CRUZ');
		expect(Object.keys(result.certificate.input)).toEqual([...attendanceFields]);
		expect(JSON.stringify(result)).not.toContain('private@example.com');
		expect(result.certificate.issuedAt).not.toBe('1999-01-01T00:00:00.000Z');
		const document = presentAttendanceCertificate(result.certificate, 'es');
		expect(document.paragraphs[1]).not.toContain('No classes');
		expect(document.paragraphs[4]).toContain('San Juan');
		expect(document.paragraphs[4]).not.toContain('Ponce');
		expect(document.paragraphs.join(' ')).not.toContain('SS:');
	});

	test('generates PDFs with maximum-length names and employer details', async () => {
		const { result } = await submit({
			...validValues(),
			studentName: 'Á'.repeat(attendanceTextLimits.studentName),
			employerName: 'É'.repeat(attendanceTextLimits.employerName),
			employerPosition: 'Ñ'.repeat(attendanceTextLimits.employerPosition),
			employerWorkplace: 'Ó'.repeat(attendanceTextLimits.employerWorkplace)
		});
		if ('status' in result || !result.reports) throw new Error('Expected PDFs for valid long text');
		for (const language of ['en', 'es'] as const) {
			expect(Buffer.from(result.reports[language], 'base64').subarray(0, 5).toString()).toBe('%PDF-');
		}
	});

	for (const field of attendanceFields) {
		test(`requires ${field} without generating a PDF and preserves other editable values`, async () => {
			const values = { ...validValues(), [field]: '' };
			const { result, headers } = await submit(values);
			if (!('status' in result)) throw new Error('Missing input unexpectedly accepted');
			expect(result.status).toBe(400);
			expect(result.data.values).toEqual(values);
			expect(result.data.errors[field]).toBe('required');
			expect(result.data.certificate).toBeNull();
			expect(result.data.reports).toBeNull();
			expect(result.data.serverError).toBe(false);
			expect(headers['cache-control']).toBe('no-store');
		});
	}

	for (const [field, value, error] of [
		['studentSex', 'other', 'sex'], ['cohort', 'unknown', 'cohort'],
		['programStartDate', '2026-02-29', 'date'], ['programStartDate', '2026-04-31', 'date'],
		['programStartDate', '0000-01-01', 'date'], ['employerPosition', 'Supervisor\nManager', 'text'],
		['studentName', 'A'.repeat(attendanceTextLimits.studentName + 1), 'length'],
		['studentName', '李 小龍', 'characters'], ['employerName', 'ΑΝΝΑ', 'characters'],
		['employerWorkplace', 'Store 🏢', 'characters']
	] as const) {
		test(`rejects malformed ${field} (${error}) authoritatively`, async () => {
			const { result } = await submit({ ...validValues(), [field]: value });
			if (!('status' in result)) throw new Error('Invalid input unexpectedly accepted');
			expect(result.status).toBe(400);
			expect(result.data.values[field].replace(/\r\n/g, '\n')).toBe(value);
			expect(result.data.errors[field]).toBe(error);
			expect(result.data.reports).toBeNull();
		});
	}

	test('rejects duplicate fields and uploaded files instead of silently selecting or coercing them', async () => {
		for (const extra of [
			['studentName', 'Another student'], ['cohort', 'basic'],
			['employerWorkplace', new File(['Workplace'], 'workplace.txt')]
		] as [AttendanceField, string | File][]) {
			const { result } = await submit(validValues(), extra);
			if (!('status' in result)) throw new Error('Malformed form unexpectedly accepted');
			expect(result.status).toBe(400);
			expect(result.data.values[extra[0]]).toBe('');
			expect(result.data.errors[extra[0]]).toBeDefined();
			expect(result.data.certificate).toBeNull();
			expect(result.data.reports).toBeNull();
		}
	});
});
