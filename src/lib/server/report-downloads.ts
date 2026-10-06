import { Buffer } from 'node:buffer';
import { getViewer } from './auth/access';
import type { GetReportArchive, ReportFiles } from './drive/archive';
import { DriveError } from './drive/client';

type ReportFailure = {
	ok: false;
	status: 401 | 503;
	serverError: boolean;
	archiveError: 'signIn' | 'unavailable' | null;
	archived: false;
};

type ReportSuccess = {
	ok: true;
	serverError: false;
	archiveError: null;
	archived: boolean;
	reports: { en: string; es: string };
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
		return { ok: false, status: 503, serverError: false, archiveError: 'unavailable', archived: false };
	}
	if (archive && !getViewer(locals)) {
		return { ok: false, status: 401, serverError: false, archiveError: 'signIn', archived: false };
	}

	let files: ReportFiles;
	try {
		files = await generate();
	} catch {
		console.error('Unable to generate report PDFs');
		return { ok: false, status: 503, serverError: true, archiveError: null, archived: false };
	}
	if (archive) {
		try {
			await archive(files, signal);
		} catch (error) {
			logArchiveError(error);
			return { ok: false, status: 503, serverError: false, archiveError: 'unavailable', archived: false };
		}
	}
	return {
		ok: true, serverError: false, archiveError: null, archived: Boolean(archive),
		reports: { en: Buffer.from(files.en.bytes).toString('base64'), es: Buffer.from(files.es.bytes).toString('base64') }
	};
}

function logArchiveError(error: unknown) {
	// Log only categories/status, never submitted details, PDFs, credentials, or upstream bodies.
	console.error('Unable to archive report PDFs', error instanceof DriveError
		? { kind: error.kind, status: error.status } : { kind: 'unknown' });
}
