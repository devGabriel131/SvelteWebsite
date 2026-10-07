import { formatMessage, translations } from '../i18n/translations';
import { depositCents, eventTimeZone, priceCents, sectionKeys, type EventSnapshot, type LegalText } from './types';

type LegalEventDetails = {
	venue: string;
	startsAt: Date | string;
	endsAt: Date | string;
	arrivalAt: Date | string;
};

/** Resolve once when saving an event, never while rendering an already-signed snapshot. */
export function defaultLegalText(event: LegalEventDetails): LegalText {
	const date = new Intl.DateTimeFormat('es-PR', { timeZone: eventTimeZone, dateStyle: 'long' });
	const time = new Intl.DateTimeFormat('es-PR', { timeZone: eventTimeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
	const amount = new Intl.NumberFormat('es-PR', { style: 'currency', currency: 'USD' });
	const start = date.format(new Date(event.startsAt));
	const end = date.format(new Date(event.endsAt));
	const arrivalDate = date.format(new Date(event.arrivalAt));
	const arrivalTime = time.format(new Date(event.arrivalAt));
	const values = {
		eventDate: start === end ? start : `${start} – ${end}`,
		venue: event.venue,
		arrivalTime: arrivalDate === start ? arrivalTime : `${arrivalTime} (${arrivalDate})`,
		startTime: time.format(new Date(event.startsAt)),
		price: amount.format(priceCents / 100),
		deposit: amount.format(depositCents / 100),
		balance: amount.format((priceCents - depositCents) / 100)
	};
	const spanish = {} as LegalText['es'];
	for (const section of sectionKeys) spanish[section] = formatMessage(translations.es.bootcamp.waiver.legalText[section], values);
	// Keep compatibility with historical bilingual snapshots without creating English terms.
	return { es: spanish, en: { ...spanish } };
}

export function usesDefaultLegalText(event: EventSnapshot): boolean {
	const standard = defaultLegalText(event).es;
	return sectionKeys.every((section) => event.legal.es[section] === standard[section]);
}
