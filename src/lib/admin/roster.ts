export type StudentStatus = 'active' | 'paused';
export const subjects = ['ar', 'pc', 'wk', 'mk'] as const;
export interface AdminStudent {
	id: string;
	name: string;
	email: string;
	classType: 'basic' | 'regular';
	status: StudentStatus;
	subjectScores: { ar: number; pc: number; wk: number; mk: number; isFixture: boolean } | null;
}

export function filterStudents(students: AdminStudent[], query: string, status: StudentStatus | 'all') {
	const search = query.trim().toLocaleLowerCase();
	return students.filter((student) =>
		(status === 'all' || student.status === status) &&
		`${student.name} ${student.email} ${student.id} ${student.classType}`.toLocaleLowerCase().includes(search)
	);
}
