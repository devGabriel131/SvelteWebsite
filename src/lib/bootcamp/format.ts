import type { Language } from '../i18n/translations';
import { eventTimeZone } from './types';

export function formatMoney(cents: number, language: Language): string {
	return new Intl.NumberFormat(language === 'es' ? 'es-PR' : 'en-US', {
		style: 'currency', currency: 'USD'
	}).format(cents / 100);
}

export function formatAdminEventTime(value: string | Date, language: Language): string {
	return new Intl.DateTimeFormat(language === 'es' ? 'es-PR' : 'en-US', {
		dateStyle: 'medium', timeStyle: 'short', timeZone: eventTimeZone, hourCycle: 'h23'
	}).format(typeof value === 'string' ? new Date(value) : value);
}
