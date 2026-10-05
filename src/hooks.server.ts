import { building } from '$app/env';
import { sequence } from '@sveltejs/kit/hooks';
import { handleLanguage } from '#lib/server/language.ts';
import { getAuth } from '#lib/server/auth/index.ts';
import { createAuthHandle } from '#lib/server/auth/handle.ts';

export const handle = sequence(handleLanguage, createAuthHandle(getAuth, building));
