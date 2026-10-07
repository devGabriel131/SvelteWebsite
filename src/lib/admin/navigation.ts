import type { AdminSection } from './demo';

export const adminSections = ['overview', 'students', 'payments', 'invitations', 'reports', 'events'] as const satisfies readonly AdminSection[];

export function resolveAdminSection(value: string | null): AdminSection {
	return adminSections.find((section) => section === value) ?? 'overview';
}
