import { describe, expect, test } from 'bun:test';
import { registrationCoverage, previewRows, previewSteps, savePreviewEvent, seedEvent, type PreviewStudent } from '../src/lib/bootcamp/mockups/model';
import { parseEventSchedule } from '../src/lib/bootcamp/rules';
import { depositCents, priceCents } from '../src/lib/bootcamp/types';

const roster = (count: number): PreviewStudent[] => Array.from({ length: count }, (_, index) => ({
	id: `student-${index}`, name: `Student ${index}`, email: `student-${index}@example.test`, classType: index % 2 === 0 ? 'basic' : 'regular'
}));

describe('bootcamp mockup roster', () => {
	test('counts Basic and Regular signups against their own class roster', () => {
		expect(registrationCoverage(previewRows(roster(10)))).toEqual([
			{ classType: 'basic', registered: 3, total: 5, percent: 60 },
			{ classType: 'regular', registered: 2, total: 5, percent: 40 }
		]);
	});

	test('handles an empty class without invalid coverage percentages', () => {
		expect(registrationCoverage(previewRows(roster(1)))).toEqual([
			{ classType: 'basic', registered: 0, total: 1, percent: 0 },
			{ classType: 'regular', registered: 0, total: 0, percent: 0 }
		]);
	});
	test.each([0, 1, 2, 5, 12, 21])('registers floor of half a roster of %i', count => {
		const students = roster(count);
		const rows = previewRows(students);
		expect(rows).toHaveLength(count);
		expect(rows.filter(row => row.registered)).toHaveLength(Math.floor(count / 2));
		expect(rows.filter(row => row.registered).map(row => row.id))
			.toEqual(students.slice(0, Math.floor(count / 2)).map(student => student.id));
	});

	test('payment distribution is deterministic and does not mutate the roster', () => {
		const students = roster(12);
		const original = structuredClone(students);
		const rows = previewRows(students);
		expect(previewRows(students)).toEqual(rows);
		expect(students).toEqual(original);
		expect(rows.slice(0, 6).map(row => row.paidCents))
			.toEqual([priceCents, depositCents, depositCents, priceCents, depositCents, depositCents]);
		for (const row of rows.filter(row => row.registered)) {
			expect(row.paidCents + row.remainingCents).toBe(priceCents);
		}
	});

	test('nonregistrants have no payments or balances', () => {
		for (const count of [1, 5, 12, 21]) {
			for (const row of previewRows(roster(count)).filter(row => !row.registered)) {
				expect(row.paidCents).toBe(0);
				expect(row.remainingCents).toBe(0);
			}
		}
	});
});

describe('bootcamp mockup schedules', () => {
	test('activation becomes editing and rescheduling preserves the activated state', () => {
		const initial = seedEvent();
		expect(initial.activated).toBe(false);
		expect(previewSteps(initial.activated)).toEqual(['list', 'activate', 'report']);
		const activated = savePreviewEvent(initial, initial.revision)!;
		expect(activated.activated).toBe(true);
		expect(previewSteps(activated.activated)).toEqual(['list', 'edit', 'report']);
		const rescheduled = savePreviewEvent({ ...activated, date: '2026-12-05' }, activated.revision)!;
		expect(rescheduled.date).toBe('2026-12-05');
		expect(rescheduled.activated).toBe(true);
		expect(rescheduled.open).toBe(false);
	});
	test('uses one-hour check-in and twelve-hour registration cutoff across midnight', () => {
		const event = { ...seedEvent(), start: '00:30', end: '09:00' };
		const schedule = parseEventSchedule(event.date, event.start, event.end)!;
		expect(schedule.arrivalAt.toISOString()).toBe('2026-11-14T03:30:00.000Z');
		expect(schedule.registrationClosesAt.toISOString()).toBe('2026-11-13T16:30:00.000Z');
		expect(schedule.startsAt.getTime() - schedule.arrivalAt.getTime()).toBe(3_600_000);
		expect(schedule.startsAt.getTime() - schedule.registrationClosesAt.getTime()).toBe(43_200_000);
	});

	test('saving closes registration and increments revision without mutating the draft', () => {
		const draft = { ...seedEvent(), date: '2026-12-05', start: '10:00', end: '17:00' };
		const original = { ...draft };
		expect(savePreviewEvent(draft, 4)).toEqual({ ...draft, activated: true, open: false, revision: 5 });
		expect(draft).toEqual(original);
	});

	test.each([
		{ date: '2026-02-30' }, { start: '24:00' }, { end: '09:00' }, { end: '08:00' }
	])('rejects invalid schedules: %j', changes => {
		expect(savePreviewEvent({ ...seedEvent(), ...changes }, 1)).toBeNull();
	});
});
