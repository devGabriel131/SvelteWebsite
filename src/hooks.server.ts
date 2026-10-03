import type { Handle } from '@sveltejs/kit/hooks';
import { languageCookie, resolveLanguage } from '#lib/i18n/translations.ts';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.language = resolveLanguage(event.cookies.get(languageCookie));

	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%language%', event.locals.language)
	});
};
