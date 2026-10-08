import type { EmployerDetails } from '../../bootcamp/types';
import { defaultLegalText } from '../../bootcamp/legal';
import { parseEventSchedule } from '../../bootcamp/rules';
import type { Language } from '../../i18n/translations';
import { isSupportedPdfText } from '../../bootcamp/pdf-text';

export type BootcampErrorCode = 'invalid' | 'unavailable' | 'closed' | 'ineligible' | 'stale' | 'notLinked' | 'payment' | 'storage' | 'unsupportedText' | 'activeEvent';
export class BootcampError extends Error {
	constructor(readonly code: BootcampErrorCode) { super(code); this.name = 'BootcampError'; }
}
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function id(value: unknown): string {
	if (typeof value !== 'string' || !uuidPattern.test(value)) throw new BootcampError('invalid');
	return value;
}
export function field(form: FormData, key: string, max = 200): string {
	const value = form.get(key);
	if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) throw new BootcampError('invalid');
	return value.trim().normalize('NFC');
}
export function languageField(form: FormData): Language {
	const value = form.get('language');
	if (value !== 'en' && value !== 'es') throw new BootcampError('invalid');
	return value;
}
export function revisionField(form: FormData): number {
	const value = Number(form.get('revision'));
	if (!Number.isSafeInteger(value) || value < 1) throw new BootcampError('invalid');
	return value;
}
export function eventFields(form: FormData) {
	const schedule = parseEventSchedule(field(form, 'eventDate', 10), field(form, 'startTime', 5), field(form, 'endTime', 5));
	if (!schedule) throw new BootcampError('invalid');
	const { startsAt, endsAt, arrivalAt, registrationClosesAt } = schedule;
	const title = field(form, 'title');
	const venue = field(form, 'venue', 300);
	const legal = defaultLegalText({ venue, startsAt, endsAt, arrivalAt });
	if (![title, venue, ...Object.values(legal.en), ...Object.values(legal.es)].every(isSupportedPdfText)) throw new BootcampError('unsupportedText');
	return {
		title, venue, startsAt, endsAt, arrivalAt, registrationClosesAt,
		legal
	};
}
export function employerFields(form: FormData): EmployerDetails {
	return { employer: field(form, 'employer'), contact: field(form, 'contact'), position: field(form, 'position'), workplace: field(form, 'workplace') };
}

// Bound actual bytes, not just the client-controlled Content-Length header.
export async function readForm(request: Request, limit = 2_300_000): Promise<FormData> {
	const contentType = request.headers.get('content-type') ?? '';
	if (!/^(multipart\/form-data|application\/x-www-form-urlencoded)(;|$)/i.test(contentType)) throw new BootcampError('invalid');
	const reader = request.body?.getReader();
	if (!reader) throw new BootcampError('invalid');
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > limit) { await reader.cancel(); throw new BootcampError('invalid'); }
			chunks.push(value);
		}
		return await new Response(Buffer.concat(chunks), { headers: { 'content-type': contentType } }).formData();
	} catch (error) {
		if (error instanceof BootcampError) throw error;
		throw new BootcampError('invalid');
	} finally { reader.releaseLock(); }
}
