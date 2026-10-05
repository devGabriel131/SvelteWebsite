import { isValidPin } from './pin';

export type AuthAudience = 'student' | 'admin';

export function isValidCredential(audience: AuthAudience, value: unknown): value is string {
	if (audience === 'student') return isValidPin(value);
	return typeof value === 'string' && value.length >= 8 && value.length <= 128;
}
