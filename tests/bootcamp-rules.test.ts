import { describe, expect, test } from 'bun:test';
import { balance, csvCell, isAdult, parseEventSchedule, registrationAvailable, registrationStatus, signingDate, validBirthDate } from '../src/lib/bootcamp/rules';
import { depositCents, eventTimeZone, priceCents, type BootcampEvent } from '../src/lib/bootcamp/types';

const now = new Date('2026-10-06T04:00:00.000Z');
function event(overrides: Partial<BootcampEvent> = {}): BootcampEvent {
	return {
		id: 'a13e4517-2bc9-4abc-8def-0123456789ab', revision: 1,
		title: 'Bootcamp', venue: 'San Juan',
		startsAt: '2026-10-10T12:00:00.000Z', endsAt: '2026-10-10T20:00:00.000Z',
		arrivalAt: '2026-10-10T11:30:00.000Z', registrationClosesAt: '2026-10-09T04:00:00.000Z',
		registrationOpen: true,
		legal: {
			en: { agreement: 'Agreement', liability: 'Liability', media: 'Media' },
			es: { agreement: 'Acuerdo', liability: 'Relevo', media: 'Imagen' }
		},
		...overrides
	};
}

describe('one-day Puerto Rico admin schedules', () => {
	test.each(['2026-01-10', '2026-07-10', '2000-02-29', '2024-02-29'])(
		'uses the fixed UTC-04:00 offset on %s and derives check-in and registration closure', (eventDate) => {
			const schedule = parseEventSchedule(eventDate, '13:15', '18:00');
			expect(schedule).toEqual({
				startsAt: new Date(`${eventDate}T17:15:00.000Z`), endsAt: new Date(`${eventDate}T22:00:00.000Z`),
				arrivalAt: new Date(`${eventDate}T16:15:00.000Z`), registrationClosesAt: new Date(`${eventDate}T05:15:00.000Z`)
			});
			expect(schedule!.startsAt.getTime() - schedule!.arrivalAt.getTime()).toBe(3_600_000);
			expect(schedule!.startsAt.getTime() - schedule!.registrationClosesAt.getTime()).toBe(43_200_000);
		}
	);

	test.each(['2026-03-08', '2026-11-01'])(
		'does not skip or repeat Puerto Rico hours on mainland DST transition %s', (eventDate) => {
			expect(parseEventSchedule(eventDate, '01:30', '03:30')).toMatchObject({
				startsAt: new Date(`${eventDate}T05:30:00.000Z`), endsAt: new Date(`${eventDate}T07:30:00.000Z`),
				arrivalAt: new Date(`${eventDate}T04:30:00.000Z`)
			});
			expect(parseEventSchedule(eventDate, '02:30', '03:30')?.startsAt.toISOString()).toBe(`${eventDate}T06:30:00.000Z`);
		}
	);

	test.each([
		['2027-01-01', '2026-12-31'], ['2026-03-01', '2026-02-28'],
		['2024-03-01', '2024-02-29'], ['2024-02-29', '2024-02-28'], ['2026-10-10', '2026-10-09']
	])('derives prior-day check-in and closure for %s across calendar boundaries', (eventDate, previousDate) => {
		const schedule = parseEventSchedule(eventDate, '00:30', '08:00');
		expect(schedule).toEqual({
			startsAt: new Date(`${eventDate}T04:30:00.000Z`), endsAt: new Date(`${eventDate}T12:00:00.000Z`),
			arrivalAt: new Date(`${previousDate}T23:30:00-04:00`), registrationClosesAt: new Date(`${previousDate}T12:30:00-04:00`)
		});
		expect(signingDate(schedule!.arrivalAt)).toBe(previousDate);
		expect(signingDate(schedule!.registrationClosesAt)).toBe(previousDate);
	});

	test('a single Puerto Rico date can cross midnight and New Year in UTC', () => {
		expect(parseEventSchedule('2026-12-31', '19:30', '23:59')).toEqual({
			startsAt: new Date('2026-12-31T23:30:00.000Z'), endsAt: new Date('2027-01-01T03:59:00.000Z'),
			arrivalAt: new Date('2026-12-31T22:30:00.000Z'), registrationClosesAt: new Date('2026-12-31T11:30:00.000Z')
		});
	});

	test('accepts minute precision from 00:00 through 23:59 and a one-minute event', () => {
		expect(parseEventSchedule('2026-10-10', '00:00', '23:59')).toEqual({
			startsAt: new Date('2026-10-10T04:00:00.000Z'), endsAt: new Date('2026-10-11T03:59:00.000Z'),
			arrivalAt: new Date('2026-10-10T03:00:00.000Z'), registrationClosesAt: new Date('2026-10-09T16:00:00.000Z')
		});
		const schedule = parseEventSchedule('2026-10-10', '08:00', '08:01');
		expect(schedule).not.toBeNull();
		expect(schedule!.endsAt.getTime() - schedule!.startsAt.getTime()).toBe(60_000);
	});

	test.each([
		'', ' ', '1900-02-29', '2100-02-29', '2026-02-29', '2027-02-29', '2024-02-30', '2026-04-31',
		'2026-00-10', '2026-13-10', '2026-10-00', '2026-10-32', '2026-1-10', '2026-10-1',
		'26-10-10', '10000-10-10', '2026/10/10', '10/10/2026', '2026-10-10T08:00',
		'2026-10-10Z', ' 2026-10-10', '2026-10-10 ', '2026-10-10\n', '2026-10-10\0'
	])('rejects noncanonical or impossible event date %j instead of rolling it forward', (eventDate) => {
		expect(parseEventSchedule(eventDate, '08:00', '16:00')).toBeNull();
	});

	test.each([
		'', ' ', '8:00', '08:0', '008:00', '0800', '8 AM', '08:00 AM', '08.00',
		'24:00', '25:00', '12:60', '-01:00', '08:00:00', '08:00:01', '08:00:00.001',
		'08:00Z', '08:00-04:00', '2026-10-10T08:00', ' 08:00', '08:00 ', '08:00\n', '08:00\0'
	])('rejects noncanonical or impossible time %j in either field, including seconds', (time) => {
		expect(parseEventSchedule('2026-10-10', time, '23:59')).toBeNull();
		expect(parseEventSchedule('2026-10-10', '00:00', time)).toBeNull();
	});

	test.each([['08:00', '08:00'], ['08:00', '07:59'], ['23:00', '01:00'], ['23:59', '00:00']])(
		'rejects equal, reversed or overnight range %s–%s instead of moving the end to tomorrow', (startTime, endTime) => {
			expect(parseEventSchedule('2026-10-10', startTime, endTime)).toBeNull();
		}
	);
});

describe('Puerto Rico signing dates and the 21-year eligibility boundary', () => {
	test('uses Puerto Rico, not UTC or a US timezone with daylight saving time', () => {
		expect(eventTimeZone).toBe('America/Puerto_Rico');
		for (const [instant, expected] of [
			['2026-01-01T03:59:59.999Z', '2025-12-31'],
			['2026-01-01T04:00:00.000Z', '2026-01-01'],
			['2026-07-01T03:59:59.999Z', '2026-06-30'],
			['2026-07-01T04:00:00.000Z', '2026-07-01'],
			['2024-03-01T03:59:59.999Z', '2024-02-29']
		]) expect(signingDate(new Date(instant))).toBe(expected);
	});

	test('turns 21 at Puerto Rico midnight, not four hours earlier at UTC midnight', () => {
		for (const instant of ['2026-10-06T00:00:00.000Z', '2026-10-06T03:59:59.999Z']) {
			expect(isAdult('2005-10-06', new Date(instant))).toBe(false);
		}
		expect(isAdult('2005-10-06', now)).toBe(true);
		expect(isAdult('2005-10-07', now)).toBe(false);
		expect(isAdult('2005-10-05', now)).toBe(true);
	});

	test('does not substitute an 18-year threshold or accept a missing birthday', () => {
		for (const birthday of [null, '', '2006-10-06', '2008-10-06', '2026-10-06']) {
			expect(isAdult(birthday, now)).toBe(false);
		}
		expect(isAdult('1900-01-01', now)).toBe(true);
	});

	test('a February 29 birthday reaches 21 on March 1 in a non-leap year', () => {
		for (const instant of ['2025-02-28T04:00:00.000Z', '2025-03-01T03:59:59.999Z']) {
			expect(isAdult('2004-02-29', new Date(instant))).toBe(false);
		}
		expect(isAdult('2004-02-29', new Date('2025-03-01T04:00:00.000Z'))).toBe(true);
	});

	test.each(['1900-01-01', '2000-02-29', '2004-02-29', '2005-10-06', '2026-10-06'])(
		'accepts real canonical birth date %s', (value) => {
			expect(validBirthDate(value, now)).toBe(true);
		}
	);

	test.each([
		'', ' ', '1899-12-31', '0000-01-01', '2026-10-07', '2099-01-01',
		'1900-02-29', '2005-02-29', '2004-02-30', '2005-04-31', '2005-00-01', '2005-13-01',
		'2005-01-00', '2005-01-32', '2005-1-01', '2005-01-1', '05-01-01', '10000-01-01',
		'10/06/2005', '2005/10/06', '2005-10-06T00:00:00Z', '2005-10-06Z',
		' 2005-10-06', '2005-10-06 ', '2005-10-06\n', '2005-10-06\0'
	])('rejects invalid birth date %j without allowing an adult-age bypass', (value) => {
		expect(validBirthDate(value, now)).toBe(false);
		expect(isAdult(value, now)).toBe(false);
	});

	test('a date that is today in UTC is still a future birthday in Puerto Rico', () => {
		expect(validBirthDate('2026-10-06', new Date('2026-10-06T03:59:59.999Z'))).toBe(false);
		expect(validBirthDate('2026-10-06', now)).toBe(true);
	});
});

describe('bootcamp registration availability', () => {
	test('requires open registration', () => {
		for (const registrationOpen of [false, true]) {
			expect(registrationAvailable(event({ registrationOpen }), now)).toBe(registrationOpen);
		}
	});

	test('closes exactly at the registration deadline', () => {
		const current = event();
		expect(registrationAvailable(current, new Date('2026-10-09T03:59:59.999Z'))).toBe(true);
		expect(registrationAvailable(current, new Date(current.registrationClosesAt))).toBe(false);
		expect(registrationAvailable(current, new Date('2026-10-09T04:00:00.001Z'))).toBe(false);
	});

	test('independently bounds availability at the event end, inclusively', () => {
		// Isolate the end-time guard even for a legacy event whose deadline is later.
		const current = event({ registrationClosesAt: '2026-10-11T04:00:00.000Z' });
		expect(registrationAvailable(current, new Date('2026-10-10T19:59:59.999Z'))).toBe(true);
		expect(registrationAvailable(current, new Date(current.endsAt))).toBe(true);
		expect(registrationAvailable(current, new Date('2026-10-10T20:00:00.001Z'))).toBe(false);
	});

	test('compares instants rather than timestamp strings', () => {
		const current = event({ registrationClosesAt: '2026-10-09T00:00:00-04:00' });
		expect(registrationAvailable(current, new Date('2026-10-09T03:59:59.999Z'))).toBe(true);
		expect(registrationAvailable(current, new Date('2026-10-09T04:00:00.000Z'))).toBe(false);
	});

	test('fails closed for invalid availability timestamps or an invalid clock', () => {
		for (const key of ['registrationClosesAt', 'endsAt'] as const) {
			for (const value of ['', 'not a date']) expect(registrationAvailable(event({ [key]: value }), now)).toBe(false);
		}
		expect(registrationAvailable(event(), new Date(NaN))).toBe(false);
	});
});

describe('registration progress and deposit/full payment balances', () => {
	test('pins the $15 deposit and $30 full price in integer cents', () => {
		expect(depositCents).toBe(1500);
		expect(priceCents).toBe(3000);
	});

	test('advances only through the outstanding registration, waiver, and letter steps', () => {
		for (const paid of [0, 1, 1499]) {
			for (const choice of [null, false, true]) {
				expect(registrationStatus(false, false, choice, paid)).toBe('not_started');
				expect(registrationStatus(false, true, choice, paid)).toBe('not_started');
				expect(registrationStatus(true, false, choice, paid)).toBe('waiver');
			}
			expect(registrationStatus(true, true, null, paid)).toBe('letter');
			expect(registrationStatus(true, true, false, paid)).toBe('payment');
			expect(registrationStatus(true, true, true, paid)).toBe('payment');
		}
	});

	test('a deposit or full payment confirms registration regardless of earlier progress flags', () => {
		for (const paid of [1500, 1501, 2999, 3000, 4500]) {
			for (const registered of [false, true]) for (const waiver of [false, true]) for (const choice of [null, false, true]) {
				expect(registrationStatus(registered, waiver, choice, paid)).toBe('confirmed');
			}
		}
	});

	test.each([[0, 3000], [1, 2999], [1499, 1501], [1500, 1500], [2999, 1], [3000, 0], [4500, 0]])(
		'%i cents paid leaves %i cents due without a negative overpayment balance', (paid, remaining) => {
			expect(balance(paid)).toBe(remaining);
		}
	);
});

describe('CSV export quoting and formula injection protection', () => {
	test.each([
		['', '""'], ['Ana María', '"Ana María"'], ['San Juan, PR', '"San Juan, PR"'],
		['She said "sí"', '"She said ""sí"""'], ['first\nsecond', '"first\nsecond"'],
		['first\r\nsecond', '"first\r\nsecond"'], ['A+B = C', '"A+B = C"'],
		["O'Neill", '"O\'Neill"'], ["'=1+1", '"\'=1+1"'], [0, '"0"'], [1500, '"1500"']
	] as const)('quotes ordinary cell %j without changing its content', (value, expected) => {
		expect(csvCell(value)).toBe(expected);
	});

	test('neutralizes every formula prefix, including leading whitespace and embedded quotes', () => {
		for (const prefix of ['=', '+', '-', '@']) for (const whitespace of ['', ' ', '\t', '\r', '\n', '\r\n', ' \t ', '\u00a0', '\u2003']) {
			const value = `${whitespace}${prefix}HYPERLINK("https://example.test","open")`;
			expect(csvCell(value)).toBe(`"'${value.replace(/"/g, '""')}"`);
		}
	});

	test('neutralizes leading tab/newline cells and negative numeric cells as well', () => {
		for (const value of ['\tordinary', '\rordinary', '\nordinary', '\r\nordinary', '\t', -1500]) {
			expect(csvCell(value)).toBe(`"'${value}"`);
		}
	});
});
