export type AdminSection = 'overview' | 'students' | 'payments' | 'invitations' | 'reports' | 'events';

export const activitySeries = {
	week: [18, 26, 21, 38, 32, 46, 42],
	month: [12, 24, 18, 30, 22, 40, 34, 42, 30, 46, 36, 49, 42, 54]
};

export function chartPoints(values: number[], width = 600, height = 150): string {
	if (!values.length) return '';
	const maximum = Math.max(...values, 1);
	return values.map((value, index) => `${(index / Math.max(values.length - 1, 1)) * width},${height - (value / maximum) * (height - 15)}`).join(' ');
}

export function previewLink(kind: 'payment' | 'invitation', sequence: number): string {
	return `https://preview.example.invalid/${kind}/demo-${String(sequence).padStart(3, '0')}`;
}
