export const attendanceFields = [
	'studentName', 'studentSex', 'programStartDate', 'cohort', 'classTime',
	'employerName', 'employerPosition', 'employerWorkplace'
] as const;

export type AttendanceField = (typeof attendanceFields)[number];
export type AttendanceFormValues = Record<AttendanceField, string>;
export type AttendanceSex = 'male' | 'female';
export type Cohort = 'basic' | 'regular';
export type ClassTime = 'am' | 'pm';

export const attendanceClassTimes = {
	am: { startTime: '10:00', endTime: '12:00' },
	pm: { startTime: '20:00', endTime: '22:00' }
} as const;

export interface AttendanceInput {
	studentName: string;
	studentSex: AttendanceSex;
	programStartDate: string;
	cohort: Cohort;
	classTime: ClassTime;
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

export type AttendanceValidationCode = 'required' | 'text' | 'characters' | 'length' | 'sex' | 'date' | 'cohort' | 'classTime';
export type AttendanceErrors = Partial<Record<AttendanceField, AttendanceValidationCode>>;
export type AttendanceValidationResult =
	| { valid: true; input: AttendanceInput }
	| { valid: false; errors: AttendanceErrors };

export interface AttendanceCertificate {
	input: AttendanceInput;
	issuedAt: string;
}
