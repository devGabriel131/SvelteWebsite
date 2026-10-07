import { describe, expect, test } from "bun:test";
import { activitySeries, chartPoints, previewLink } from "../src/lib/admin/demo";

function parsePoints(points: string): number[][] {
	return points.split(' ').map((point) => point.split(',').map(Number));
}

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
