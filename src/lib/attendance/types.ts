export const attendanceFields = [
	'studentName', 'studentSex', 'programStartDate', 'cohort',
	'employerName', 'employerPosition', 'employerWorkplace'
] as const;

export type AttendanceField = (typeof attendanceFields)[number];
export type AttendanceFormValues = Record<AttendanceField, string>;
export type AttendanceSex = 'male' | 'female';
export type Cohort = 'basic' | 'regular';

export interface AttendanceInput {
	studentName: string;
	studentSex: AttendanceSex;

	programStartDate: string;
	cohort: Cohort;
	employerName: string;
	employerPosition: string;
	employerWorkplace: string;
}

export const attendanceTextLimits = {
	studentName: 120,
	employerName: 120,
	employerPosition: 120,
	employerWorkplace: 160
} as const;

export type AttendanceValidationCode = 'required' | 'text' | 'characters' | 'length' | 'sex' | 'date' | 'cohort';
export type AttendanceErrors = Partial<Record<AttendanceField, AttendanceValidationCode>>;
export type AttendanceValidationResult =
	| { valid: true; input: AttendanceInput }
	| { valid: false; errors: AttendanceErrors };

export interface AttendanceCertificate {
	input: AttendanceInput;
	issuedAt: string;
}
