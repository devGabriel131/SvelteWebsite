export const studentStatuses = ['active', 'inactive', 'invited'] as const;
export const studentClassTypes = ['basic', 'regular'] as const;
export const studentGenders = ['male', 'female'] as const;

export type StudentStatus = typeof studentStatuses[number];
export type StudentClassType = typeof studentClassTypes[number];
export type StudentGender = typeof studentGenders[number];

export function isValidDateOfBirth(value: string, today = new Date().toISOString().slice(0, 10)): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01' || value > today) return false;
	const timestamp = Date.parse(value);
	return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

export function isStudentId(value: unknown): value is string {
	return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
