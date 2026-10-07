import { describe, expect, test } from 'bun:test';
import { filterReport, summarizeReport } from '../src/lib/bootcamp/report';
import { reportCsv } from '../src/lib/server/bootcamp/admin';
import type { ReportRow } from '../src/lib/bootcamp/types';

const row = (id: string, classType: ReportRow['classType'], status: ReportRow['status'], paidCents = 0): ReportRow => ({
	studentId: id, name: `Student ${id}`, email: `${id}@example.test`, classType,
	eligibility: 'eligible', status, paidCents, remainingCents: 3000 - paidCents, documents: []
});
const rows = [row('one', 'basic', 'not_started'), row('two', 'basic', 'waiver'), row('three', 'regular', 'confirmed', 1500), row('four', 'regular', 'confirmed', 3000)];

describe('bootcamp ledger reports', () => {
	test('distinguishes started signups from confirmed registrations and verified balances', () => {
		expect(summarizeReport(rows)).toEqual({
			total: 4, started: 3, confirmed: 2, paidCents: 4500, remainingCents: 1500,
			classes: [
				{ classType: 'basic', total: 2, started: 1, confirmed: 0, percent: 50 },
				{ classType: 'regular', total: 2, started: 2, confirmed: 2, percent: 100 }
			]
		});
	});

	test('empty reports and missing class groups have zero coverage', () => {
		const summary = summarizeReport([]);
		expect(summary.total).toBe(0);
		expect(summary.paidCents).toBe(0);
		expect(summary.remainingCents).toBe(0);
		expect(summary.classes.every(group => group.percent === 0)).toBe(true);
		expect(summarizeReport([rows[0]]).classes[1].total).toBe(0);
	});

	test('combines class, registration and case-insensitive search filters', () => {
		expect(filterReport(rows, '', 'basic', 'started')).toEqual([rows[1]]);
		expect(filterReport(rows, ' THREE@EXAMPLE.TEST ', 'regular', 'confirmed')).toEqual([rows[2]]);
		expect(filterReport(rows, '', 'all', 'not_started')).toEqual([rows[0]]);
		expect(filterReport(rows, '', 'all', 'all')).toEqual(rows);
		expect(filterReport(rows, 'missing', 'all', 'all')).toEqual([]);
	});

	test('summary and filters leave authoritative report rows unchanged', () => {
		const before = structuredClone(rows);
		summarizeReport(rows);
		filterReport(rows, 'two', 'basic', 'started');
		expect(rows).toEqual(before);
	});

	test('CSV exports localized class types and still neutralizes formulas', () => {
		const source = [{ ...rows[0], name: '=UNSAFE', email: '+unsafe@example.test' }, rows[2]];
		for (const [language, header, basic] of [['en', 'Class', 'Basic'], ['es', 'Clase', 'Básico']] as const) {
			const csv = reportCsv(source, language);
			expect(csv).toStartWith('\uFEFF');
			expect(csv.split('\r\n')[0]).toContain(`"${header}"`);
			expect(csv).toContain(`"'=UNSAFE","'+unsafe@example.test","${basic}"`);
			expect(csv).toContain('"Regular"');
			expect(csv).toContain('"15.00","15.00"');
		}
	});
});
