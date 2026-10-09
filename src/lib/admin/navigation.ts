export const adminSections = ['overview', 'students', 'payments', 'invitations', 'reports'] as const;

export type AdminSection = (typeof adminSections)[number];

export function resolveAdminSection(value: string | null): AdminSection {
	return adminSections.find((section) => section === value) ?? 'overview';
}

export function isAdminPreviewSection(section: AdminSection): boolean {
	return section === 'payments' || section === 'reports';
}

export function adminSectionHref(section: AdminSection, adminPath: string): string {
	return section === 'overview' ? adminPath : `${adminPath}?section=${section}`;
}
