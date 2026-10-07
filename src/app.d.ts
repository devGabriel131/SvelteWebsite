import type { Language } from '#lib/i18n/translations.ts';
import type { Auth } from '#lib/server/auth/core.ts';

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			language: Language;
			localAdmin?: boolean;
			user: Auth['$Infer']['Session']['user'] | null;
			session: Auth['$Infer']['Session']['session'] | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
