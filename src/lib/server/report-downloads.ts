import { Buffer } from 'node:buffer';
import type { RequestEvent } from '@sveltejs/kit';
import type { Language } from '../i18n/translations';
import { getViewer } from './auth/access';
import type { GetReportArchive, ReportFiles } from './drive/archive';
import { DriveError } from './drive/client';

type ReportFailure =
	| { ok: false; status: 401; failure: 'signIn' }
	| { ok: false; status: 503; failure: 'unavailable' | 'generation' };

type ReportSuccess = {
	ok: true;
	archived: boolean;
	reports: Record<Language, string>;
};

export type ReportActionEvent = Pick<RequestEvent, 'request' | 'setHeaders'> & {
	locals: Pick<App.Locals, 'user' | 'session'>;
};

export async function generateReportDownloads({ getArchive, locals, signal, generate }: {
	getArchive: GetReportArchive;
	locals: Pick<App.Locals, 'user' | 'session'>;
	signal: AbortSignal;
	generate: () => Promise<ReportFiles>;
}): Promise<ReportSuccess | ReportFailure> {
	let archive;
	try {
		archive = getArchive();
	} catch (error) {
		logArchiveError(error);
		return { ok: false, status: 503, failure: 'unavailable' };
	}
	if (archive && !getViewer(locals)) {
		return { ok: false, status: 401, failure: 'signIn' };
	}

	let files: ReportFiles;
	try {
		files = await generate();
	} catch {
		console.error('Unable to generate report PDFs');
		return { ok: false, status: 503, failure: 'generation' };
	}
	if (archive) {
		try {
			await archive(files, signal);
		} catch (error) {
			logArchiveError(error);
			return { ok: false, status: 503, failure: 'unavailable' };
		}
	}
	return {
		ok: true, archived: Boolean(archive),
		reports: { en: Buffer.from(files.en.bytes).toString('base64'), es: Buffer.from(files.es.bytes).toString('base64') }
	};
}

function logArchiveError(error: unknown) {
	// Log only categories/status, never submitted details, PDFs, credentials, or upstream bodies.
	console.error('Unable to archive report PDFs', error instanceof DriveError
		? { kind: error.kind, status: error.status } : { kind: 'unknown' });
}
