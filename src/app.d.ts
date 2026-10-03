import type { Language } from '#lib/i18n/translations.ts';

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			language: Language;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
