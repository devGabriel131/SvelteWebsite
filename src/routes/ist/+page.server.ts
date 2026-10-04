import { error, fail } from '@sveltejs/kit';
import { assessIst } from '#lib/ist/assessment.ts';
import { presentIstAssessment } from '#lib/ist/presentation.ts';
import { exerciseKeys, istFields, type IstFormValues } from '#lib/ist/types.ts';
import { readIstFormData, validateIstInput } from '#lib/ist/validation.ts';
import { generateIstPdf } from '#lib/server/ist-pdf.ts';
import type { Actions } from './$types';

export const actions = {
	default: async ({ request, setHeaders }) => {
		setHeaders({ 'cache-control': 'no-store' });
		const data = await request.formData();
		const raw = readIstFormData(data);
		const values = Object.fromEntries(istFields.map((field) => [
			field, typeof raw[field] === 'string' ? raw[field] : ''
		])) as IstFormValues;

		if (data.has('exerciseChoice')) {
			const choices = data.getAll('exerciseChoice');
			const choice = choices[0];
			const exercise = exerciseKeys.find((key) =>
				choice === `${key}Status:recorded` || choice === `${key}Status:unable_to_complete`
			);
			if (choices.length !== 1 || !exercise) error(400);

			// Native choice buttons edit the form; they never assess contradictory input.
			const status = choice === `${exercise}Status:recorded` ? 'recorded' : 'unable_to_complete';
			values[`${exercise}Status`] = status;
			if (status === 'unable_to_complete') {
				if (exercise === 'run' || exercise === 'plank') {
					values[`${exercise}Minutes`] = '';
					values[`${exercise}Seconds`] = '';
				} else {
					values[`${exercise}Value`] = '';
				}
			}
			return { values, errors: {}, assessment: null, reports: null, serverError: false };
		}

		const validation = validateIstInput(raw);
		if (!validation.valid) {
			return fail(400, { values, errors: validation.errors, assessment: null, reports: null, serverError: false });
		}

		const assessment = assessIst(validation.input, new Date().toISOString());
		try {
			// Generate both languages from this exact result: switching language never regrades it.
			const [english, spanish] = await Promise.all([
				generateIstPdf(presentIstAssessment(assessment, 'en')),
				generateIstPdf(presentIstAssessment(assessment, 'es'))
			]);
			return {
				values, errors: {}, assessment, serverError: false,
				reports: { en: english.toString('base64'), es: spanish.toString('base64') }
			};
		} catch (error) {
			console.error('Unable to generate IST PDF reports', error);
			return fail(503, { values, errors: {}, assessment: null, reports: null, serverError: true });
		}
	}
} satisfies Actions;
