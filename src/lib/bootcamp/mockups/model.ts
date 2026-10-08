import { depositCents, priceCents } from '../types';
import { parseEventSchedule } from '../rules';

export type PreviewStudent = { id: string; name: string; email: string; classType: 'basic' | 'regular' };
export const classTypes = ['basic', 'regular'] as const;

export function registrationCoverage(rows: ReturnType<typeof previewRows>) {
	return classTypes.map(classType => {
		const students = rows.filter(row => row.classType === classType);
		const registered = students.filter(row => row.registered).length;
		return { classType, registered, total: students.length, percent: students.length ? Math.round(registered / students.length * 100) : 0 };
	});
}
export type PreviewStep = 'list' | 'activate' | 'edit' | 'report';
export type PreviewDesign = 'editorial' | 'board' | 'ledger';
export const previewSteps = (activated: boolean): PreviewStep[] => ['list', activated ? 'edit' : 'activate', 'report'];
export const designs: PreviewDesign[] = ['editorial', 'board', 'ledger'];
export const seedEvent = () => ({
	title: '', venue: '', date: '2026-11-14', start: '09:00', end: '16:00',
	activated: false, open: false, revision: 1
});

export type PreviewEvent = ReturnType<typeof seedEvent>;

export function canOpenPreviewRegistration(event: PreviewEvent, now = new Date()): boolean {
	const schedule = parseEventSchedule(event.date, event.start, event.end);
	return Boolean(event.activated && schedule && schedule.registrationClosesAt > now);
}

export function savePreviewEvent(draft: PreviewEvent, current: PreviewEvent, now = new Date()): PreviewEvent | null {
	const schedule = parseEventSchedule(draft.date, draft.start, draft.end);
	if (!schedule || (!current.activated && schedule.registrationClosesAt <= now)) return null;
	const open = current.activated
		? current.open && canOpenPreviewRegistration(current, now) && schedule.registrationClosesAt > now
		: true;
	return { ...draft, activated: true, open, revision: current.revision + 1 };
}

export function previewRows(roster: PreviewStudent[]) {
	const registeredCount = Math.floor(roster.length / 2);
	return roster.map((student, index) => {
		const registered = index < registeredCount;
		const paidCents = registered ? (index % 3 === 0 ? priceCents : depositCents) : 0;
		return { ...student, registered, paidCents, remainingCents: registered ? priceCents - paidCents : 0 };
	});
}
