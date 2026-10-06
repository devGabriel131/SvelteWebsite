import { DriveError } from './client';

export type DriveEnvironment = {
	GOOGLE_OAUTH_CLIENT_ID?: string;
	GOOGLE_OAUTH_CLIENT_SECRET?: string;
	DRIVE_OAUTH_REFRESH_TOKEN?: string;
	DRIVE_REPORTS_FOLDER_ID?: string;
};

export type DriveConfig = {
	clientId: string;
	clientSecret: string;
	refreshToken: string;
	reportsFolderId: string;
};

export function isDriveEnabled(env: DriveEnvironment): boolean {
	return Boolean(env.DRIVE_REPORTS_FOLDER_ID?.trim() || env.DRIVE_OAUTH_REFRESH_TOKEN?.trim());
}

export function readDriveConfig(env: DriveEnvironment): DriveConfig | null {
	if (!isDriveEnabled(env)) return null;

	const values = {
		GOOGLE_OAUTH_CLIENT_ID: env.GOOGLE_OAUTH_CLIENT_ID?.trim(),
		GOOGLE_OAUTH_CLIENT_SECRET: env.GOOGLE_OAUTH_CLIENT_SECRET?.trim(),
		DRIVE_OAUTH_REFRESH_TOKEN: env.DRIVE_OAUTH_REFRESH_TOKEN?.trim(),
		DRIVE_REPORTS_FOLDER_ID: env.DRIVE_REPORTS_FOLDER_ID?.trim()
	};
	const missing = Object.entries(values).filter(([, value]) => !value).map(([name]) => name);
	if (missing.length) {
		throw new DriveError('configuration', `Missing Drive configuration: ${missing.join(', ')}.`);
	}

	return {
		clientId: values.GOOGLE_OAUTH_CLIENT_ID!,
		clientSecret: values.GOOGLE_OAUTH_CLIENT_SECRET!,
		refreshToken: values.DRIVE_OAUTH_REFRESH_TOKEN!,
		reportsFolderId: values.DRIVE_REPORTS_FOLDER_ID!
	};
}
