import { bootcampServices } from '#lib/server/bootcamp/runtime.ts';
import { errorCode, limitRequest, pdfResponse, requireOrigin, requireViewer } from '#lib/server/bootcamp/http.ts';
import { readForm } from '#lib/server/bootcamp/validation.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, request }) => {
	const viewer = requireViewer(locals, 'student');
	try {
		requireOrigin(request);
		const { db, registration } = bootcampServices();
		await limitRequest(db, `preview:${viewer.id}`, 5);
		const preview = await registration.previewDocument(viewer.id, await readForm(request));
		const response = pdfResponse(preview.pdf, 'bootcamp-waiver-preview.pdf');
		response.headers.set('X-Bootcamp-Preview-Token', preview.token);
		return response;
	} catch (cause) {
		return Response.json({ error: errorCode(cause) }, { status: 400, headers: { 'cache-control': 'private, no-store' } });
	}
};
