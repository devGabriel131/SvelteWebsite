import { describe, expect, test } from 'bun:test';
import { adminSections, resolveAdminSection } from '../src/lib/admin/navigation';
import { translations } from '../src/lib/i18n/translations';

describe('shared admin navigation', () => {
	for (const section of adminSections) {
		test(`deep links select ${section} and retain bilingual navigation and page titles`, () => {
			const url = new URL(`https://example.test/admin?section=${section}`);
			expect(resolveAdminSection(url.searchParams.get('section'))).toBe(section);
			for (const language of ['en', 'es'] as const) {
				expect(translations[language].admin.sections[section].trim()).not.toBe('');
				expect(translations[language].admin.intro[section].title.trim()).not.toBe('');
			}
		});
	}

	test('missing, unknown, and noncanonical section parameters fall back to overview', () => {
		for (const value of [null, '', 'unknown', 'bootcamps', 'Students', ' students ', '__proto__', 'constructor']) {
			expect(resolveAdminSection(value)).toBe('overview');
		}
	});

	test('browser history URLs resolve independently rather than retaining the previous section', () => {
		const urls = ['/admin?section=students', '/admin?section=reports', '/admin?section=students', '/admin'];
		expect(urls.map((path) => resolveAdminSection(new URL(path, 'https://example.test').searchParams.get('section'))))
			.toEqual(['students', 'reports', 'students', 'overview']);
	});
});
