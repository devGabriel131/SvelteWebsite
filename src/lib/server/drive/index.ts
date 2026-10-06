import {
	GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET,
	DRIVE_OAUTH_REFRESH_TOKEN, DRIVE_REPORTS_FOLDER_ID
} from '$app/env/private';
import { createReportArchive, type ReportArchive } from './archive';
import { createDriveClient } from './client';
import { isDriveEnabled, readDriveConfig } from './config';

const environment = { GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, DRIVE_OAUTH_REFRESH_TOKEN, DRIVE_REPORTS_FOLDER_ID };
let archive: ReportArchive | null | undefined;

export function getReportArchive(): ReportArchive | null {
	if (archive !== undefined) return archive;
	const config = readDriveConfig(environment);
	archive = config ? createReportArchive(createDriveClient(config), config.reportsFolderId) : null;
	return archive;
}

export function getReportArchivePageState() {
	return { driveArchiveEnabled: isDriveEnabled(environment) };
}
