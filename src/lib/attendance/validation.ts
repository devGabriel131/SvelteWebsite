import { titleAttendanceName } from './names';
import {
	attendanceFields,
	attendanceTextLimits,
	type AttendanceErrors,
	type AttendanceField,
	type AttendanceValidationCode,
	type AttendanceValidationResult
} from './types';

// Check before trimming so boundary newlines and invisible formatting controls cannot disappear.
const controlPattern = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
// The PDF renderer's built-in fonts use WinAnsi; reject unsupported glyphs rather than corrupting text.
const unsupportedWinAnsiPattern = /[^\u0020-\u007e\u00a0-\u00ff€ŒœŠšŸŽžƒˆ˜‘’‚“”„–—…†‡•‰‹›™]/u;

export function readAttendanceFormData(data: FormData): Record<AttendanceField, unknown> {
	const raw = {} as Record<AttendanceField, unknown>;
	for (const field of attendanceFields) {
		const values = data.getAll(field);
		// Keep duplicate entries and Files untrusted rather than silently selecting a string.
		raw[field] = values.length > 1 ? values : values[0];
	}
	return raw;
}

function isCalendarDate(value: string): boolean {
	if (value.length !== 10 || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false;
	const [year, month, day] = value.split('-').map(Number);
	if (year < 1 || month < 1 || month > 12 || day < 1) return false;
	const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
	const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
	return day <= daysInMonth[month - 1];
}

export function validateAttendanceInput(raw: unknown): AttendanceValidationResult {
	const values = typeof raw === 'object' && raw !== null && !Array.isArray(raw)
		? raw as Record<string, unknown>
		: {};
	const errors: AttendanceErrors = {};
	const get = (field: AttendanceField): unknown => Object.hasOwn(values, field) ? values[field] : undefined;
	const isBlank = (value: unknown): boolean =>
		value === undefined || (typeof value === 'string' && value.trim() === '');

	function readText(field: keyof typeof attendanceTextLimits): string | undefined {
		const value = get(field);
		if (value === undefined) {
			errors[field] = 'required';
			return undefined;
		}
		if (typeof value !== 'string' || controlPattern.test(value)) {
			errors[field] = 'text';
			return undefined;
		}
		const text = value.trim().normalize('NFC').replace(/\s+/gu, ' ');
		if (text === '') {
			errors[field] = 'required';
			return undefined;
		}
		if (
			unsupportedWinAnsiPattern.test(text) ||
			((field === 'studentName' || field === 'employerName') && unsupportedWinAnsiPattern.test(titleAttendanceName(text)))
		) {
			errors[field] = 'characters';
			return undefined;
		}
		if (text.length > attendanceTextLimits[field]) {
			errors[field] = 'length';
			return undefined;
		}
		return text;
	}

	function readChoice<T extends string>(
		field: AttendanceField,
		choices: readonly T[],
		code: AttendanceValidationCode
	): T | undefined {
		const value = get(field);
		if (isBlank(value)) {
			errors[field] = 'required';
			return undefined;
		}
		const choice = choices.find((choice) => choice === value);
		if (choice !== undefined) return choice;
		errors[field] = code;
		return undefined;
	}


	function readDate(): string | undefined {
		const value = get('programStartDate');
		if (isBlank(value)) {
			errors.programStartDate = 'required';
			return undefined;
		}
		if (typeof value !== 'string' || !isCalendarDate(value)) {
			errors.programStartDate = 'date';
			return undefined;
		}
		return value;
	}

	const studentName = readText('studentName');
	const studentSex = readChoice('studentSex', ['male', 'female'], 'sex');

	const programStartDate = readDate();
	const cohort = readChoice('cohort', ['basic', 'regular'], 'cohort');
	const employerName = readText('employerName');
	const employerPosition = readText('employerPosition');
	const employerWorkplace = readText('employerWorkplace');

	if (
		Object.keys(errors).length > 0 || studentName === undefined || studentSex === undefined ||
		programStartDate === undefined || cohort === undefined ||
		employerName === undefined || employerPosition === undefined || employerWorkplace === undefined
	) {
		return { valid: false, errors };
	}
	return {
		valid: true,
		input: { studentName, studentSex, programStartDate, cohort, employerName, employerPosition, employerWorkplace }
	};
}

export function revalidateAttendanceErrors(raw: unknown, visibleErrors: AttendanceErrors): AttendanceErrors {
	const validation = validateAttendanceInput(raw);
	if (validation.valid) return {};

	// Refresh only existing errors; untouched fields stay quiet until submission.
	const errors: AttendanceErrors = {};
	for (const field of attendanceFields) {
		if (visibleErrors[field] && validation.errors[field]) errors[field] = validation.errors[field];
	}
	return errors;
}
