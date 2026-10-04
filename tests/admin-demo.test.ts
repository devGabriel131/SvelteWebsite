import { describe, expect, test } from 'bun:test';
import {
	activitySeries,
	chartPoints,
	filterStudents,
	previewLink,
	sampleStudents,
	studentMetrics,
	type AdminStudent,
	type StudentStatus
} from '../src/lib/admin/demo';

function makeStudent(overrides: Partial<AdminStudent> = {}): AdminStudent {
	return {
		id: 'MM-TEST',
		name: 'Demo Student',
		email: 'student@example.com',
		cohort: 'Alpha 01',
		status: 'active',
		score: null,
		progress: 0,
		lastActiveMinutes: null,
		...overrides
	};
}

function parsePoints(points: string): number[][] {
	return points.split(' ').map((point) => point.split(',').map(Number));
}

describe('fictional admin fixtures', () => {
	test('uses unique student IDs and reserved example email addresses', () => {
		expect(sampleStudents).toHaveLength(8);
		expect(new Set(sampleStudents.map(({ id }) => id)).size).toBe(sampleStudents.length);
		expect(new Set(sampleStudents.map(({ email }) => email)).size).toBe(sampleStudents.length);
		for (const student of sampleStudents) {
			expect(student.email).toMatch(/^[^@]+@example\.com$/);
			expect(['active', 'invited', 'paused']).toContain(student.status);
			expect(student.name.trim()).not.toBe('');
			expect(student.cohort.trim()).not.toBe('');
			expect(Number.isFinite(student.progress)).toBe(true);
			expect(student.progress).toBeGreaterThanOrEqual(0);
			expect(student.progress).toBeLessThanOrEqual(100);
			if (student.score !== null) {
				expect(Number.isFinite(student.score)).toBe(true);
				expect(student.score).toBeGreaterThanOrEqual(0);
				expect(student.score).toBeLessThanOrEqual(100);
			}
			if (student.lastActiveMinutes !== null) {
				expect(Number.isFinite(student.lastActiveMinutes)).toBe(true);
				expect(student.lastActiveMinutes).toBeGreaterThanOrEqual(0);
			}
		}
	});

	test('provides nonnegative finite weekly and monthly activity', () => {
		expect(activitySeries.week).toHaveLength(7);
		expect(activitySeries.month).toHaveLength(14);
		for (const values of Object.values(activitySeries)) {
			for (const value of values) {
				expect(Number.isFinite(value)).toBe(true);
				expect(value).toBeGreaterThanOrEqual(0);
			}
		}
	});
});

describe('filterStudents', () => {
	for (const { field, queries, ids } of [
		{ field: 'name', queries: ['alex rivera', 'ALEX RIVERA', ' \tAlEx RiVeRa\n '], ids: ['MM-001'] },
		{ field: 'email', queries: ['sofia.martinez@example.com', 'SOFIA.MARTINEZ@EXAMPLE.COM', '  SoFiA.MaRtInEz@ExAmPlE.CoM  '], ids: ['MM-002'] },
		{ field: 'cohort', queries: ['bravo 02', 'BRAVO 02', '  BrAvO 02  '], ids: ['MM-003', 'MM-005', 'MM-006', 'MM-008'] },
		{ field: 'ID', queries: ['mm-004', 'MM-004', '\tMm-004\n'], ids: ['MM-004'] }
	]) {
		test(`matches ${field} case-insensitively and trims query whitespace`, () => {
			for (const query of queries) {
				expect(filterStudents(sampleStudents, query, 'all').map(({ id }) => id)).toEqual(ids);
			}
		});
	}

	test('matches partial names, emails, cohorts, and IDs', () => {
		for (const query of ['rivera', 'alex.rivera@', 'alpha', 'mm-00']) {
			expect(filterStudents(sampleStudents, query, 'all').map(({ id }) => id)).toContain('MM-001');
		}
	});

	for (const { status, ids } of [
		{ status: 'active', ids: ['MM-001', 'MM-002', 'MM-003', 'MM-004', 'MM-007'] },
		{ status: 'invited', ids: ['MM-006', 'MM-008'] },
		{ status: 'paused', ids: ['MM-005'] }
	] satisfies { status: StudentStatus; ids: string[] }[]) {
		test(`filters ${status} students with a blank query`, () => {
			expect(filterStudents(sampleStudents, ' \t\n ', status).map(({ id }) => id)).toEqual(ids);
		});
	}

	test('combines trimmed case-insensitive search with status using AND', () => {
		expect(filterStudents(sampleStudents, '  BRAVO 02  ', 'active').map(({ id }) => id)).toEqual(['MM-003']);
		expect(filterStudents(sampleStudents, '  BRAVO 02  ', 'invited').map(({ id }) => id)).toEqual(['MM-006', 'MM-008']);
		expect(filterStudents(sampleStudents, '  BRAVO 02  ', 'paused').map(({ id }) => id)).toEqual(['MM-005']);
		expect(filterStudents(sampleStudents, 'alex', 'invited')).toEqual([]);
	});

	test('returns every student in original order in a new array for empty or whitespace-only search', () => {
		for (const query of ['', ' \t\n ']) {
			const result = filterStudents(sampleStudents, query, 'all');
			expect(result).toEqual(sampleStudents);
			expect(result).not.toBe(sampleStudents);
		}
	});

	test('returns no students for unmatched queries or an empty roster', () => {
		expect(filterStudents(sampleStudents, 'no such student', 'all')).toEqual([]);
		for (const status of ['all', 'active', 'invited', 'paused'] as const) {
			for (const query of ['', '  ALPHA 01  ']) {
				expect(filterStudents([], query, status)).toEqual([]);
			}
		}
	});

	test('does not mutate, reorder, or replace input students', () => {
		const students = structuredClone(sampleStudents);
		const snapshot = structuredClone(students);
		for (const student of students) Object.freeze(student);
		Object.freeze(students);
		const result = filterStudents(students, ' BRAVO 02 ', 'invited');
		expect(result.map(({ id }) => id)).toEqual(['MM-006', 'MM-008']);
		expect(result[0]).toBe(students[5]);
		expect(result[1]).toBe(students[7]);
		result.reverse();
		result.pop();
		expect(students).toEqual(snapshot);
	});
});

describe('studentMetrics', () => {
	test('computes the fixture totals, graded average, and attention count', () => {
		expect(studentMetrics(sampleStudents)).toEqual({
			total: 8,
			active: 5,
			invited: 2,
			averageScore: 78,
			needsAttention: 2
		});
	});

	test('returns zero metrics for an empty roster', () => {
		expect(studentMetrics([])).toEqual({
			total: 0,
			active: 0,
			invited: 0,
			averageScore: 0,
			needsAttention: 0
		});
	});

	test('excludes null scores from the average without excluding recorded zero', () => {
		expect(studentMetrics([
			makeStudent({ score: 0 }),
			makeStudent({ score: 100 }),
			makeStudent({ status: 'invited', score: null })
		])).toEqual({ total: 3, active: 2, invited: 1, averageScore: 50, needsAttention: 1 });
	});

	test('handles a roster with only null scores', () => {
		expect(studentMetrics([
			makeStudent(),
			makeStudent({ status: 'invited' }),
			makeStudent({ status: 'paused' })
		])).toEqual({ total: 3, active: 1, invited: 1, averageScore: 0, needsAttention: 1 });
	});

	test('handles recorded zero scores without nonfinite averages', () => {
		expect(studentMetrics([makeStudent({ score: 0 }), makeStudent({ score: 0 })])).toEqual({
			total: 2, active: 2, invited: 0, averageScore: 0, needsAttention: 2
		});
	});

	test('rounds the graded average to the nearest integer', () => {
		expect(studentMetrics([makeStudent({ score: 70 }), makeStudent({ score: 71 })]).averageScore).toBe(71);
		expect(studentMetrics([makeStudent({ score: 70 }), makeStudent({ score: 70 }), makeStudent({ score: 71 })]).averageScore).toBe(70);
	});

	test('flags scores below 70 or paused students, counting each student once', () => {
		expect(studentMetrics([
			makeStudent({ score: 69 }),
			makeStudent({ score: 70 }),
			makeStudent({ score: null }),
			makeStudent({ status: 'paused', score: 95 }),
			makeStudent({ status: 'paused', score: 30 }),
			makeStudent({ status: 'paused', score: null }),
			makeStudent({ status: 'invited', score: null })
		])).toEqual({ total: 7, active: 3, invited: 1, averageScore: 66, needsAttention: 4 });
	});

	test('is deterministic and does not mutate input students', () => {
		const students = structuredClone(sampleStudents);
		const snapshot = structuredClone(students);
		for (const student of students) Object.freeze(student);
		Object.freeze(students);
		const first = studentMetrics(students);
		expect(first).toEqual(studentMetrics(students));
		first.total = 999;
		expect(studentMetrics(students).total).toBe(snapshot.length);
		expect(students).toEqual(snapshot);
	});
});

describe('chartPoints', () => {
	test('returns an empty string for an empty series', () => {
		expect(chartPoints([])).toBe('');
		expect(chartPoints([], 240, 95)).toBe('');
	});

	test('places a single positive value at the left edge with finite coordinates', () => {
		expect(chartPoints([42])).toBe('0,15');
		expect(chartPoints([42], 240, 95)).toBe('0,15');
		expect(parsePoints(chartPoints([42])).flat().every(Number.isFinite)).toBe(true);
	});

	test('keeps a single zero or an all-zero series on the baseline', () => {
		expect(chartPoints([0])).toBe('0,150');
		expect(chartPoints([0, 0, 0])).toBe('0,150 300,150 600,150');
	});

	test('spaces default-width points evenly and scales values with 15 pixels of headroom', () => {
		expect(chartPoints([0, 1, 2])).toBe('0,150 300,82.5 600,15');
		expect(chartPoints([2, 1, 0])).toBe('0,15 300,82.5 600,150');
	});

	test('uses custom dimensions and supports fractional values', () => {
		expect(chartPoints([0, 2, 4], 240, 95)).toBe('0,95 120,55 240,15');
		expect(chartPoints([0, 0.5, 1])).toBe('0,150 300,82.5 600,15');
	});

	for (const period of ['week', 'month'] as const) {
		test(`produces finite in-bounds points for the ${period} fixture without mutation`, () => {
			const values = [...activitySeries[period]];
			const snapshot = [...values];
			Object.freeze(values);
			const points = parsePoints(chartPoints(values));
			expect(points).toHaveLength(values.length);
			for (const [index, point] of points.entries()) {
				expect(point).toHaveLength(2);
				const [x, y] = point;
				expect(Number.isFinite(x)).toBe(true);
				expect(Number.isFinite(y)).toBe(true);
				expect(x).toBeCloseTo(index / (values.length - 1) * 600, 10);
				expect(y).toBeGreaterThanOrEqual(15);
				expect(y).toBeLessThanOrEqual(150);
			}
			expect(points[0][0]).toBe(0);
			expect(points.at(-1)?.[0]).toBe(600);
			expect(Math.min(...points.map(([, y]) => y))).toBe(15);
			expect(values).toEqual(snapshot);
		});
	}
});

describe('previewLink', () => {
	for (const kind of ['payment', 'invitation'] as const) {
		test(`${kind} links use HTTPS on the nonresolving .invalid preview domain`, () => {
			const url = new URL(previewLink(kind, 1));
			expect(url.protocol).toBe('https:');
			expect(url.hostname).toBe('preview.example.invalid');
			expect(url.hostname.endsWith('.invalid')).toBe(true);
			expect(url.pathname).toBe(`/${kind}/demo-001`);
			expect(url.username).toBe('');
			expect(url.password).toBe('');
			expect(url.search).toBe('');
			expect(url.hash).toBe('');
		});

		test(`${kind} links pad short sequences without truncating longer ones`, () => {
			for (const [sequence, suffix] of [[1, '001'], [2, '002'], [10, '010'], [100, '100'], [1000, '1000']] as const) {
				expect(previewLink(kind, sequence)).toBe(`https://preview.example.invalid/${kind}/demo-${suffix}`);
			}
		});
	}

	test('keeps namespaces and sequences distinct and is deterministic', () => {
		const links = ['payment', 'invitation'].flatMap((kind) =>
			[1, 2, 10, 100, 1000].map((sequence) => previewLink(kind as 'payment' | 'invitation', sequence))
		);
		expect(new Set(links).size).toBe(links.length);
		expect(previewLink('payment', 1)).toBe(previewLink('payment', 1));
		expect(previewLink('payment', 1)).not.toBe(previewLink('invitation', 1));
		expect(previewLink('invitation', 1)).not.toBe(previewLink('invitation', 2));
	});
});
