import { describe, expect, test } from 'bun:test';
import { adminSectionHref, adminSections, isAdminPreviewSection, resolveAdminSection } from '../src/lib/admin/navigation';

describe('shared admin navigation', () => {
	for (const section of adminSections) {
		test(`deep links select ${section} under the supplied admin base path`, () => {
			for (const adminPath of ['/admin', '/school/admin']) {
				const href = adminSectionHref(section, adminPath);
				expect(href).toBe(section === 'overview' ? adminPath : `${adminPath}?section=${section}`);
				const url = new URL(href, 'https://example.test');
				expect(resolveAdminSection(url.searchParams.get('section'))).toBe(section);
			}
			expect(isAdminPreviewSection(section)).toBe(section === 'payments' || section === 'reports');
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
