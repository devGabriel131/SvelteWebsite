export type AuthAudience = 'student' | 'admin';

export function isValidPin(value: unknown): value is string {
	return typeof value === 'string' && value.length === 4 && /^[0-9]{4}$/.test(value);
}

export function isValidCredential(audience: AuthAudience, value: unknown): value is string {
	if (audience === 'student') return isValidPin(value);
	return typeof value === 'string' && value.length >= 8 && value.length <= 128;
}
