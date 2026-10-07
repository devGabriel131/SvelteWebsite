import { getDatabase } from '#lib/server/db/index.ts';
import { eventReport, reportCsv } from '#lib/server/bootcamp/admin.ts';
import { requireViewer } from '#lib/server/bootcamp/http.ts';
import { id } from '#lib/server/bootcamp/validation.ts';
import { resolveLanguage } from '#lib/i18n/translations.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
	requireViewer(locals, 'admin');
	const eventId = id(url.searchParams.get('event'));
	const rows = await eventReport(getDatabase(), eventId);
	return new Response(reportCsv(rows, resolveLanguage(url.searchParams.get('language') ?? locals.language)), { headers: {
		'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="bootcamp-${eventId}.csv"`,
		'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff'
	} });
};
