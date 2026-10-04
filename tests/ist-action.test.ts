import { describe, expect, test } from 'bun:test';
import { actions } from '../src/routes/ist/+page.server';
import { istFields, type IstField, type IstFormValues } from '../src/lib/ist/types';
import { presentIstAssessment } from '../src/lib/ist/presentation';

function recordedValues(): IstFormValues {
	return {
		studentName: 'José María Muñoz', sex: 'male', age: '19', weightLb: '170.25', waistIn: '33.125',
		pushUpsStatus: 'recorded', pushUpsValue: '56', sitUpsStatus: 'recorded', sitUpsValue: '65',
		plankStatus: 'recorded', plankMinutes: '2', plankSeconds: '35',
		runStatus: 'recorded', runMinutes: '7', runSeconds: '45'
	};
}

async function submit(values: Partial<IstFormValues>, ...extras: [string, string | File][]) {
	const data = new FormData();
	for (const field of istFields) {
		if (values[field] !== undefined) data.append(field, values[field]);
	}
	for (const extra of extras) data.append(...extra);
	const headers: Record<string, string> = {};
	const result = await actions.default({
		request: new Request('http://localhost/ist', { method: 'POST', body: data }),
		setHeaders: (next: Record<string, string>) => Object.assign(headers, next)
	} as Parameters<typeof actions.default>[0]);
	return { result, headers };
}

describe('IST server form action', () => {
	test('returns one evaluated snapshot and bilingual PDF downloads without caching personal data', async () => {
		const { result, headers } = await submit(recordedValues());
		if ('status' in result) throw new Error(`Unexpected action failure: ${result.status}`);
		if (!result.assessment || !result.reports) throw new Error('Expected an assessment and PDF reports');
		expect(headers['cache-control']).toBe('no-store');
		expect(result.errors).toEqual({});
		expect(result.serverError).toBe(false);
		expect(result.assessment.input.studentName).toBe('José María Muñoz');
		expect(result.assessment.input.weightLb).toBe(170.25);
		expect(result.assessment.input.waistIn).toBe(33.125);
		expect(result.assessment.passed).toBe(true);
		expect(Number.isNaN(Date.parse(result.assessment.assessedAt))).toBe(false);
		for (const language of ['en', 'es'] as const) {
			expect(Buffer.from(result.reports[language], 'base64').subarray(0, 5).toString()).toBe('%PDF-');
			expect(presentIstAssessment(result.assessment, language).rows).toHaveLength(5);
		}
		expect(result.reports.en).not.toBe(result.reports.es);
	});

	test('valid below-baseline results generate a report instead of a validation error', async () => {
		const { result } = await submit({ ...recordedValues(), pushUpsValue: '0' });
		if ('status' in result) throw new Error(`Unexpected action failure: ${result.status}`);
		if (!result.assessment || !result.reports) throw new Error('Expected an assessment and PDF reports');
		expect(result.assessment.passed).toBe(false);
		expect(result.assessment.belowBaseline).toEqual(['pushUps']);
		expect(result.assessment.exercises[0].result).toEqual({ status: 'recorded', value: 0 });
		expect(result.reports.en.length).toBeGreaterThan(0);
	});

	test('an unable-to-complete exercise requires no dummy result and fails overall readiness', async () => {
		const values: Partial<IstFormValues> = { ...recordedValues(), runStatus: 'unable_to_complete' };
		delete values.runMinutes;
		delete values.runSeconds;
		const { result } = await submit(values);
		if ('status' in result) throw new Error(`Unexpected action failure: ${result.status}`);
		if (!result.assessment) throw new Error('Expected an assessment');
		expect(result.assessment.input.run).toEqual({ status: 'unable_to_complete' });
		expect(result.assessment.belowBaseline).toEqual(['run']);
		expect(result.values.runMinutes).toBe('');
		expect(result.values.runSeconds).toBe('');
	});

	const exercises = [
		{ key: 'pushUps', status: 'pushUpsStatus', fields: ['pushUpsValue'] },
		{ key: 'sitUps', status: 'sitUpsStatus', fields: ['sitUpsValue'] },
		{ key: 'plank', status: 'plankStatus', fields: ['plankMinutes', 'plankSeconds'] },
		{ key: 'run', status: 'runStatus', fields: ['runMinutes', 'runSeconds'] }
	] as const;

	for (const { key, status, fields } of exercises) {
		test(`native ${key} choice clears a recorded result before assessment and preserves other entries`, async () => {
			const original = recordedValues();
			const { result, headers } = await submit(original, ['exerciseChoice', `${status}:unable_to_complete`]);
			if ('status' in result) throw new Error(`Unexpected action failure: ${result.status}`);
			expect(headers['cache-control']).toBe('no-store');
			expect(result.assessment).toBeNull();
			expect(result.reports).toBeNull();
			expect(result.errors).toEqual({});
			expect(result.serverError).toBe(false);
			const expected = { ...original, [status]: 'unable_to_complete' };
			for (const field of fields) expected[field] = '';
			expect(result.values).toEqual(expected);

			// Native disabled result fields are omitted on the next form submission.
			const finalValues: Partial<IstFormValues> = { ...result.values };
			for (const field of fields) delete finalValues[field];
			const assessment = (await submit(finalValues)).result;
			if ('status' in assessment || !assessment.assessment || !assessment.reports) {
				throw new Error('Native exercise transition did not produce an assessment');
			}
			expect(assessment.assessment.input[key]).toEqual({ status: 'unable_to_complete' });
			expect(assessment.assessment.passed).toBe(false);
			expect(assessment.assessment.belowBaseline).toEqual([key]);
		});

		test(`native ${key} choice can recover from a contradictory submission without generating a report`, async () => {
			const invalid = (await submit({ ...recordedValues(), [status]: 'unable_to_complete' })).result;
			if (!('status' in invalid)) throw new Error('Contradictory input unexpectedly accepted');
			expect(invalid.status).toBe(400);
			for (const field of fields) expect(invalid.data.errors[field]).toBe('inconsistent');

			const recovery = (await submit(invalid.data.values, ['exerciseChoice', `${status}:unable_to_complete`])).result;
			if ('status' in recovery) throw new Error(`Unexpected action failure: ${recovery.status}`);
			expect(recovery.values[status]).toBe('unable_to_complete');
			for (const field of fields) expect(recovery.values[field]).toBe('');
			expect(recovery.errors).toEqual({});
			expect(recovery.assessment).toBeNull();
			expect(recovery.reports).toBeNull();
		});

		test(`native ${key} choice can return to recorded, but still requires a new numeric result`, async () => {
			const original: Partial<IstFormValues> = { ...recordedValues(), [status]: 'unable_to_complete' };
			for (const field of fields) delete original[field];
			const update = (await submit(original, ['exerciseChoice', `${status}:recorded`])).result;
			if ('status' in update) throw new Error(`Unexpected action failure: ${update.status}`);
			expect(update.values[status]).toBe('recorded');
			for (const field of fields) expect(update.values[field]).toBe('');
			expect(update.assessment).toBeNull();

			const missing = (await submit(update.values)).result;
			if (!('status' in missing)) throw new Error('Missing recorded result unexpectedly accepted');
			expect(missing.status).toBe(400);
			for (const field of fields) expect(missing.data.errors[field]).toBe('required');
			expect(missing.data.assessment).toBeNull();
		});
	}

	test('native choices keep an incomplete form editable and preserve zero repetitions', async () => {
		const original = { ...recordedValues(), studentName: '', age: '', weightLb: '170abc', pushUpsValue: '0' };
		const { result } = await submit(original, ['exerciseChoice', 'pushUpsStatus:recorded']);
		if ('status' in result) throw new Error(`Unexpected action failure: ${result.status}`);
		expect(result.values).toEqual(original);
		expect(result.errors).toEqual({});
		expect(result.assessment).toBeNull();
		expect(result.reports).toBeNull();
	});

	test('rejects malformed, duplicate, or uploaded native exercise choices', async () => {
		for (const choice of [
			'', 'pushUps:recorded', 'runStatus:unknown', 'weightLb:recorded',
			'plankStatus:unable_to_complete:recorded', new File(['runStatus:recorded'], 'choice.txt')
		]) {
			await expect(submit(recordedValues(), ['exerciseChoice', choice])).rejects.toMatchObject({ status: 400 });
		}
		await expect(submit(recordedValues(),
			['exerciseChoice', 'pushUpsStatus:recorded'], ['exerciseChoice', 'pushUpsStatus:unable_to_complete']
		)).rejects.toMatchObject({ status: 400 });
	});

	for (const [field, value, error] of [
		['studentName', ' ', 'required'], ['sex', 'other', 'sex'], ['age', '17.5', 'whole'],
		['weightLb', '170abc', 'number'], ['waistIn', '', 'required'],
		['pushUpsStatus', '', 'required'], ['sitUpsValue', '-1', 'range'],
		['runSeconds', '60', 'range'], ['plankMinutes', '0', 'range']
	] as const) {
		test(`blocks invalid ${field} on the server and preserves editable values`, async () => {
			const values = { ...recordedValues(), [field]: value };
			if (field === 'plankMinutes') values.plankSeconds = '0';
			const { result, headers } = await submit(values);
			if (!('status' in result)) throw new Error('Invalid input unexpectedly generated a report');
			expect(result.status).toBe(400);
			expect(result.data.errors[field]).toBe(error);
			expect(result.data.values[field]).toBe(value);
			expect(result.data.assessment).toBeNull();
			expect(result.data.reports).toBeNull();
			expect(headers['cache-control']).toBe('no-store');
		});
	}

	test('blocks impossible raw body fat rather than producing a failed assessment', async () => {
		const { result } = await submit({ ...recordedValues(), weightLb: '400', waistIn: '18' });
		if (!('status' in result)) throw new Error('Invalid body fat unexpectedly generated a report');
		expect(result.status).toBe(400);
		expect(result.data.errors).toMatchObject({ weightLb: 'bodyFat', waistIn: 'bodyFat' });
		expect(result.data.assessment).toBeNull();
	});

	test('rejects an inconsistent inability with a recorded value', async () => {
		const { result } = await submit({ ...recordedValues(), pushUpsStatus: 'unable_to_complete' });
		if (!('status' in result)) throw new Error('Inconsistent exercise unexpectedly generated a report');
		expect(result.status).toBe(400);
		expect(result.data.errors.pushUpsValue).toBe('inconsistent');
	});

	test('rejects duplicate fields and uploaded files rather than silently coercing them', async () => {
		for (const extra of [
			['age', '19'], ['studentName', new File(['Student'], 'name.txt')]
		] as [IstField, string | File][]) {
			const { result } = await submit(recordedValues(), extra);
			if (!('status' in result)) throw new Error('Malformed form unexpectedly generated a report');
			expect(result.status).toBe(400);
			expect(result.data.values[extra[0]]).toBe('');
			expect(result.data.assessment).toBeNull();
		}
	});
});
