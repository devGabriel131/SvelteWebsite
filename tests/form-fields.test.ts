import { describe, expect, test } from 'bun:test';
import { formValues, readFormFields, refreshVisibleErrors } from '../src/lib/form-fields';

const fields = ['name', 'choice', 'missing'] as const;

describe('shared form field boundary', () => {
	test('keeps exact strings, duplicate order, Files and missing entries without touching unrelated input', async () => {
		const data = new FormData();
		const upload = new File(['private'], 'choice.txt');
		data.append('name', '  Mari\u0301a\n\u0000  ');
		data.append('choice', upload);
		data.append('choice', 'same');
		data.append('choice', 'same');
		data.append('unrelated', 'ignored');
		const before = [...data.entries()];
		const raw = readFormFields(data, fields);
		expect(raw).toEqual({ name: '  Mari\u0301a\n\u0000  ', choice: [upload, 'same', 'same'], missing: undefined });
		expect(formValues(raw, fields)).toEqual({ name: '  Mari\u0301a\n\u0000  ', choice: '', missing: '' });
		expect([...data.entries()]).toEqual(before);
		data.set('choice', upload);
		const value = readFormFields(data, fields).choice;
		if (!(value instanceof File)) throw new Error('Expected one uploaded file');
		expect(value.name).toBe('choice.txt');
		expect(await value.text()).toBe('private');
		expect(formValues(readFormFields(data, fields), fields).choice).toBe('');
	});

	test('echoes only strings verbatim without coercing invalid raw values', () => {
		const raw = Object.freeze({ name: '  unchanged  ', choice: { toString() { throw new Error('Must not coerce'); } } });
		expect(formValues(raw, fields)).toEqual({ name: '  unchanged  ', choice: '', missing: '' });
	});

	test('refreshes only visible invalid fields, clears corrected ones and preserves frozen inputs', () => {
		const visible = Object.freeze({ name: 'required', choice: 'required' } as const);
		const validation = Object.freeze({ valid: false, errors: Object.freeze({ name: 'length', missing: 'required' }) } as const);
		expect(refreshVisibleErrors(validation, visible)).toEqual({ name: 'length' });
		expect(refreshVisibleErrors(validation, {})).toEqual({});
		const corrected = refreshVisibleErrors({ valid: true }, visible);
		expect(corrected).toEqual({});
		expect(corrected).not.toBe(visible);
		expect(visible).toEqual({ name: 'required', choice: 'required' });
		expect(validation.errors).toEqual({ name: 'length', missing: 'required' });
	});
});
