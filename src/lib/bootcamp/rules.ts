import { eventTimeZone, depositCents, priceCents, type BootcampEvent, type RegistrationStatus } from './types';

export function parseEventLocalDate(raw: string): Date | null {
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(raw)) return null;
	const value = raw.length === 16 ? `${raw}:00` : raw;
	const result = new Date(`${value}-04:00`);
	if (!Number.isFinite(result.getTime()) || new Date(result.getTime() - 4 * 3600000).toISOString().slice(0, 19) !== value) return null;
	return result;
}

export const eventTimePattern = '([01][0-9]|2[0-3]):[0-5][0-9]';
const eventTimeRegex = new RegExp(`^${eventTimePattern}$`);

export function parseEventSchedule(eventDate: string, startTime: string, endTime: string) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !eventTimeRegex.test(startTime) || !eventTimeRegex.test(endTime)) return null;
	const startsAt = parseEventLocalDate(`${eventDate}T${startTime}`);
	const endsAt = parseEventLocalDate(`${eventDate}T${endTime}`);
	if (!startsAt || !endsAt || endsAt <= startsAt) return null;
	return {
		startsAt, endsAt,
		arrivalAt: new Date(startsAt.getTime() - 3600000),
		registrationClosesAt: new Date(startsAt.getTime() - 12 * 3600000)
	};
}

export function signingDate(now: Date): string {
	const parts = new Intl.DateTimeFormat('en-US', { timeZone: eventTimeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
	const part = (key: string) => parts.find((p) => p.type === key)!.value;
	return `${part('year')}-${part('month')}-${part('day')}`;
}

export function validBirthDate(value: string, now = new Date()): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > signingDate(now)) return false;
	const date = new Date(`${value}T12:00:00Z`);
	return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isAdult(value: string | null, now = new Date()): boolean {
	if (!value || !validBirthDate(value, now)) return false;
	const today = signingDate(now);
	const age = Number(today.slice(0, 4)) - Number(value.slice(0, 4)) - (today.slice(5) < value.slice(5) ? 1 : 0);
	return age >= 21;
}

export function registrationAvailable(event: BootcampEvent, now = new Date()): boolean {
	return event.registrationOpen && now.getTime() < Date.parse(event.registrationClosesAt) && now.getTime() <= Date.parse(event.endsAt);
}

export function registrationStatus(registered: boolean, waiver: boolean, letterChoice: boolean | null, paidCents: number): RegistrationStatus {
	if (paidCents >= depositCents) return 'confirmed';
	if (!registered) return 'not_started';
	if (!waiver) return 'waiver';
	return letterChoice === null ? 'letter' : 'payment';
}

export function balance(paidCents: number) { return Math.max(0, priceCents - paidCents); }

export function csvCell(value: string | number): string {
	const text = String(value);
	// Spreadsheet exports must not turn names or employer-entered text into formulas.
	const safe = /^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text;
	return `"${safe.replace(/"/g, '""')}"`;
}
