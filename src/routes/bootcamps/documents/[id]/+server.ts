import { error } from '@sveltejs/kit';
import { getDatabase } from '#lib/server/db/index.ts';
import { documentForViewer } from '#lib/server/bootcamp/registration.ts';
import { pdfResponse, requireViewer } from '#lib/server/bootcamp/http.ts';
import { uuidPattern } from '#lib/server/bootcamp/validation.ts';
import { translations } from '#lib/i18n/translations.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	const viewer = requireViewer(locals);
	const unavailable = translations[locals.language].bootcamp.errors.unavailable;
	if (!uuidPattern.test(params.id)) error(404, unavailable);
	const document = await documentForViewer(getDatabase(), params.id, viewer);
	if (!document) error(404, unavailable);
	return pdfResponse(document.pdf, `bootcamp-${document.kind}-${document.language}-${document.id}.pdf`);
};
