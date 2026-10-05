import { describe, expect, test } from 'bun:test';
import { titleAttendanceName } from '../src/lib/attendance/names';
import {
	attendanceFields,
	attendanceTextLimits,
	type AttendanceErrors,
	type AttendanceField,
	type AttendanceFormValues,
	type AttendanceInput,
	type AttendanceValidationCode
} from '../src/lib/attendance/types';
import {
	readAttendanceFormData,
	revalidateAttendanceErrors,
	validateAttendanceInput
} from '../src/lib/attendance/validation';

const textFields = ['studentName', 'employerName', 'employerPosition', 'employerWorkplace'] as const;
const invalidCodes: Record<AttendanceField, AttendanceValidationCode> = {
	studentName: 'text', studentSex: 'sex', programStartDate: 'date', cohort: 'cohort',
	employerName: 'text', employerPosition: 'text', employerWorkplace: 'text'
};

function makeRaw(overrides: Partial<Record<AttendanceField, unknown>> = {}): Record<AttendanceField, unknown> {
	return {
		studentName: 'MARÍA SOFÍA PAGÁN CRUZ',
		studentSex: 'female',
		programStartDate: '2026-04-15',
		cohort: 'regular',
		employerName: 'ROBERTO QUIÑONES',
		employerPosition: 'Supervisor',
		employerWorkplace: 'Walgreens, Plaza del Sol',
		...overrides
	};
}

function validated(raw: unknown): AttendanceInput {
	const result = validateAttendanceInput(raw);
	expect(result.valid).toBe(true);
	if (!result.valid) throw new Error(`Unexpected validation errors: ${JSON.stringify(result.errors)}`);
	return result.input;
}

function expectErrors(raw: unknown, errors: AttendanceErrors): void {
	expect(validateAttendanceInput(raw)).toEqual({ valid: false, errors });
}

function toFormData(raw = makeRaw()): FormData {
	const data = new FormData();
	for (const field of attendanceFields) {
		const value = raw[field];
		if (typeof value === 'string') data.append(field, value);
	}
	return data;
}

describe('attendance validation contract', () => {
	test('defines only the seven ordered fields and the shared UI text limits', () => {
		expect(attendanceFields).toEqual([
			'studentName', 'studentSex', 'programStartDate', 'cohort',
			'employerName', 'employerPosition', 'employerWorkplace'
		]);
		expect(attendanceTextLimits).toEqual({
			studentName: 120, employerName: 120, employerPosition: 120, employerWorkplace: 160
		});
	});

	test('returns a fresh typed input with canonical case and only the contracted fields', () => {
		const raw: AttendanceFormValues = {
			studentName: 'MARÍA SOFÍA PAGÁN CRUZ', studentSex: 'female',
			programStartDate: '2026-04-15', cohort: 'regular', employerName: 'ROBERTO QUIÑONES',
			employerPosition: 'Supervisor', employerWorkplace: 'Walgreens, Plaza del Sol'
		};
		const input = validated(raw);
		expect(raw).toEqual(input);
		expect(input).not.toBe(raw);
		expect(Object.keys(input)).toEqual([...attendanceFields]);
		expect(input.studentName).toBe('MARÍA SOFÍA PAGÁN CRUZ');
	});

	for (const studentSex of ['male', 'female'] as const) {
		for (const cohort of ['basic', 'regular'] as const) {
			test(`accepts the ${studentSex}/${cohort} wire choices`, () => {
				expect(validated(makeRaw({ studentSex, cohort }))).toMatchObject({ studentSex, cohort });
			});
		}
	}

	for (const field of attendanceFields) {
		test(`${field} is required when absent or blank`, () => {
			const omitted = makeRaw();
			delete omitted[field];
			expectErrors(omitted, { [field]: 'required' });
			for (const value of [undefined, '', '   ', '\u00a0\u2003']) {
				expectErrors(makeRaw({ [field]: value }), { [field]: 'required' });
			}
		});

		test(`${field} rejects nonstrings without coercion`, () => {
			for (const value of [null, 1234, false, [], ['valid'], {}, new String('valid'), { toString: () => 'valid' }]) {
				expectErrors(makeRaw({ [field]: value }), { [field]: invalidCodes[field] });
			}
		});
	}

	test('reports all invalid fields at once using codes without returning personal values', () => {
		const raw = makeRaw({
			studentName: 'private\nname', studentSex: 'private-sex', programStartDate: 'private-date',
			cohort: 'private-cohort', employerName: false,
			employerPosition: 'x'.repeat(121), employerWorkplace: '\u0000private-workplace'
		});
		const result = validateAttendanceInput(raw);
		expect(result).toEqual({ valid: false, errors: { ...invalidCodes, employerPosition: 'length' } });
		expect(result).not.toHaveProperty('input');
		expect(JSON.stringify(result)).not.toContain('private');
		expect(JSON.stringify(result)).not.toContain('x'.repeat(121));
	});

	test('ignores unrelated personal data and accepts null-prototype records', () => {
		const raw = Object.assign(Object.create(null), makeRaw(), {
			contact: 'Do not collect this contact', identifier: 'Do not collect this identifier'
		});
		expect(makeRaw()).toEqual(validated(raw));
		expect(Object.keys(validated(raw))).toEqual([...attendanceFields]);
	});

	test('does not accept inherited fields or non-record payloads', () => {
		const required = Object.fromEntries(attendanceFields.map((field) => [field, 'required']));
		for (const raw of [undefined, null, false, 'input', 1234, [], [makeRaw()], Object.create(makeRaw())]) {
			expectErrors(raw, required);
		}
	});

	test('does not mutate raw input on success or failure and detaches its canonical snapshot', () => {
		const raw = makeRaw({ studentName: '  María   Sofía  ' });
		const input = validated(Object.freeze({ ...raw }));
		expect(input.studentName).toBe('María Sofía');
		expect(raw.studentName).toBe('  María   Sofía  ');
		raw.studentName = 'Changed';
		expect(input.studentName).toBe('María Sofía');
		const invalid = Object.freeze(makeRaw({ programStartDate: '2026-02-30' }));
		expectErrors(invalid, { programStartDate: 'date' });
		expect(invalid.programStartDate).toBe('2026-02-30');
	});
});

describe('attendance text normalization and bounds', () => {
	for (const field of textFields) {
		test(`${field} trims, NFC-normalizes, and collapses spaces while preserving case`, () => {
			const value = '  Mari\u0301a\u00a0\u00a0SOFI\u0301A   de\u2003la  Cruz  ';
			expect(validated(makeRaw({ [field]: value }))[field]).toBe('María SOFÍA de la Cruz');
		});

		test(`${field} rejects controls and newlines, including at the boundaries`, () => {
			for (const control of ['\u0000', '\t', '\n', '\r', '\u001f', '\u007f', '\u0085', '\u00ad', '\u200b', '\u202e', '\u2028', '\u2029', '\ufeff']) {
				for (const value of [control, `${control}Name`, `Na${control}me`, `Name${control}`]) {
					expectErrors(makeRaw({ [field]: value }), { [field]: 'text' });
				}
			}
		});

		test(`${field} accepts the printable ASCII and Latin-1 WinAnsi ranges`, () => {
			const ascii = Array.from({ length: 95 }, (_, index) => String.fromCharCode(0x20 + index)).join('');
			const latin = Array.from({ length: 96 }, (_, index) => String.fromCharCode(0xa0 + index))
				.filter((character) => character !== '\u00ad').join('');
			expect(validated(makeRaw({ [field]: ascii }))[field]).toBe(ascii.trim());
			expect(validated(makeRaw({ [field]: latin }))[field]).toBe(latin.trim());
		});

		test(`${field} accepts every extra WinAnsi letter, symbol, and punctuation character`, () => {
			const value = '€ŒœŠšŸŽžƒˆ˜‘’‚“”„–—…†‡•‰‹›™';
			expect(validated(makeRaw({ [field]: value }))[field]).toBe(value);
		});

		test(`${field} rejects CJK, Greek, emoji, and other unsupported printable characters`, () => {
			for (const value of ['李 小龍', 'ΑΝΝΑ ΣΟΦΙΑ', '😀', 'María 李', 'Supervisor Ω', 'Location 🚀',
				'Łukasz', 'A\u0304', 'x\u0301', 'nonbreaking\u2011hyphen']) {
				expectErrors(makeRaw({ [field]: value }), { [field]: 'characters' });
			}
		});

		test(`${field} still reports text for controls even alongside unsupported characters`, () => {
			expectErrors(makeRaw({ [field]: '李\nΩ😀' }), { [field]: 'text' });
		});

		test(`${field} refreshes and clears a visible unsupported-character error`, () => {
			expect(revalidateAttendanceErrors(makeRaw({ [field]: '李 Ω 😀' }), { [field]: 'required' }))
				.toEqual({ [field]: 'characters' });
			expect(revalidateAttendanceErrors(makeRaw({ [field]: 'Mari\u0301a Mun\u0303oz — “Sí”' }), { [field]: 'characters' }))
				.toEqual({});
		});

		test(`${field} accepts its exact limit and rejects overflow without truncation`, () => {
			const limit = attendanceTextLimits[field];
			expect(validated(makeRaw({ [field]: 'a'.repeat(limit) }))[field]).toBe('a'.repeat(limit));
			expectErrors(makeRaw({ [field]: 'a'.repeat(limit + 1) }), { [field]: 'length' });
			expect(validated(makeRaw({ [field]: `  ${'e\u0301'.repeat(limit)}  ` }))[field]).toBe('é'.repeat(limit));
			expectErrors(makeRaw({ [field]: 'e\u0301'.repeat(limit + 1) }), { [field]: 'length' });
			expect(validated(makeRaw({ [field]: `  ${'a'.repeat(limit - 2)}    b  ` }))[field]).toHaveLength(limit);
		});
	}

	test('allows accented, hyphenated, and apostrophized WinAnsi names as text', () => {
		for (const studentName of ["ANA-MARÍA O'NEILL", 'O’NEILL', 'Zoë García']) {
			expect(validated(makeRaw({ studentName })).studentName).toBe(studentName);
					}
				});

				test('aggregates unsupported-character codes for every text field without echoing personal values', () => {
					const overrides = Object.fromEntries(textFields.map((field) => [field, `private-${field} 李 Ω 😀`]));
					const result = validateAttendanceInput(makeRaw(overrides));
					expect(result).toEqual({
						valid: false,
						errors: { studentName: 'characters', employerName: 'characters', employerPosition: 'characters', employerWorkplace: 'characters' }
					});
					expect(result).not.toHaveProperty('input');
					expect(JSON.stringify(result)).not.toContain('private');
					for (const value of Object.values(overrides)) expect(JSON.stringify(result)).not.toContain(value);
				});
			});

			describe('strict attendance choices', () => {
	test('rejects unknown, legacy, differently cased, or padded sex values', () => {
		for (const studentSex of ['other', 'Male', 'FEMALE', 'Masculino', 'Femenino', ' male', 'female ', 'female\n']) {
			expectErrors(makeRaw({ studentSex }), { studentSex: 'sex' });
		}
	});

	test('rejects unknown, legacy, differently cased, or padded cohort values', () => {
		for (const cohort of ['other', 'Basic', 'REGULAR', 'basico', 'básico', ' basic', 'regular ', 'basic\n']) {
			expectErrors(makeRaw({ cohort }), { cohort: 'cohort' });
		}
	});
});

describe('attendance rendered-name character coverage', () => {
	for (const field of ['studentName', 'employerName'] as const) {
		for (const [character, titleCased] of [['µ', 'Μ'], ['ƒ', 'Ƒ']] as const) {
			test(`${field} rejects ${character} when legacy title-casing makes it unsupported`, () => {
				expect(titleAttendanceName(character)).toBe(titleCased);
				for (const value of [character, `${character}aria`, `Ana ${character}aria`, `Ana-${character}aria`, `O'${character}aria`, `  Ana   ${character}aria  `]) {
					expectErrors(makeRaw({ [field]: value }), { [field]: 'characters' });
				}
			});
		}

		test(`${field} accepts internal µ/ƒ where legacy title-casing retains them`, () => {
			for (const [value, rendered] of [
				['alµa', 'Alµa'], ['alƒa', 'Alƒa'], ['AµNA', 'Aµna'], ['AƒNA', 'Aƒna'],
				['O’µNEILL', 'O’µneill'], ['O’ƒNEILL', 'O’ƒneill']
			]) {
				expect(validated(makeRaw({ [field]: value }))[field]).toBe(value);
				expect(titleAttendanceName(value)).toBe(rendered);
			}
		});

		test(`${field} refreshes and clears visible transformed-character errors`, () => {
			expect(revalidateAttendanceErrors(makeRaw({ [field]: 'µaria' }), { [field]: 'required' }))
				.toEqual({ [field]: 'characters' });
			expect(revalidateAttendanceErrors(makeRaw({ [field]: 'Aµna' }), { [field]: 'characters' }))
				.toEqual({});
		});
	}

	for (const field of ['employerPosition', 'employerWorkplace'] as const) {
		test(`${field} keeps supported µ/ƒ regardless of their position because it is not title-cased`, () => {
			for (const value of ['µ', 'ƒ', 'µg ƒactor', 'ƒ µ', 'Ana-µaria O’ƒaria']) {
				expect(validated(makeRaw({ [field]: value }))[field]).toBe(value);
			}
		});
	}

	test('returns only character codes when title-casing makes both names unsupported', () => {
		const result = validateAttendanceInput(makeRaw({ studentName: 'µprivate', employerName: 'ƒprivate' }));
		expect(result).toEqual({ valid: false, errors: { studentName: 'characters', employerName: 'characters' } });
		expect(result).not.toHaveProperty('input');
		expect(JSON.stringify(result)).not.toContain('private');
	});
});

describe('Gregorian attendance calendar dates', () => {
	for (const programStartDate of [
		'0001-01-01', '0004-02-29', '0400-02-29', '1582-10-10', '1900-02-28',
		'2000-02-29', '2024-02-29', '2026-04-30', '2026-12-31', '2400-02-29', '9999-12-31'
	]) {
		test(`accepts ${programStartDate} without limiting dates to the past`, () => {
			expect(validated(makeRaw({ programStartDate })).programStartDate).toBe(programStartDate);
		});
	}

	for (const programStartDate of [
		'0000-01-01', '0001-02-29', '0100-02-29', '1900-02-29', '2100-02-29',
		'2026-02-29', '2026-02-30', '2026-04-31', '2026-06-31', '2026-09-31', '2026-11-31',
		'2026-00-01', '2026-13-01', '2026-01-00', '2026-01-32', '9999-12-32',
		'10000-01-01', '-0001-01-01', '026-01-01', '2026-1-01', '2026-01-1',
		'2026/01/01', '04/15/2026', '２０２６-０４-１５', '2026-04-15T00:00:00Z',
		' 2026-04-15', '2026-04-15 ', '2026-04-15\n', '\t2026-04-15', '2026-04-15\u0000'
	]) {
		test(`rejects malformed or nonexistent calendar date ${JSON.stringify(programStartDate)}`, () => {
			expectErrors(makeRaw({ programStartDate }), { programStartDate: 'date' });
		});
	}

	test('checks the last valid and first invalid day of every month', () => {
		const monthLengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
		for (const [index, lastDay] of monthLengths.entries()) {
			const prefix = `2026-${String(index + 1).padStart(2, '0')}-`;
			expect(validated(makeRaw({ programStartDate: `${prefix}${lastDay}` })).programStartDate).toBe(`${prefix}${lastDay}`);
			expectErrors(makeRaw({ programStartDate: `${prefix}${lastDay + 1}` }), { programStartDate: 'date' });
		}
	});
});

describe('attendance FormData transport and untrusted entries', () => {
	test('reads only contracted fields and leaves strings unnormalized until validation', () => {
		const raw = makeRaw({ studentName: '  Mari\u0301a   SOFÍA  ' });
		const data = toFormData(raw);
		data.append('contact', 'Do not collect this contact');
		data.append('identifier', new File(['private'], 'unrelated.txt'));
		const entries = [...data.entries()];
		const result = readAttendanceFormData(data);
		expect(Object.keys(result)).toEqual([...attendanceFields]);
		expect(result).toEqual(raw);
		expect(validated(result).studentName).toBe('María SOFÍA');
		expect([...data.entries()]).toEqual(entries);
	});

	test('returns undefined for missing values rather than coercing them', () => {
		const raw = readAttendanceFormData(new FormData());
		expect(Object.keys(raw)).toEqual([...attendanceFields]);
		for (const field of attendanceFields) expect(raw[field]).toBeUndefined();
		expectErrors(raw, Object.fromEntries(attendanceFields.map((field) => [field, 'required'])));
	});

	for (const field of attendanceFields) {
		test(`rejects duplicate ${field} entries even when identical or blank`, () => {
			for (const value of [String(makeRaw()[field]), '']) {
				const data = toFormData();
				data.set(field, value);
				data.append(field, value);
				const raw = readAttendanceFormData(data);
				expect(raw[field]).toEqual([value, value]);
				expectErrors(raw, { [field]: invalidCodes[field] });
			}
		});

		test(`rejects a File entry for ${field}, including empty uploads`, () => {
			for (const content of ['', String(makeRaw()[field])]) {
				const data = toFormData();
				data.set(field, new File([content], 'untrusted.txt'));
				const raw = readAttendanceFormData(data);
				expect(raw[field]).toBeInstanceOf(File);
				expectErrors(raw, { [field]: invalidCodes[field] });
			}
		});

		test(`rejects mixed string/File ${field} duplicates in either order`, () => {
			const value = String(makeRaw()[field]);
			const upload = new File([value], 'untrusted.txt');
			for (const entries of [[value, upload], [upload, value]]) {
				const data = toFormData();
				data.delete(field);
				for (const entry of entries) data.append(field, entry);
				expectErrors(readAttendanceFormData(data), { [field]: invalidCodes[field] });
			}
		});
	}
});

describe('visible attendance validation errors while editing', () => {
	test('clears corrected errors while retaining visible unanswered fields', () => {
		expect(revalidateAttendanceErrors(makeRaw({ employerName: '' }), {
			studentName: 'required', employerName: 'required'
		})).toEqual({ employerName: 'required' });
	});

	for (const field of attendanceFields) {
		test(`refreshes the code for ${field} without introducing unrelated errors`, () => {
			const raw = Object.fromEntries(attendanceFields.map((key) => [key, '']));
			raw[field] = 'not\nvalid';
			expect(revalidateAttendanceErrors(raw, { [field]: 'required' })).toEqual({ [field]: invalidCodes[field] });
		});
	}

	test('updates an overlength text error to required after clearing the field', () => {
		expect(revalidateAttendanceErrors(makeRaw({ studentName: '' }), { studentName: 'length' }))
			.toEqual({ studentName: 'required' });
	});

	test('keeps untouched fields quiet even when the whole form is invalid', () => {
		expect(revalidateAttendanceErrors({}, {})).toEqual({});
		expect(revalidateAttendanceErrors({}, { cohort: 'required' })).toEqual({ cohort: 'required' });
	});

	test('returns a fresh empty record for a corrected form and preserves frozen inputs', () => {
		const raw = Object.freeze(makeRaw());
		const visibleErrors = Object.freeze<AttendanceErrors>({ studentName: 'required', programStartDate: 'date' });
		const result = revalidateAttendanceErrors(raw, visibleErrors);
		expect(result).toEqual({});
		expect(result).not.toBe(visibleErrors);
		expect(raw).toEqual(makeRaw());
		expect(visibleErrors).toEqual({ studentName: 'required', programStartDate: 'date' });
	});

	test('does not mutate raw input or visible errors when invalid fields remain', () => {
		const raw = Object.freeze(makeRaw({ studentName: 'Name\n', employerName: '' }));
		const visibleErrors = Object.freeze<AttendanceErrors>({ studentName: 'required' });
		expect(revalidateAttendanceErrors(raw, visibleErrors)).toEqual({ studentName: 'text' });
		expect(raw.studentName).toBe('Name\n');
		expect(visibleErrors).toEqual({ studentName: 'required' });
	});
});
