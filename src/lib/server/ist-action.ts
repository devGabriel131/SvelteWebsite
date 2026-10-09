import { error, fail, type Actions } from '@sveltejs/kit';
import { formValues, readFormFields } from '#lib/form-fields.ts';
import { assessIst } from '#lib/ist/assessment.ts';
import { presentIstAssessment } from '#lib/ist/presentation.ts';
import { exerciseKeys, exerciseValueFields, istFields } from '#lib/ist/types.ts';
import { validateIstInput } from '#lib/ist/validation.ts';
import type { GetReportArchive } from './drive/archive';
import { generateIstPdf } from './ist-pdf';
import { generateReportDownloads, type ReportActionEvent } from './report-downloads';

export function createIstActions(getArchive: GetReportArchive) {
	return {
		default: async ({ request, setHeaders, locals }: ReportActionEvent) => {
			setHeaders({ 'cache-control': 'no-store' });
			const data = await request.formData();
			const raw = readFormFields(data, istFields);
			const values = formValues(raw, istFields);

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
					for (const field of exerciseValueFields[exercise]) values[field] = '';
				}
				return { values };
			}

			const validation = validateIstInput(raw);
			if (!validation.valid) {
				return fail(400, { values, errors: validation.errors });
			}

			const assessment = assessIst(validation.input, new Date().toISOString());
			const result = await generateReportDownloads({
				getArchive, locals, signal: request.signal,
				generate: async () => {
					// Generate both languages from this exact result: switching language never regrades it.
					const english = presentIstAssessment(assessment, 'en');
					const spanish = presentIstAssessment(assessment, 'es');
					const [en, es] = await Promise.all([generateIstPdf(english), generateIstPdf(spanish)]);
					return {
						en: { bytes: en, filename: english.filename.replace(/\.pdf$/, '_en.pdf') },
						es: { bytes: es, filename: spanish.filename.replace(/\.pdf$/, '_es.pdf') }
					};
				}
			});
			if (!result.ok) {
				return fail(result.status, { values, failure: result.failure });
			}
			return { values, assessment, reports: result.reports, archived: result.archived };
		}
	} satisfies Actions;
}
