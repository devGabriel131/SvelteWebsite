import { error, fail, type Actions } from '@sveltejs/kit';
import { translations } from '#lib/i18n/translations.ts';
import { assessIst } from '#lib/ist/assessment.ts';
import { presentIstAssessment } from '#lib/ist/presentation.ts';
import { exerciseKeys, istFields, type IstFormValues } from '#lib/ist/types.ts';
import { readIstFormData, validateIstInput } from '#lib/ist/validation.ts';
import type { GetReportArchive } from './drive/archive';
import { generateIstPdf } from './ist-pdf';
import { generateReportDownloads } from './report-downloads';

export function createIstActions(getArchive: GetReportArchive) {
	return {
		default: async ({ request, setHeaders, locals }) => {
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
				return { values, errors: {}, assessment: null, reports: null, serverError: false, archiveError: null, archived: false };
			}

			const validation = validateIstInput(raw);
			if (!validation.valid) {
				return fail(400, {
					values, errors: validation.errors, assessment: null, reports: null,
					serverError: false, archiveError: null, archived: false
				});
			}

			const assessment = assessIst(validation.input, new Date().toISOString());
			const result = await generateReportDownloads({
				getArchive, locals, signal: request.signal,
				generate: async () => {
					// Generate both languages from this exact result: switching language never regrades it.
					const [en, es] = await Promise.all([
						generateIstPdf(presentIstAssessment(assessment, 'en')),
						generateIstPdf(presentIstAssessment(assessment, 'es'))
					]);
					const date = assessment.assessedAt.slice(0, 10);
					return {
						en: { bytes: en, filename: `${translations.en.ist.reportFilename}-${date}_en.pdf` },
						es: { bytes: es, filename: `${translations.es.ist.reportFilename}-${date}_es.pdf` }
					};
				}
			});
			const { serverError, archiveError, archived } = result;
			if (!result.ok) {
				return fail(result.status, { values, errors: {}, assessment: null, reports: null, serverError, archiveError, archived });
			}
			return { values, errors: {}, assessment, reports: result.reports, serverError, archiveError, archived };
		}
	} satisfies Actions;
}
