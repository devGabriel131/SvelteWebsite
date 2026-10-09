import {
	GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET,
	DRIVE_OAUTH_REFRESH_TOKEN, DRIVE_REPORTS_FOLDER_ID
} from '$app/env/private';
import { createReportArchive, type ReportArchive } from './archive';
import { createDriveClient, type DriveClient } from './client';
import { isDriveEnabled, readDriveConfig } from './config';

const environment = { GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, DRIVE_OAUTH_REFRESH_TOKEN, DRIVE_REPORTS_FOLDER_ID };
export type DriveBinding = { client: DriveClient; folderId: string; archive: ReportArchive };
let drive: DriveBinding | null | undefined;

export function getDrive(): DriveBinding | null {
	if (drive !== undefined) return drive;
	const config = readDriveConfig(environment);
	if (!config) return drive = null;
	const client = createDriveClient(config);
	drive = { client, folderId: config.reportsFolderId, archive: createReportArchive(client, config.reportsFolderId) };
	return drive;
}

export function getReportArchive(): ReportArchive | null {
	return getDrive()?.archive ?? null;
}

export function getReportArchivePageState() {
	return { driveArchiveEnabled: isDriveEnabled(environment) };
}
