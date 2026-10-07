import { building } from '$app/env';
import { sequence } from '@sveltejs/kit/hooks';
import { handleLanguage } from '#lib/server/language.ts';
import { getAuth, getLocalAdminEnabled } from '#lib/server/auth/index.ts';
import { createAuthHandle } from '#lib/server/auth/handle.ts';

export const handle = sequence(
	({ event, resolve }) => {
		event.locals.localAdmin = getLocalAdminEnabled();
		return resolve(event);
	},
	handleLanguage,
	createAuthHandle(getAuth, building)
);
