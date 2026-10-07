import { eventTimeZone, depositCents, priceCents, type BootcampEvent, type RegistrationStatus } from './types';

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
	return event.registrationOpen && event.legalApproved && now.getTime() < Date.parse(event.registrationClosesAt) && now.getTime() <= Date.parse(event.endsAt);
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
