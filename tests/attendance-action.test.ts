import { describe, expect, test } from 'bun:test';
import { createAttendanceActions } from '../src/lib/server/attendance-action';
import { presentAttendanceCertificate } from '../src/lib/attendance/presentation';
import {
	attendanceFields, attendanceTextLimits,
	type AttendanceField, type AttendanceFormValues
} from '../src/lib/attendance/types';
import type { ReportActionEvent } from '../src/lib/server/report-downloads';

const actions = createAttendanceActions(() => null);

function validValues(): AttendanceFormValues {
	return {
		studentName: 'María Sofía Pagán Cruz', studentSex: 'female',
		programStartDate: '2026-04-15', cohort: 'regular', classTime: 'pm',
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
		setHeaders: (next) => Object.assign(headers, next),
		locals: { user: null, session: null }
	} satisfies ReportActionEvent);
	return { result, headers };
}

function pageCount(bytes: Buffer): number {
	return [...bytes.toString('latin1').matchAll(/\/Type \/Page\b/g)].length;
}

describe('attendance certificate server action', () => {
	for (const cohort of ['basic', 'regular'] as const) {
		for (const classTime of ['am', 'pm'] as const) {
			for (const studentSex of ['male', 'female'] as const) {
				test(`${cohort}/${classTime}/${studentSex} generates bilingual one-page PDFs from one uncached snapshot`, async () => {
					const values = { ...validValues(), cohort, classTime, studentSex };
					const before = Date.now();
					const { result, headers } = await submit(values);
					const after = Date.now();
					if ('status' in result || !('certificate' in result) || !result.certificate || !result.reports) {
						throw new Error('Expected a generated certificate');
					}
					expect(headers['cache-control']).toBe('no-store');
					expect(result.values).toEqual(values);
					expect(result).not.toHaveProperty('errors');
					expect(result).not.toHaveProperty('failure');
					expect(result.certificate.input).toEqual(values);
					expect(result.certificate.input.classTime).toBe(classTime);
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
	}

	test('normalizes submitted text once and ignores client-provided issue dates and schedules', async () => {
		const { result } = await submit({
			...validValues(), studentName: '  MARI\u0301A   SOFI\u0301A PAGA\u0301N CRUZ  '
		}, ['issuedAt', '1999-01-01T00:00:00.000Z'], ['schedule', 'No classes'],
			['startTime', '10:00'], ['endTime', '12:00'], ['days', 'Wednesdays and Saturdays'],
			['city', 'Ponce'], ['studentEmail', 'private@example.com'], ['ssnLast4', '1234']);
		if ('status' in result || !('certificate' in result) || !result.certificate) throw new Error('Expected a certificate');
		expect(result.certificate.input.studentName).toBe('MARÍA SOFÍA PAGÁN CRUZ');
		expect(result.certificate.input.classTime).toBe('pm');
		expect(Object.keys(result.certificate.input)).toEqual([...attendanceFields]);
		expect(JSON.stringify(result)).not.toContain('private@example.com');
		expect(result.certificate.issuedAt).not.toBe('1999-01-01T00:00:00.000Z');
		const document = presentAttendanceCertificate(result.certificate, 'es');
		expect(document.paragraphs[1]).not.toContain('No classes');
		expect(document.paragraphs[1]).toContain('los lunes, martes, jueves y viernes en horario de 20:00 a 22:00');
		expect(document.paragraphs[1]).not.toContain('10:00');
		expect(document.paragraphs[1]).not.toContain('12:00');
		expect(document.paragraphs[1]).not.toContain('Wednesdays and Saturdays');
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
		if ('status' in result || !('reports' in result) || !result.reports) throw new Error('Expected PDFs for valid long text');
		for (const language of ['en', 'es'] as const) {
			expect(Buffer.from(result.reports[language], 'base64').subarray(0, 5).toString()).toBe('%PDF-');
		}
	});

	for (const field of attendanceFields) {
		test(`requires ${field} when missing or blank without generating a PDF and preserves other editable values`, async () => {
			for (const value of [undefined, '', '   ']) {
				const values: Partial<AttendanceFormValues> = validValues();
				if (value === undefined) delete values[field];
				else values[field] = value;
				const { result, headers } = await submit(values);
				if (!('status' in result) || !('errors' in result.data)) throw new Error('Missing input unexpectedly accepted');
				expect(result.status).toBe(400);
				expect(result.data.values).toEqual({ ...validValues(), [field]: value ?? '' });
				expect(result.data.errors).toEqual({ [field]: 'required' });
				expect(result.data).not.toHaveProperty('certificate');
				expect(result.data).not.toHaveProperty('reports');
				expect(result.data).not.toHaveProperty('failure');
				expect(headers['cache-control']).toBe('no-store');
			}
		});
	}

	for (const [field, value, error] of [
		['studentSex', 'other', 'sex'], ['studentSex', 'FEMALE', 'sex'], ['studentSex', ' female ', 'sex'],
		['cohort', 'unknown', 'cohort'], ['cohort', 'REGULAR', 'cohort'], ['cohort', ' regular ', 'cohort'],
		['classTime', 'unknown', 'classTime'], ['classTime', 'AM', 'classTime'], ['classTime', 'PM', 'classTime'],
		['classTime', ' am', 'classTime'], ['classTime', 'pm ', 'classTime'], ['classTime', 'pm\n', 'classTime'],
		['classTime', 'morning', 'classTime'], ['classTime', 'evening', 'classTime'],
		['classTime', 'mixed', 'classTime'], ['classTime', '8:00 p.m.', 'classTime'],
		['classTime', '10:00–12:00', 'classTime'], ['classTime', '20:00–22:00', 'classTime'],
		['programStartDate', '2026-02-29', 'date'], ['programStartDate', '2026-04-31', 'date'],
		['programStartDate', '0000-01-01', 'date'], ['employerPosition', 'Supervisor\nManager', 'text'],
		['studentName', 'A'.repeat(attendanceTextLimits.studentName + 1), 'length'],
		['studentName', '李 小龍', 'characters'], ['employerName', 'ΑΝΝΑ', 'characters'],
		['employerWorkplace', 'Store 🏢', 'characters']
	] as const) {
		test(`rejects malformed ${field} (${error}) authoritatively`, async () => {
			const { result } = await submit({ ...validValues(), [field]: value });
			if (!('status' in result) || !('errors' in result.data)) throw new Error('Invalid input unexpectedly accepted');
			expect(result.status).toBe(400);
			expect(result.data.values[field].replace(/\r\n/g, '\n')).toBe(value);
			expect(result.data.errors[field]).toBe(error);
			expect(result.data).not.toHaveProperty('reports');
		});
	}

	test('rejects duplicate fields and uploaded files instead of silently selecting or coercing them', async () => {
		for (const extra of [
			['studentName', 'Another student'], ['cohort', 'basic'],
			['classTime', 'am'], ['classTime', 'pm'], ['classTime', ''],
			['classTime', new File(['pm'], 'class-time.txt')],
			['employerWorkplace', new File(['Workplace'], 'workplace.txt')]
		] as [AttendanceField, string | File][]) {
			const { result } = await submit(validValues(), extra);
			if (!('status' in result) || !('errors' in result.data)) throw new Error('Malformed form unexpectedly accepted');
			expect(result.status).toBe(400);
			expect(result.data.values[extra[0]]).toBe('');
			expect(result.data.errors[extra[0]]).toBeDefined();
			if (extra[0] === 'classTime') expect(result.data.errors.classTime).toBe('classTime');
			expect(result.data).not.toHaveProperty('certificate');
			expect(result.data).not.toHaveProperty('reports');
		}
	});

	for (const [field, error] of [
		['studentSex', 'sex'], ['cohort', 'cohort'], ['classTime', 'classTime']
	] as const) {
		test(`rejects uploaded ${field} choices without coercion or defaults`, async () => {
			const values: Partial<AttendanceFormValues> = validValues();
			delete values[field];
			for (const content of ['', validValues()[field]]) {
				const { result } = await submit(values, [field, new File([content], 'choice.txt')]);
				if (!('status' in result) || !('errors' in result.data)) throw new Error('Uploaded choice unexpectedly accepted');
				expect(result.status).toBe(400);
				expect(result.data.values).toEqual({ ...validValues(), [field]: '' });
				expect(result.data.errors).toEqual({ [field]: error });
				expect(result.data).not.toHaveProperty('certificate');
				expect(result.data).not.toHaveProperty('reports');
			}
		});
	}
});
