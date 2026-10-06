import { describe, expect, test } from 'bun:test';
import type { RequestEvent } from '@sveltejs/kit';
import type { ResolveOptions } from '@sveltejs/kit/hooks';
import { handleLanguage as handle } from '../src/lib/server/language';
import { load } from '../src/routes/+layout.server';
import { formatMessage, languageCookie, languages, resolveLanguage, translations } from '../src/lib/i18n/translations';
import { exerciseKeys } from '../src/lib/ist/types';

function translationKeys(messages: object, prefix = ''): string[] {
	return Object.entries(messages).flatMap(([key, value]) => {
		const path = prefix ? `${prefix}.${key}` : key;

		if (typeof value === 'string') {
			expect(value.trim().length).toBeGreaterThan(0);
			return [path];
		}

		return translationKeys(value, path);
	}).sort();
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

	const response = handle({
		event,
		resolve: async (_request: RequestEvent, options?: ResolveOptions) => {
			const html = options!.transformPageChunk!({
				html: '<html lang="%language%"><body>Dashboard</body></html>',
				done: true
			});
			return new Response(await html);
		}
	});

	return { event, response };
}

describe('translations', () => {
	test('English and Spanish have the same nonempty translation keys', () => {
		expect(translationKeys(translations.es)).toEqual(translationKeys(translations.en));
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

	test('labels the four grade rings in test order in both languages', () => {
		for (const { code } of languages) {
			const messages = translations[code].designPreview.focus;
			expect(Object.keys(messages.subjects)).toEqual(['wk', 'pc', 'mk', 'ar']);
			expect(Object.values(messages.subjects).map(({ code }) => code)).toEqual(['WK', 'PC', 'MK', 'AR']);
			expect(formatMessage(messages.score, { score: 78 })).toContain('78');
			expect(formatMessage(messages.scoreText, { score: 78 })).not.toContain('{');
			expect(messages.sampleData.length).toBeGreaterThan(0);
			expect(messages.sampleNote).toContain('ASVAB');
		}
	});

	test('provides Speed Math setup, session, and results copy in both languages', () => {
		for (const { code } of languages) {
			const messages = translations[code].speedMath;
			for (const key of ['briefingTitle', 'sessionTitle', 'ready', 'live', 'timerHint', 'minuteUnit', 'accuracyFirst', 'keyboardHint', 'resultsHint'] as const) {
				expect(messages[key].trim().length).toBeGreaterThan(0);
			}
			expect(formatMessage(messages.challengeLabel, { operation: messages.operations.division, minutes: 15 })).not.toContain('{');
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
			expect(formatMessage(messages.roundLabel, { round: 2 })).not.toContain('{');
			expect(formatMessage(messages.roundSize, { count: 25 })).not.toContain('{');
			expect(formatMessage(messages.startHint, { count: 25 })).not.toContain('{');
			expect(formatMessage(messages.currentPass, { pass: 2 })).not.toContain('{');
			expect(formatMessage(messages.poolProgress, { count: 20, total: 1001, percent: 2 })).not.toContain('{');
			expect(formatMessage(messages.answeredProgress, { answered: 25, total: 25 })).not.toContain('{');
			expect(formatMessage(messages.cardProgress, { current: 3, total: 25 })).not.toContain('{');
			expect(formatMessage(messages.completeMessage, { correct: 20, total: 25 })).not.toContain('{');
			expect(messages.englishShort).toBe('EN');
			expect(messages.spanishShort).toBe('ES');
		}
	});
});

describe('frequency start screen', () => {
	test('provides a start button and ready prompt in both languages', () => {
		expect(translations.en.frequency.startRound).toBe('Start round');
		expect(translations.es.frequency.startRound).toBe('Empezar ronda');
		for (const { code } of languages) {
			expect(translations[code].frequency.readyTitle.length).toBeGreaterThan(0);
			expect(formatMessage(translations[code].frequency.startHint, { count: 25 })).toContain('25');
		}
	});
});

describe('frequency round numbering', () => {
	test.each([1, 2, 15])('labels round %i in both languages', (round) => {
		expect(formatMessage(translations.en.frequency.roundLabel, { round })).toBe(`Round ${round}`);
		expect(formatMessage(translations.es.frequency.roundLabel, { round })).toBe(`Ronda ${round}`);
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
