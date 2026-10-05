export function isValidPin(value: unknown): value is string {
	return typeof value === 'string' && value.length === 4 && /^[0-9]{4}$/.test(value);
}
