import { describe, expect, test } from 'bun:test';
import type { RequestEvent } from '@sveltejs/kit';
import type { ResolveOptions } from '@sveltejs/kit/hooks';
import { handle } from '../src/hooks.server';
import { load } from '../src/routes/+layout.server';
import { languageCookie, languages, resolveLanguage, translations } from '../src/lib/i18n/translations';

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
		cookies: {
			get(name: string) {
				expect(name).toBe(languageCookie);
				return cookie;
			}
		},
		locals: {}
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

	test('keeps the product name unchanged in both languages', () => {
		for (const { code } of languages) {
			expect(translations[code].header.brand).toBe('Masterminds');
			expect(translations[code].header.brandDescription).toBe('Programa ASVAB');
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
		expect(await load(event as Parameters<typeof load>[0])).toEqual({ language: 'es' });
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
