import { describe, expect, test } from 'bun:test';
import { canOpenPreviewRegistration, registrationCoverage, previewRows, previewSteps, savePreviewEvent, seedEvent, type PreviewStudent } from '../src/lib/bootcamp/mockups/model';
import { parseEventSchedule } from '../src/lib/bootcamp/rules';
import { depositCents, priceCents } from '../src/lib/bootcamp/types';
import { translations } from '../src/lib/i18n/translations';

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
	// Keep the November fixture and test clock fixed so historical previews do not depend on today's date.
	const now = new Date('2026-10-08T12:00:00Z');

	test('activation opens immediately without approval and rescheduling preserves open registration', () => {
		const initial = seedEvent();
		expect(initial.date).toBe('2026-11-14');
		expect(initial.activated).toBe(false);
		expect(initial.open).toBe(false);
		expect(initial).not.toHaveProperty('reviewed');
		expect(previewSteps(initial.activated)).toEqual(['list', 'activate', 'report']);
		const activated = savePreviewEvent(initial, initial, now)!;
		expect(activated.activated).toBe(true);
		expect(activated.open).toBe(true);
		expect(previewSteps(activated.activated)).toEqual(['list', 'edit', 'report']);
		const rescheduled = savePreviewEvent({ ...activated, date: '2026-12-05' }, activated, now)!;
		expect(rescheduled.date).toBe('2026-12-05');
		expect(rescheduled.activated).toBe(true);
		expect(rescheduled.open).toBe(true);
	});
	test('uses one-hour check-in and twelve-hour registration cutoff across midnight', () => {
		const event = { ...seedEvent(), start: '00:30', end: '09:00' };
		const schedule = parseEventSchedule(event.date, event.start, event.end)!;
		expect(schedule.arrivalAt.toISOString()).toBe('2026-11-14T03:30:00.000Z');
		expect(schedule.registrationClosesAt.toISOString()).toBe('2026-11-13T16:30:00.000Z');
		expect(schedule.startsAt.getTime() - schedule.arrivalAt.getTime()).toBe(3_600_000);
		expect(schedule.startsAt.getTime() - schedule.registrationClosesAt.getTime()).toBe(43_200_000);
	});

	test('saving details preserves open registration and increments revision without mutating either event', () => {
		const current = { ...seedEvent(), activated: true, open: true, revision: 4 };
		const draft = { ...current, title: 'Updated title', venue: 'Updated venue', date: '2026-12-05', start: '10:00', end: '17:00' };
		const original = structuredClone({ current, draft });
		expect(savePreviewEvent(draft, current, now)).toEqual({ ...draft, open: true, revision: 5 });
		expect({ current, draft }).toEqual(original);
	});

	test('editing a closed event cannot reopen it even when the draft requests opening', () => {
		const current = { ...seedEvent(), activated: true, open: false };
		const saved = savePreviewEvent({ ...current, date: '2026-12-05', open: true }, current, now)!;
		expect(saved.open).toBe(false);
		expect(saved.activated).toBe(true);
	});

	test.each([0, 1])('activation is rejected at or after the cutoff (%i ms)', elapsed => {
		const initial = seedEvent();
		const cutoff = parseEventSchedule(initial.date, initial.start, initial.end)!.registrationClosesAt;
		expect(savePreviewEvent(initial, initial, new Date(cutoff.getTime() + elapsed))).toBeNull();
		expect(savePreviewEvent(initial, initial, new Date(cutoff.getTime() - 1))?.open).toBe(true);
	});

	test.each([0, 1])('moving an expired event forward does not reopen it (%i ms after old cutoff)', elapsed => {
		const current = { ...seedEvent(), activated: true, open: true };
		const cutoff = parseEventSchedule(current.date, current.start, current.end)!.registrationClosesAt;
		const saved = savePreviewEvent({ ...current, date: '2026-12-05' }, current, new Date(cutoff.getTime() + elapsed))!;
		expect(saved.date).toBe('2026-12-05');
		expect(saved.open).toBe(false);
	});

	test.each([0, 1])('moving an open event to an expired schedule closes it (%i ms after new cutoff)', elapsed => {
		const current = { ...seedEvent(), activated: true, open: true, date: '2026-12-05' };
		const draft = { ...current, date: '2026-11-14' };
		const cutoff = parseEventSchedule(draft.date, draft.start, draft.end)!.registrationClosesAt;
		expect(savePreviewEvent(draft, current, new Date(cutoff.getTime() + elapsed))?.open).toBe(false);
		expect(savePreviewEvent(draft, current, new Date(cutoff.getTime() - 1))?.open).toBe(true);
	});

	test('editing an expired event remains possible without reopening registration', () => {
		const current = { ...seedEvent(), activated: true, open: true };
		const saved = savePreviewEvent({ ...current, title: 'Historical event' }, current, new Date('2027-01-01T00:00:00Z'))!;
		expect(saved.title).toBe('Historical event');
		expect(saved.open).toBe(false);
	});

	test('opening requires activation and a valid future cutoff, not legal approval', () => {
		const initial = seedEvent();
		const closed = { ...initial, activated: true };
		const cutoff = parseEventSchedule(initial.date, initial.start, initial.end)!.registrationClosesAt;
		expect(canOpenPreviewRegistration(initial, now)).toBe(false);
		expect(canOpenPreviewRegistration(closed, now)).toBe(true);
		expect(canOpenPreviewRegistration(closed, cutoff)).toBe(false);
		expect(canOpenPreviewRegistration({ ...closed, end: '08:00' }, now)).toBe(false);
	});

	test.each([
		{ date: '2026-02-30' }, { start: '24:00' }, { end: '09:00' }, { end: '08:00' }
	])('rejects invalid schedules: %j', changes => {
		expect(savePreviewEvent({ ...seedEvent(), ...changes }, seedEvent(), now)).toBeNull();
	});
});

describe('bootcamp workflow translations', () => {
	test.each(['en', 'es'] as const)('provides distinct actions, conflict feedback, and metadata in %s', language => {
		const { bootcamp, bootcampMockups } = translations[language];
		expect(bootcamp.admin.activate).not.toBe(bootcamp.admin.saveEvent);
		expect(bootcampMockups.create).not.toBe(bootcampMockups.save);
		for (const text of [
			bootcamp.errors.activeEvent, bootcamp.errors.unavailable,
			bootcamp.admin.activateDescription, bootcamp.admin.editDescription,
			bootcamp.admin.activationHint, bootcamp.admin.activationGuard, bootcamp.admin.cutoffPassed,
			bootcampMockups.description, bootcampMockups.activated, bootcampMockups.saved
		]) expect(text.trim().length).toBeGreaterThan(0);
		expect(bootcamp.admin).not.toHaveProperty('legalApproved');
		expect(bootcamp.admin).not.toHaveProperty('legalCustomize');
		expect(bootcampMockups).not.toHaveProperty('approved');
	});
});
