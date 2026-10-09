import { calculateRawBodyFat } from './assessment';
import {
	exerciseValueFields,
	type ExerciseKey,
	type ExerciseResult,
	type IstErrors,
	type IstField,
	type ValidationCode,
	type ValidationResult
} from './types';

// Accept decimal notation (including exponents), never partial parses or non-decimal literals.
const decimalPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;


export function validateIstInput(raw: unknown): ValidationResult {
	const values = typeof raw === 'object' && raw !== null && !Array.isArray(raw)
		? raw as Record<string, unknown>
		: {};
	const errors: IstErrors = {};
	const get = (field: IstField): unknown => Object.hasOwn(values, field) ? values[field] : undefined;
	const isBlank = (value: unknown): boolean =>
		value === undefined || (typeof value === 'string' && value.trim() === '');

	function readChoice<T extends string>(
		field: IstField,
		choices: readonly T[],
		code: ValidationCode
	): T | undefined {
		const value = get(field);
		if (isBlank(value)) {
			errors[field] = 'required';
			return undefined;
		}
		if (typeof value === 'string') {
			const choice = choices.find((choice) => choice === value.trim());
			if (choice !== undefined) return choice;
		}
		errors[field] = code;
		return undefined;
	}

	function readNumber(field: IstField, minimum: number, maximum: number, whole = true): number | undefined {
		const value = get(field);
		if (isBlank(value)) {
			errors[field] = 'required';
			return undefined;
		}
		if (typeof value !== 'string' || !decimalPattern.test(value.trim())) {
			errors[field] = 'number';
			return undefined;
		}
		const number = Number(value.trim());
		if (!Number.isFinite(number)) {
			errors[field] = 'number';
			return undefined;
		}
		if (whole && !Number.isInteger(number)) {
			errors[field] = 'whole';
			return undefined;
		}
		if (number < minimum || number > maximum) {
			errors[field] = 'range';
			return undefined;
		}
		return number;
	}

	function readExercise(key: ExerciseKey): ExerciseResult | undefined {
		const valueFields = exerciseValueFields[key];
		const [firstField, secondField] = valueFields;
		const timed = secondField !== undefined;
		const status = readChoice(`${key}Status`, ['recorded', 'unable_to_complete'], 'status');
		if (status === undefined) return undefined;
		if (status === 'unable_to_complete') {
			for (const field of valueFields) {
				if (!isBlank(get(field))) errors[field] = 'inconsistent';
			}
			return { status };
		}

		const first = readNumber(firstField, 0, timed ? Infinity : 300);
		if (!timed) return first === undefined ? undefined : { status, value: first };

		const seconds = readNumber(secondField, 0, 59);
		if (first === undefined || seconds === undefined) return undefined;
		const total = first * 60 + seconds;
		if (total < 1 || total > 3600) {
			errors[firstField] = 'range';
			return undefined;
		}
		return { status, value: total };
	}

	const rawName = get('studentName');
	const studentName = typeof rawName === 'string' ? rawName.trim().normalize('NFC') : '';
	if (studentName === '') errors.studentName = 'required';
	const sex = readChoice('sex', ['male', 'female'], 'sex');
	const age = readNumber('age', 17, 51);
	const weightLb = readNumber('weightLb', 70, 400, false);
	const waistIn = readNumber('waistIn', 18, 60, false);
	const pushUps = readExercise('pushUps');
	const sitUps = readExercise('sitUps');
	const run = readExercise('run');
	const plank = readExercise('plank');

	if (sex !== undefined && weightLb !== undefined && waistIn !== undefined) {
		const rawBodyFat = calculateRawBodyFat(sex, weightLb, waistIn);
		if (!Number.isFinite(rawBodyFat) || rawBodyFat < 0 || rawBodyFat > 100) {
			errors.weightLb = 'bodyFat';
			errors.waistIn = 'bodyFat';
		}
	}

	if (
		Object.keys(errors).length > 0 || sex === undefined || age === undefined ||
		weightLb === undefined || waistIn === undefined || pushUps === undefined ||
		sitUps === undefined || run === undefined || plank === undefined
	) {
		return { valid: false, errors };
	}
	return {
		valid: true,
		input: { studentName, sex, age, weightLb, waistIn, pushUps, sitUps, run, plank }
	};
}

