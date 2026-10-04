import { fail } from '@sveltejs/kit';
import { assessIst } from '#lib/ist/assessment.ts';
import { presentIstAssessment } from '#lib/ist/presentation.ts';
import { istFields, type IstFormValues } from '#lib/ist/types.ts';
import { readIstFormData, validateIstInput } from '#lib/ist/validation.ts';
import { generateIstPdf } from '#lib/server/ist-pdf.ts';
import type { Actions } from './$types';

export const actions = {
	default: async ({ request, setHeaders }) => {
		setHeaders({ 'cache-control': 'no-store' });
		const raw = readIstFormData(await request.formData());
		const values = Object.fromEntries(istFields.map((field) => [
			field, typeof raw[field] === 'string' ? raw[field] : ''
		])) as IstFormValues;
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
