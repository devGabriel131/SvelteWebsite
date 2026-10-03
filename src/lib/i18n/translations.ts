export type Language = 'en' | 'es';

export const defaultLanguage: Language = 'en';
export const languageCookie = 'language';

export const languages = [
	{ code: 'en', name: 'English', short: 'EN', flag: '🇺🇸' },
	{ code: 'es', name: 'Español', short: 'ES', flag: '🇵🇷' }
] as const;

export function resolveLanguage(value: string | undefined): Language {
	return value === 'en' || value === 'es' ? value : defaultLanguage;
}

const english = {
	accessibility: {
		skipToContent: 'Skip to content'
	},
	language: {
		label: 'Website language'
	},
	header: {
		brand: 'Masterminds',
		brandDescription: 'Programa ASVAB',
		brandLabel: 'Masterminds Programa ASVAB',
		studentName: 'Student name',
		studentDescription: 'Student information',
		studentLabel: 'Student information placeholder'
	},
	navigation: {
		label: 'Dashboard navigation',
		dashboard: 'Dashboard',
		features: 'Features',
		featuresDescription: 'Your features will appear here as we build them.'
	},
	home: {
		title: 'Student dashboard',
		pageTitle: 'Student dashboard | Masterminds ASVAB',
		description: 'Your Masterminds Programa ASVAB student dashboard.',
		eyebrow: 'Your workspace',
		introduction: 'One place for your student tools.',
		emptyTitle: "Room for what's next",
		emptyDescription: "This is where each feature will be displayed. We'll build them one at a time."
	}
};

export type Messages = typeof english;

const spanish: Messages = {
	accessibility: {
		skipToContent: 'Saltar al contenido'
	},
	language: {
		label: 'Idioma del sitio web'
	},
	header: {
		brand: 'Masterminds',
		brandDescription: 'Programa ASVAB',
		brandLabel: 'Masterminds Programa ASVAB',
		studentName: 'Nombre del estudiante',
		studentDescription: 'Información del estudiante',
		studentLabel: 'Espacio para la información del estudiante'
	},
	navigation: {
		label: 'Navegación del panel',
		dashboard: 'Panel',
		features: 'Funciones',
		featuresDescription: 'Tus funciones aparecerán aquí a medida que las desarrollemos.'
	},
	home: {
		title: 'Panel del estudiante',
		pageTitle: 'Panel del estudiante | Masterminds ASVAB',
		description: 'Tu panel de estudiante de Masterminds Programa ASVAB.',
		eyebrow: 'Tu espacio de trabajo',
		introduction: 'Todas tus herramientas de estudiante en un solo lugar.',
		emptyTitle: 'Espacio para lo que viene',
		emptyDescription: 'Aquí se mostrará cada función. Las desarrollaremos una a la vez.'
	}
};

export const translations: Record<Language, Messages> = {
	en: english,
	es: spanish
};
