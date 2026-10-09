import { getDatabase } from '#lib/server/db/index.ts';
import { eventReport, reportCsv } from '#lib/server/bootcamp/admin.ts';
import { requireAdminEvent, requireViewer } from '#lib/server/bootcamp/http.ts';
import { resolveLanguage } from '#lib/i18n/translations.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url, setHeaders }) => {
	setHeaders({ 'cache-control': 'private, no-store' });
	requireViewer(locals, 'admin');
	const db = getDatabase();
	const event = await requireAdminEvent(db, url.searchParams.get('event'), locals.language);
	const rows = await eventReport(db, event.id);
	return new Response(reportCsv(rows, resolveLanguage(url.searchParams.get('language') ?? locals.language)), { headers: {
		'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="bootcamp-${event.id}.csv"`,
		'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff'
	} });
};
