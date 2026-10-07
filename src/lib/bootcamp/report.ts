import type { ReportRow } from './types';

export type ReportFilter = 'all' | 'started' | 'confirmed' | 'not_started';
export type ClassFilter = 'all' | ReportRow['classType'];
export const classTypes = ['basic', 'regular'] as const;

export function summarizeReport(rows: ReportRow[]) {
	return {
		total: rows.length,
		started: rows.filter(row => row.status !== 'not_started').length,
		confirmed: rows.filter(row => row.status === 'confirmed').length,
		paidCents: rows.reduce((total, row) => total + row.paidCents, 0),
		// Non-starters and incomplete registrations are not outstanding confirmed balances.
		remainingCents: rows.filter(row => row.status === 'confirmed').reduce((total, row) => total + row.remainingCents, 0),
		classes: classTypes.map(classType => {
			const students = rows.filter(row => row.classType === classType);
			const started = students.filter(row => row.status !== 'not_started').length;
			const confirmed = students.filter(row => row.status === 'confirmed').length;
			return { classType, total: students.length, started, confirmed, percent: students.length ? Math.round(started / students.length * 100) : 0 };
		})
	};
}

export function filterReport(rows: ReportRow[], search: string, classFilter: ClassFilter, registrationFilter: ReportFilter) {
	const query = search.trim().toLocaleLowerCase();
	return rows.filter(row =>
		(classFilter === 'all' || row.classType === classFilter) &&
		(registrationFilter === 'all' || (registrationFilter === 'started' ? row.status !== 'not_started' : row.status === registrationFilter)) &&
		`${row.name} ${row.email}`.toLocaleLowerCase().includes(query));
}
