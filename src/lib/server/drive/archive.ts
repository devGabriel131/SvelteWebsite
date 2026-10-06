import type { Language } from '../../i18n/translations';
import type { DriveClient } from './client';

export type ReportFiles = Record<Language, { bytes: Uint8Array; filename: string }>;
export type ReportArchive = (files: ReportFiles, signal?: AbortSignal) => Promise<void>;
export type GetReportArchive = () => ReportArchive | null;

export function createReportArchive(client: DriveClient, parentFolderId: string): ReportArchive {
	return async (files, signal) => {
		// Pair both languages without overwriting another submission with the same filename.
		const archiveId = crypto.randomUUID();
		const results = await Promise.allSettled(Object.values(files).map((file) => client.upload({
			bytes: file.bytes,
			filename: `${file.filename.replace(/\.pdf$/i, '')}_${archiveId}.pdf`,
			mimeType: 'application/pdf',
			parentFolderId
		}, signal)));
		// Await both requests, including on failure: never leave an upload running after returning.
		for (const result of results) {
			if (result.status === 'rejected') throw result.reason;
		}
	};
}
