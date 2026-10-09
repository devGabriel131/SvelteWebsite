import { describe, expect, test } from 'bun:test';
import { assessIst, calculateRawBodyFat } from '../src/lib/ist/assessment';
import { validateIstInput } from '../src/lib/ist/validation';
import { readFormFields, refreshVisibleErrors } from '../src/lib/form-fields';
import {
	istFields,
	type IstErrors,
	type IstField,

	type IstInput,
	type ValidationCode
} from '../src/lib/ist/types';

const numericFields: readonly IstField[] = [
	'age', 'weightLb', 'waistIn', 'pushUpsValue', 'sitUpsValue',
	'runMinutes', 'runSeconds', 'plankMinutes', 'plankSeconds'
];
const wholeFields: readonly IstField[] = [
	'age', 'pushUpsValue', 'sitUpsValue', 'runMinutes', 'runSeconds', 'plankMinutes', 'plankSeconds'
];
const exercises = [
	{ key: 'pushUps', status: 'pushUpsStatus', fields: ['pushUpsValue'] },
	{ key: 'sitUps', status: 'sitUpsStatus', fields: ['sitUpsValue'] },
	{ key: 'run', status: 'runStatus', fields: ['runMinutes', 'runSeconds'] },
	{ key: 'plank', status: 'plankStatus', fields: ['plankMinutes', 'plankSeconds'] }
] as const;

function makeRaw(overrides: Partial<Record<IstField, unknown>> = {}): Record<IstField, unknown> {
	return {
		studentName: 'Alex Rivera',
		sex: 'male',
		age: '21',
		weightLb: '170',
		waistIn: '33',
		pushUpsStatus: 'recorded',
		pushUpsValue: '42',
		sitUpsStatus: 'recorded',
		sitUpsValue: '53',
		runStatus: 'recorded',
		runMinutes: '8',
		runSeconds: '30',
		plankStatus: 'recorded',
		plankMinutes: '1',
		plankSeconds: '30',
		...overrides
	};
}

function validated(raw: unknown): IstInput {
	const result = validateIstInput(raw);
	expect(result.valid).toBe(true);
	if (!result.valid) throw new Error(`Unexpected validation errors: ${JSON.stringify(result.errors)}`);
	return result.input;
}

function expectErrors(raw: unknown, errors: IstErrors) {
	expect(validateIstInput(raw)).toEqual({ valid: false, errors });
}

function toFormData(raw = makeRaw()): FormData {
	const data = new FormData();
	for (const field of istFields) {
		const value = raw[field];
		if (typeof value === 'string') data.append(field, value);
	}
	return data;
}

describe('visible validation errors while editing', () => {
	test('clears a corrected field while retaining other unanswered-field errors', () => {
		expect(refreshVisibleErrors(validateIstInput(makeRaw({ age: '' })), { studentName: 'required', age: 'required' }))
			.toEqual({ age: 'required' });
	});

	for (const sex of ['male', 'female']) {
		test(`clears the missing-baseline error when ${sex} is chosen`, () => {
			expect(refreshVisibleErrors(validateIstInput(makeRaw({ sex })), { sex: 'required' })).toEqual({});
		});
	}

	for (const { key, status, fields } of exercises) {
		for (const selection of ['recorded', 'unable_to_complete']) {
			test(`clears the missing ${key} choice after selecting ${selection} without immediately flagging its result fields`, () => {
				const raw = makeRaw({ [status]: selection });
				for (const field of fields) raw[field] = '';
				expect(refreshVisibleErrors(validateIstInput(raw), { [status]: 'required' })).toEqual({});
			});
		}
		test(`clears ${key} numeric errors when inability is selected`, () => {
			const raw = makeRaw({ [status]: 'unable_to_complete' });
			const visibleErrors: IstErrors = {};
			for (const field of fields) {
				raw[field] = '';
				visibleErrors[field] = 'required';
			}
			expect(refreshVisibleErrors(validateIstInput(raw), visibleErrors)).toEqual({});
		});
	}

	test('a recorded zero count clears validation errors even though it fails the fitness minimum', () => {
		expect(refreshVisibleErrors(validateIstInput(makeRaw({ pushUpsValue: '0' })), { pushUpsValue: 'required' })).toEqual({});
	});

	for (const [field, value, code] of [
		['studentName', ' ', 'required'], ['age', '17.5', 'whole'], ['age', '52', 'range'],
		['pushUpsValue', '34abc', 'number'], ['pushUpsValue', '', 'required']
	] as const) {
		test(`keeps ${field} red with the current error when the edit is still invalid (${code})`, () => {
			expect(refreshVisibleErrors(validateIstInput(makeRaw({ [field]: value })), { [field]: 'required' })).toEqual({ [field]: code });
		});
	}

	test('correcting either measurement or the baseline can clear both related body-fat errors', () => {
		const visibleErrors: IstErrors = { weightLb: 'bodyFat', waistIn: 'bodyFat' };
		for (const raw of [
			makeRaw({ weightLb: '170', waistIn: '33' }),
			makeRaw({ sex: 'female', weightLb: '400', waistIn: '18' })
		]) expect(refreshVisibleErrors(validateIstInput(raw), visibleErrors)).toEqual({});
	});

	test('keeps both body-fat errors when changed measurements still give an invalid estimate', () => {
		expect(refreshVisibleErrors(validateIstInput(makeRaw({ weightLb: '400', waistIn: '18.5' })), {
			weightLb: 'bodyFat', waistIn: 'bodyFat'
		})).toEqual({ weightLb: 'bodyFat', waistIn: 'bodyFat' });
	});

	for (const key of ['run', 'plank'] as const) {
		test(`editing ${key} seconds can clear a total-duration error on its minutes field`, () => {
			const minutes = `${key}Minutes` as const;
			const seconds = `${key}Seconds` as const;
			for (const [minuteValue, secondValue] of [['0', '1'], ['60', '0']]) {
				expect(refreshVisibleErrors(validateIstInput(makeRaw({ [minutes]: minuteValue, [seconds]: secondValue })), {
					[minutes]: 'range'
				})).toEqual({});
			}
		});
	}

});

describe('shared input normalization', () => {
	test('produces the typed contract and converts timed exercises to total seconds', () => {
		expect(validated(makeRaw())).toEqual({
			studentName: 'Alex Rivera', sex: 'male', age: 21, weightLb: 170, waistIn: 33,
			pushUps: { status: 'recorded', value: 42 },
			sitUps: { status: 'recorded', value: 53 },
			run: { status: 'recorded', value: 510 },
			plank: { status: 'recorded', value: 90 }
		});
	});

	test('trims every string while preserving internal student-name spaces', () => {
		const raw = makeRaw({ studentName: '  Alex  Rivera  ' });
		for (const field of istFields) raw[field] = ` \t${raw[field]}\n `;
		expect(validated(raw)).toEqual({ ...validated(makeRaw()), studentName: 'Alex  Rivera' });
	});

	test('trims and NFC-normalizes decomposed Spanish accents in student names', () => {
		const input = validated(makeRaw({ studentName: ' \tJose\u0301 Mari\u0301a Mun\u0303oz\n ' }));
		expect(input.studentName).toBe('José María Muñoz');
		expect(input).toEqual(validated(makeRaw({ studentName: 'José María Muñoz' })));
	});

	test('accepts long nonblank student names without a length limit or truncation', () => {
		const studentName = 'José María Muñoz '.repeat(1000).trim();
		expect(validated(makeRaw({ studentName: `  ${studentName}  ` })).studentName).toBe(studentName);
	});

	test('accepts female baselines and decimal measurements', () => {
		expect(validated(makeRaw({ sex: 'female', age: '22', weightLb: '130.5', waistIn: '30.25' })))
			.toMatchObject({ sex: 'female', age: 22, weightLb: 130.5, waistIn: 30.25 });
	});

	test('accepts full decimal notation, exponents, and numerically whole decimal strings', () => {
		expect(validated(makeRaw({
			age: '+2.1e1', weightLb: '1.705e2', waistIn: '+33.25',
			pushUpsValue: '42.0', sitUpsValue: '053', runMinutes: '8.', runSeconds: '3e1'
		}))).toMatchObject({
			age: 21, weightLb: 170.5, waistIn: 33.25,
			pushUps: { status: 'recorded', value: 42 },
			sitUps: { status: 'recorded', value: 53 }, run: { status: 'recorded', value: 510 }
		});
	});

	test('accepts fractional notation without a leading zero for measurements', () => {
		expect(validated(makeRaw({ weightLb: '70.5', waistIn: '18.5' }))).toMatchObject({ weightLb: 70.5, waistIn: 18.5 });
		expectErrors(makeRaw({ weightLb: '.5' }), { weightLb: 'range' });
	});

	test('returns no input on invalid data and does not mutate its input', () => {
		const raw = Object.freeze(makeRaw({ age: '16' }));
		const snapshot = { ...raw };
		expectErrors(raw, { age: 'range' });
		expect(raw).toEqual(snapshot);
	});

	test('ignores unrelated fields and handles null-prototype records', () => {
		const raw = Object.assign(Object.create(null), makeRaw(), { unrelated: 'ignored' });
		expect(validated(raw)).toEqual(validated(makeRaw()));
	});

	for (const raw of [undefined, null, false, true, 21, 'student', [], [makeRaw()], new FormData()]) {
		test(`rejects a non-record root ${String(raw)}`, () => {
			expectErrors(raw, {
				studentName: 'required', sex: 'required', age: 'required', weightLb: 'required', waistIn: 'required',
				pushUpsStatus: 'required', sitUpsStatus: 'required', runStatus: 'required', plankStatus: 'required'
			});
		});
	}

	test('does not accept inherited field values', () => {
		expect(validateIstInput(Object.create(makeRaw())).valid).toBe(false);
	});
});

describe('student name, sex, and exercise statuses', () => {
	for (const value of [undefined, '', ' \t\n ', null, 123, false, [], {}, new File(['Alex'], 'name.txt')]) {
		test(`requires a nonblank string student name (${String(value)})`, () => {
			expectErrors(makeRaw({ studentName: value }), { studentName: 'required' });
		});
	}

	for (const value of [undefined, '', ' \t ']) {
		test(`requires a sex (${String(value)})`, () => expectErrors(makeRaw({ sex: value }), { sex: 'required' }));
	}
	for (const value of ['Male', 'FEMALE', 'other', 'male female', null, 1, false, [], {}, new File(['male'], 'sex.txt')]) {
		test(`rejects unsupported or non-string sex (${String(value)})`, () => {
			expectErrors(makeRaw({ sex: value }), { sex: 'sex' });
		});
	}

	for (const { status } of exercises) {
		for (const value of [undefined, '', ' \t\n ']) {
			test(`requires an answer for ${status} (${String(value)})`, () => {
				expectErrors(makeRaw({ [status]: value }), { [status]: 'required' });
			});
		}
		for (const value of ['unanswered', 'unknown', 'Recorded', 'unable', null, 0, true, [], {}, new File(['recorded'], 'status.txt')]) {
			test(`rejects invalid ${status} (${String(value)})`, () => {
				expectErrors(makeRaw({ [status]: value }), { [status]: 'status' });
			});
		}
	}
});

describe('strict numeric fields', () => {
	for (const field of numericFields) {
		for (const value of [undefined, '', ' \t\n ']) {
			test(`${field} ${String(value)} is required rather than coerced to zero`, () => {
				expectErrors(makeRaw({ [field]: value }), { [field]: 'required' });
			});
		}
		for (const value of [
			null, 21, NaN, Infinity, -Infinity, false, true, [], ['21'], {},
			{ toString() { throw new Error('Must not coerce objects'); } }, new File(['21'], 'number.txt')
		]) {
			test(`${field} rejects non-string numeric input (${typeof value})`, () => {
				expectErrors(makeRaw({ [field]: value }), { [field]: 'number' });
			});
		}
		for (const value of [
			'21abc', '21 reps', '8:30', '1,000', '21,5', '2 1', '21\n5', 'NaN', 'Infinity', '-Infinity',
			'1e309', '-1e309', '0x15', '0b10101', '0o25', '1_000', '.', '+', '-', '1e', 'e21',
			'--21', '++21', '1.2.3', '<script>', '２１', '21\u0000'
		]) {
			test(`${field} rejects malformed or nonfinite string ${JSON.stringify(value)}`, () => {
				expectErrors(makeRaw({ [field]: value }), { [field]: 'number' });
			});
		}
	}

	for (const field of wholeFields) {
		for (const value of ['21.5', '2.15e1', '.5', '-.5']) {
			test(`${field} rejects fractional ${value}`, () => {
				expectErrors(makeRaw({ [field]: value }), { [field]: 'whole' });
			});
		}
	}

	for (let age = 17; age <= 51; age++) {
		test(`accepts whole age ${age}`, () => expect(validated(makeRaw({ age: String(age) })).age).toBe(age));
	}
	for (const value of ['16', '52', '-1', '0', '1e308']) {
		test(`rejects age out of range: ${value}`, () => expectErrors(makeRaw({ age: value }), { age: 'range' }));
	}

	for (const value of ['70', '400']) {
		test(`accepts inclusive weight endpoint ${value}`, () => {
			expect(validated(makeRaw({ weightLb: value, waistIn: '60' })).weightLb).toBe(Number(value));
		});
	}
	for (const value of ['69.999', '400.001', '0', '-70', '1e308']) {
		test(`rejects weight out of range: ${value}`, () => expectErrors(makeRaw({ weightLb: value }), { weightLb: 'range' }));
	}
	for (const value of ['18', '60']) {
		test(`accepts inclusive waist endpoint ${value}`, () => {
			expect(validated(makeRaw({ weightLb: '70', waistIn: value })).waistIn).toBe(Number(value));
		});
	}
	for (const value of ['17.999', '60.001', '0', '-18', '1e308']) {
		test(`rejects waist out of range: ${value}`, () => expectErrors(makeRaw({ waistIn: value }), { waistIn: 'range' }));
	}

	for (const { key, fields } of exercises.slice(0, 2)) {
		const field = fields[0];
		for (const value of ['0', '300']) {
			test(`${key} accepts recorded repetition endpoint ${value}`, () => {
				expect(validated(makeRaw({ [field]: value }))[key]).toEqual({ status: 'recorded', value: Number(value) });
			});
		}
		for (const value of ['-1', '301', '1e308']) {
			test(`${key} rejects repetitions out of range ${value}`, () => expectErrors(makeRaw({ [field]: value }), { [field]: 'range' }));
		}
	}
});

describe('timed exercises and component error placement', () => {
	for (const { key, fields } of [exercises[2], exercises[3]]) {
		const [minutes, seconds] = fields;
		for (const [minuteValue, secondValue, total] of [
			['0', '1', 1], ['0', '59', 59], ['1', '0', 60], ['1', '1', 61],
			['59', '59', 3599], ['60', '0', 3600], ['01.0', '+1e1', 70]
		] as const) {
			test(`${key} accepts ${minuteValue}m ${secondValue}s = ${total}s`, () => {
				expect(validated(makeRaw({ [minutes]: minuteValue, [seconds]: secondValue }))[key])
					.toEqual({ status: 'recorded', value: total });
			});
		}
		for (const [minuteValue, secondValue] of [['0', '0'], ['60', '1'], ['61', '0'], ['1e308', '0']] as const) {
			test(`${key} invalid total ${minuteValue}m ${secondValue}s errors on minutes`, () => {
				expectErrors(makeRaw({ [minutes]: minuteValue, [seconds]: secondValue }), { [minutes]: 'range' });
			});
		}
		for (const [field, value, code] of [
			[minutes, '-1', 'range'], [seconds, '-1', 'range'], [seconds, '60', 'range'],
			[minutes, '1.5', 'whole'], [seconds, '30.5', 'whole'],
			[minutes, '1 minute', 'number'], [seconds, '30 seconds', 'number']
		] as const) {
			test(`${key} invalid component ${field} ${value} errors only on that field`, () => {
				expectErrors(makeRaw({ [field]: value }), { [field]: code });
			});
		}

		test(`${key} reports both individual errors without adding a total error`, () => {
			expectErrors(makeRaw({ [minutes]: '1.5', [seconds]: '60' }), { [minutes]: 'whole', [seconds]: 'range' });
		});
		test(`${key} cannot leave either recorded time component blank`, () => {
			expectErrors(makeRaw({ [minutes]: '', [seconds]: '' }), { [minutes]: 'required', [seconds]: 'required' });
		});
	}
});

describe('unable-to-complete consistency and recorded zero', () => {
	for (const { key, status, fields } of exercises) {
		for (const blank of [undefined, '', ' \t\n ']) {
			test(`${key} unable_to_complete accepts blank or absent values (${String(blank)})`, () => {
				const raw = makeRaw({ [status]: 'unable_to_complete' });
				for (const field of fields) raw[field] = blank;
				expect(validated(raw)[key]).toEqual({ status: 'unable_to_complete' });
			});
		}
		for (const field of fields) {
			for (const value of ['0', '1', 'garbage', '-1', '1.5', null, 0, [], {}, new File([], 'empty.txt')]) {
				test(`${key} unable_to_complete rejects inconsistent ${field} (${typeof value})`, () => {
					const raw = makeRaw({ [status]: 'unable_to_complete' });
					for (const valueField of fields) raw[valueField] = '';
					raw[field] = value;
					expectErrors(raw, { [field]: 'inconsistent' });
				});
			}
		}
	}

	test('reports every inconsistent value when all four statuses are unable_to_complete', () => {
		const raw = makeRaw();
		const errors: IstErrors = {};
		for (const { status, fields } of exercises) {
			raw[status] = 'unable_to_complete';
			for (const field of fields) errors[field] = 'inconsistent';
		}
		expectErrors(raw, errors);
	});

	test('accepts all four unable statuses with their value fields omitted', () => {
		const raw: Partial<Record<IstField, unknown>> = makeRaw();
		for (const { status, fields } of exercises) {
			raw[status] = 'unable_to_complete';
			for (const field of fields) delete raw[field];
		}
		const input = validated(raw);
		for (const { key } of exercises) expect(input[key]).toEqual({ status: 'unable_to_complete' });
		expect(assessIst(input, 'fixed').belowBaseline).toEqual(['pushUps', 'sitUps', 'plank', 'run']);
	});

	test('zero recorded repetitions are valid results but blanks are not', () => {
		const input = validated(makeRaw({ pushUpsValue: '0', sitUpsValue: '0' }));
		expect(input.pushUps).toEqual({ status: 'recorded', value: 0 });
		expect(input.sitUps).toEqual({ status: 'recorded', value: 0 });
		expect(assessIst(input, 'fixed').belowBaseline).toEqual(['pushUps', 'sitUps']);
		expectErrors(makeRaw({ pushUpsValue: '', sitUpsValue: '' }), { pushUpsValue: 'required', sitUpsValue: 'required' });
	});
});

describe('raw body-fat validity', () => {
	test('rejects male negative raw body fat on both measurement fields', () => {
		expectErrors(makeRaw({ weightLb: '400', waistIn: '18' }), { weightLb: 'bodyFat', waistIn: 'bodyFat' });
	});

	for (const [weightLb, waistIn, expected] of [['400', '18', 7.71], ['70', '60', 66]] as const) {
		test(`accepts female measurement extrema ${weightLb}lb / ${waistIn}in`, () => {
			const input = validated(makeRaw({ sex: 'female', weightLb, waistIn }));
			expect(calculateRawBodyFat(input.sex, input.weightLb, input.waistIn)).toBeCloseTo(expected, 10);
		});
	}

	test('rejects a negative raw estimate even when it rounds to negative zero', () => {
		const waistIn = 23.802010050251255;
		const raw = calculateRawBodyFat('male', 170, waistIn);
		expect(raw).toBeLessThan(0);
		expect(Object.is(Math.round(raw * 100) / 100, -0)).toBe(true);
		expectErrors(makeRaw({ waistIn: String(waistIn) }), { weightLb: 'bodyFat', waistIn: 'bodyFat' });
	});

	test('accepts a valid raw zero without clamping', () => {
		const input = validated(makeRaw({ waistIn: '23.804020100502512' }));
		expect(calculateRawBodyFat(input.sex, input.weightLb, input.waistIn)).toBe(0);
	});

	test('accepts a valid but above-ceiling estimate for assessment rather than rejecting it', () => {
		const input = validated(makeRaw({ waistIn: '34' }));
		expect(assessIst(input, 'fixed').bodyFat).toEqual({ estimate: 20.29, ceiling: 20, grade: 'red', passed: false });
	});

	test('does not replace measurement parsing errors with bodyFat errors', () => {
		expectErrors(makeRaw({ weightLb: '400.1', waistIn: '18' }), { weightLb: 'range' });
		expectErrors(makeRaw({ weightLb: '400', waistIn: 'invalid' }), { waistIn: 'number' });
	});

	test('accumulates bodyFat errors alongside independent field errors', () => {
		expectErrors(makeRaw({ studentName: '', age: '16', weightLb: '400', waistIn: '18', pushUpsValue: 'x' }), {
			studentName: 'required', age: 'range', weightLb: 'bodyFat', waistIn: 'bodyFat', pushUpsValue: 'number'
		});
	});
});

describe('FormData transport and untrusted entries', () => {
	for (const field of istFields) {
		const code: ValidationCode = field === 'studentName' ? 'required'
			: field === 'sex' ? 'sex' : field.endsWith('Status') ? 'status' : 'number';
		test(`rejects duplicate ${field} entries even when identical`, () => {
			const data = toFormData();
			const value = data.get(field);
			if (typeof value !== 'string') throw new Error('Expected string fixture');
			data.append(field, value);
			expectErrors(readFormFields(data, istFields), { [field]: code });
		});

		test(`rejects a File entry for ${field}`, () => {
			const data = toFormData();
			data.set(field, new File(['21'], 'untrusted.txt'));
			expectErrors(readFormFields(data, istFields), { [field]: code });
		});
	}

	for (const { status, fields } of exercises) {
		for (const field of fields) {
			test(`rejects duplicated blank ${field} values even for unable_to_complete`, () => {
				const raw = makeRaw({ [status]: 'unable_to_complete' });
				for (const valueField of fields) raw[valueField] = '';
				const data = toFormData(raw);
				data.append(field, '');
				expectErrors(readFormFields(data, istFields), { [field]: 'inconsistent' });
			});
		}
	}

	test('rejects mixed string and File duplicates rather than selecting the valid entry', () => {
		const data = toFormData();
		data.append('age', new File(['21'], 'age.txt'));
		expectErrors(readFormFields(data, istFields), { age: 'number' });
	});

	test('reads omitted unable value fields correctly through FormData', () => {
		const data = toFormData();
		for (const { status, fields } of exercises) {
			data.set(status, 'unable_to_complete');
			for (const field of fields) data.delete(field);
		}
		const input = validated(readFormFields(data, istFields));
		for (const { key } of exercises) expect(input[key]).toEqual({ status: 'unable_to_complete' });
	});
});
