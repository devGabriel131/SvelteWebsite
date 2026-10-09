import { describe, expect, test } from 'bun:test';
import type { RequestEvent } from '@sveltejs/kit';
import type { ResolveOptions } from '@sveltejs/kit/hooks';
import { handleLanguage as handle } from '../src/lib/server/language';
import { load } from '../src/routes/+layout.server';
import { formatMessage, languageCookie, languages, resolveLanguage, translations } from '../src/lib/i18n/translations';
import { exerciseKeys } from '../src/lib/ist/types';

function translationEntries(messages: object, prefix = ''): Record<string, string[]> {
	return Object.fromEntries(Object.entries(messages).flatMap<[string, string[]]>(([key, value]) => {
		const path = prefix ? `${prefix}.${key}` : key;
		if (typeof value === 'string') {
			expect(value.trim().length).toBeGreaterThan(0);
			return [[path, [...new Set([...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]))].sort()]];
		}
		return Object.entries(translationEntries(value, path));
	}).sort(([a], [b]) => a.localeCompare(b)));
}

function renderRequest(cookie?: string) {
	const event = {
		request: new Request('http://localhost/'),
		cookies: {
			get(name: string) {
				expect(name).toBe(languageCookie);
				return cookie;
			}
		},
		locals: { user: null, session: null },
		setHeaders(headers: Record<string, string>) {
			expect(headers).toEqual({ 'cache-control': 'private, no-store' });
		}
	} as RequestEvent;

	const response = Promise.resolve(handle({
		event,
		resolve: async (_request: RequestEvent, options?: ResolveOptions) => {
			const html = options!.transformPageChunk!({
				html: '<html lang="%language%"><body>Dashboard</body></html>',
				done: true
			});
			return new Response(await html);
		}
	}));

	return { event, response };
}

describe('translations', () => {
	test('English and Spanish have identical nonempty keys and placeholder sets', () => {
		expect(translationEntries(translations.es)).toEqual(translationEntries(translations.en));
	});

	test('each selector option has translations and the requested flag', () => {
		expect(languages.map(({ code }) => code)).toEqual(['en', 'es']);
		expect(languages.map(({ flag }) => flag)).toEqual(['🇺🇸', '🇵🇷']);
		for (const { code } of languages) {
			expect(translations[code]).toBeDefined();
		}
	});

	test('keeps exercise names in English in both languages', () => {
		for (const key of exerciseKeys) {
			expect(translations.es.ist.categories[key]).toBe(translations.en.ist.categories[key]);
		}
		expect(translations.es.ist.categories.bodyFat).toBe('Grasa corporal estimada');
	});

	test('grade labels accept the caller-provided score in both languages', () => {
		for (const { code } of languages) {
			const messages = translations[code].home.grades;
			expect(formatMessage(messages.score, { score: 78 })).toContain('78');
			expect(formatMessage(messages.scoreText, { score: 78 })).toContain('78');
			expect(formatMessage(messages.scoreText, { score: 78 })).not.toContain('{');
		}
	});

	test('math challenge labels accept the operation and duration', () => {
		for (const { code } of languages) {
			const messages = translations[code].speedMath;
			const label = formatMessage(messages.challengeLabel, { operation: messages.operations.division, minutes: 15 });
			expect(label).toContain(messages.operations.division);
			expect(label).toContain('15');
			expect(label).not.toContain('{');
		}
	});

	test('provides bootcamp report navigation and event-specific accessible labels in both languages', () => {
		for (const { code } of languages) {
			const messages = translations[code].bootcamp.admin;
			const label = formatMessage(messages.viewReportFor, { title: 'Bootcamp de octubre' });
			expect(label).toContain('Bootcamp de octubre');
			expect(label).not.toContain('{title}');
		}
	});

	test('keeps the product name unchanged in both languages', () => {
		for (const { code } of languages) {
			expect(translations[code].header.brand).toBe('Masterminds');
			expect(translations[code].header.brandDescription).toBe('Programa ASVAB');
		}
	});
});

describe('translated message formatting', () => {
	test('inserts numbers and text without changing untranslated placeholders', () => {
		expect(formatMessage('Card {current} of {total}', { current: 3, total: 25 })).toBe('Card 3 of 25');
		expect(formatMessage('{word} · {word}', { word: 'tú' })).toBe('tú · tú');
		expect(formatMessage('{missing}', {})).toBe('{missing}');
	});

	test('formats the adaptive frequency interface in both languages', () => {
		for (const { code } of languages) {
			const messages = translations[code].frequency;
			const labels: [string, Record<string, string | number>][] = [
				[messages.roundLabel, { round: 2 }],
				[messages.roundSize, { count: 25 }],
				[messages.startHint, { count: 25 }],
				[messages.currentPass, { pass: 2 }],
				[messages.poolProgress, { count: 14, total: '1,001', percent: '1.4' }],
				[messages.answeredProgress, { answered: 23, total: 25 }],
				[messages.cardProgress, { current: 3, total: 25 }],
				[messages.completeMessage, { correct: 20, total: 25 }]
			];
			for (const [message, values] of labels) {
				const label = formatMessage(message, values);
				for (const value of Object.values(values)) expect(label).toContain(String(value));
				expect(label).not.toContain('{');
			}
			expect(messages.englishShort).toBe('EN');
			expect(messages.spanishShort).toBe('ES');
		}
	});
});


describe('language preference', () => {
	test('accepts English and Spanish cookies', () => {
		expect(resolveLanguage('en')).toBe('en');
		expect(resolveLanguage('es')).toBe('es');
	});

	test('defaults to English for missing or unsupported cookies', () => {
		for (const value of [undefined, '', 'fr', 'ES', '<script>']) {
			expect(resolveLanguage(value)).toBe('en');
		}
	});

	test('renders the document language from the saved preference', async () => {
		const { event, response } = renderRequest('es');
		expect(event.locals.language).toBe('es');
		expect(await (await response).text()).toContain('<html lang="es">');
		expect(await load(event as Parameters<typeof load>[0])).toEqual({ language: 'es', viewer: null });
	});

	test('renders English for first visits and invalid cookies', async () => {
		for (const cookie of [undefined, 'unsupported', '"><script>']) {
			const { event, response } = renderRequest(cookie);
			expect(event.locals.language).toBe('en');
			expect(await (await response).text()).toContain('<html lang="en">');
		}
	});

	test('isolates language preferences between concurrent requests', async () => {
		const spanish = renderRequest('es');
		const english = renderRequest('en');
		const [spanishHtml, englishHtml] = await Promise.all([
			spanish.response.then((response) => response.text()),
			english.response.then((response) => response.text())
		]);

		expect(spanishHtml).toContain('<html lang="es">');
		expect(englishHtml).toContain('<html lang="en">');
		expect(spanish.event.locals.language).toBe('es');
		expect(english.event.locals.language).toBe('en');
	});
});
