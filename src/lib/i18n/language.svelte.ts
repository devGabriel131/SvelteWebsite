import { browser } from '$app/env';
import { resolve } from '$app/paths';
import { getContext, setContext } from 'svelte';
import { languageCookie, translations, type Language, type Messages } from './translations';

interface LanguageContext {
	readonly current: Language;
	readonly messages: Messages;
	setLanguage(language: Language): void;
}

const languageContext = Symbol('language');

export function provideLanguage(initialLanguage: () => Language): LanguageContext {
	let selectedLanguage = $state<Language>();

	const language: LanguageContext = {
		get current() {
			return selectedLanguage ?? initialLanguage();
		},
		get messages() {
			return translations[this.current];
		},
		setLanguage(next) {
			selectedLanguage = next;

			if (browser) {
				const path = resolve('/').replace(/\/$/, '') || '/';
				const secure = window.location.protocol === 'https:' ? '; Secure' : '';
				document.cookie = `${languageCookie}=${next}; Path=${path}; Max-Age=31536000; SameSite=Lax${secure}`;
			}
		}
	};

	setContext(languageContext, language);
	return language;
}

export function useLanguage(): LanguageContext {
	const language = getContext<LanguageContext | undefined>(languageContext);

	if (!language) {
		throw new Error('Language context must be provided by the root layout.');
	}

	return language;
}
