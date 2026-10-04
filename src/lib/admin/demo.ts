export type AdminSection = 'overview' | 'students' | 'payments' | 'invitations' | 'reports' | 'events';
export type StudentStatus = 'active' | 'invited' | 'paused';

export interface AdminStudent {
	id: string;
	name: string;
	email: string;
	cohort: string;
	status: StudentStatus;
	score: number | null;
	progress: number;
	lastActiveMinutes: number | null;
}

// Fictional, in-memory fixtures only. These are not database records or schema contracts.
export const sampleStudents: AdminStudent[] = [
	{ id: 'MM-001', name: 'Alex Rivera', email: 'alex.rivera@example.com', cohort: 'Alpha 01', status: 'active', score: 86, progress: 78, lastActiveMinutes: 4 },
	{ id: 'MM-002', name: 'Sofia Martínez', email: 'sofia.martinez@example.com', cohort: 'Alpha 01', status: 'active', score: 92, progress: 91, lastActiveMinutes: 12 },
	{ id: 'MM-003', name: 'Marcus Johnson', email: 'marcus.johnson@example.com', cohort: 'Bravo 02', status: 'active', score: 68, progress: 45, lastActiveMinutes: 38 },
	{ id: 'MM-004', name: 'Isabella Cruz', email: 'isabella.cruz@example.com', cohort: 'Alpha 01', status: 'active', score: 81, progress: 67, lastActiveMinutes: 65 },
	{ id: 'MM-005', name: 'Daniel Torres', email: 'daniel.torres@example.com', cohort: 'Bravo 02', status: 'paused', score: 54, progress: 32, lastActiveMinutes: 2880 },
	{ id: 'MM-006', name: 'Emma Wilson', email: 'emma.wilson@example.com', cohort: 'Bravo 02', status: 'invited', score: null, progress: 0, lastActiveMinutes: null },
	{ id: 'MM-007', name: 'Gabriel Santos', email: 'gabriel.santos@example.com', cohort: 'Alpha 01', status: 'active', score: 88, progress: 84, lastActiveMinutes: 120 },
	{ id: 'MM-008', name: 'Valentina López', email: 'valentina.lopez@example.com', cohort: 'Bravo 02', status: 'invited', score: null, progress: 0, lastActiveMinutes: null }
];

export function filterStudents(students: AdminStudent[], query: string, status: StudentStatus | 'all'): AdminStudent[] {
	const search = query.trim().toLocaleLowerCase();
	return students.filter((student) =>
		(status === 'all' || student.status === status) &&
		`${student.name} ${student.email} ${student.id} ${student.cohort}`.toLocaleLowerCase().includes(search)
	);
}

export function studentMetrics(students: AdminStudent[]) {
	const graded = students.filter((student) => student.score !== null);
	return {
		total: students.length,
		active: students.filter((student) => student.status === 'active').length,
		invited: students.filter((student) => student.status === 'invited').length,
		averageScore: graded.length ? Math.round(graded.reduce((sum, student) => sum + student.score!, 0) / graded.length) : 0,
		needsAttention: students.filter((student) => student.status === 'paused' || (student.score !== null && student.score < 70)).length
	};
}

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
