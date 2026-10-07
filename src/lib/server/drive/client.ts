import { createGoogleClient, GoogleApiError, type GoogleClientOptions, type GoogleErrorKind } from '../google/client';
import type { DriveConfig } from './config';

export type DriveErrorKind = GoogleErrorKind;

export class DriveError extends GoogleApiError {}

export type DriveUpload = {
	bytes: Uint8Array;
	filename: string;
	mimeType?: string;
	parentFolderId: string;
	/** An ID from generateFileId(), persisted by the caller before sending the upload. */
	id?: string;
	appProperties?: Record<string, string>;
};

export type DriveFile = {
	id: string;
	name: string;
	mimeType: string;
	parents: string[];
	appProperties: Record<string, string>;
	trashed: boolean;
	size?: string;
	sha256Checksum?: string;
};

export type DriveFolder = {
	name: string;
	parentFolderId: string;
};

export type DriveClientOptions = GoogleClientOptions;

export type DriveClient = {
	upload(file: DriveUpload, signal?: AbortSignal): Promise<string>;
	createFolder(folder: DriveFolder, signal?: AbortSignal): Promise<string>;
	// Optional so existing upload-only adapters remain compatible.
	generateFileId?(signal?: AbortSignal): Promise<string>;
	getFile?(id: string, signal?: AbortSignal): Promise<DriveFile>;
};

export type DriveClientWithFileIds = DriveClient & Required<Pick<DriveClient, 'generateFileId' | 'getFile'>>;

const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id&supportsAllDrives=true';
const filesUrl = 'https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true';
const generateIdsUrl = 'https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=drive&type=files&fields=ids';
const fileFields = 'id,name,mimeType,parents,appProperties,trashed,size,sha256Checksum';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonblank(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

function isFileId(value: unknown): value is string {
	return typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value);
}

function isProperties(value: unknown): value is Record<string, string> {
	return isRecord(value) && Object.entries(value).every(([key, item]) => isNonblank(key) && typeof item === 'string');
}


export function createDriveClient(config: DriveConfig, options: DriveClientOptions = {}): DriveClientWithFileIds {
	if (![config.clientId, config.clientSecret, config.refreshToken, config.reportsFolderId].every(isNonblank)) {
		throw new DriveError('configuration', 'Drive client configuration requires nonblank credentials and reportsFolderId.');
	}
	const google = createGoogleClient(config, { ...options, service: 'Google Drive', error: DriveError });

	async function get(url: string, signal?: AbortSignal) {
		return google.request(url, { method: 'GET', cache: 'no-store' }, signal);
	}

	async function create(url: string, contentType: string, body: BodyInit, signal?: AbortSignal): Promise<string> {
		const { data, status } = await google.request(url, {
			method: 'POST', headers: { 'Content-Type': contentType }, body
		}, signal);
		if (!isRecord(data) || !isNonblank(data.id)) {
			throw new DriveError('upstream', 'Google Drive returned an invalid file ID.', status);
		}
		return data.id;
	}

	return {
		async generateFileId(signal) {
			const { data, status } = await get(generateIdsUrl, signal);
			if (!isRecord(data) || !Array.isArray(data.ids) || data.ids.length !== 1 || !isFileId(data.ids[0])) {
				throw new DriveError('upstream', 'Google Drive returned invalid generated IDs.', status);
			}
			return data.ids[0];
		},
		async getFile(id, signal) {
			if (!isFileId(id)) throw new DriveError('bad_input', 'Drive file ID is invalid.');
			const { data, status } = await get(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=${fileFields}&supportsAllDrives=true`, signal);
			if (!isRecord(data) || data.id !== id || typeof data.name !== 'string' || !isNonblank(data.mimeType) ||
				typeof data.trashed !== 'boolean' ||
				(data.parents !== undefined && (!Array.isArray(data.parents) || !data.parents.every(isNonblank))) ||
				(data.appProperties !== undefined && !isProperties(data.appProperties)) ||
				(data.size !== undefined && (typeof data.size !== 'string' || !/^\d+$/.test(data.size))) ||
				(data.sha256Checksum !== undefined && (typeof data.sha256Checksum !== 'string' || !/^[a-f\d]{64}$/i.test(data.sha256Checksum)))) {
				throw new DriveError('upstream', 'Google Drive returned invalid file metadata.', status);
			}
			return {
				id, name: data.name, mimeType: data.mimeType, trashed: data.trashed,
				parents: (data.parents ?? []) as string[],
				appProperties: (data.appProperties ?? {}) as Record<string, string>,
				...(data.size === undefined ? {} : { size: data.size as string }),
				...(data.sha256Checksum === undefined ? {} : { sha256Checksum: data.sha256Checksum as string })
			};
		},
		async upload(file, signal) {
			if (!isNonblank(file.filename) || !isNonblank(file.parentFolderId)) {
				throw new DriveError('bad_input', 'Drive filename and parentFolderId must not be blank.');
			}
			if (!(file.bytes instanceof Uint8Array) || file.bytes.byteLength === 0) {
				throw new DriveError('bad_input', 'Drive upload bytes must be a nonempty Uint8Array.');
			}
			const mimeType = file.mimeType ?? 'application/octet-stream';
			if (!isNonblank(mimeType) || /[^\x20-\x7e]/.test(mimeType)) {
				throw new DriveError('bad_input', 'Drive mimeType must be nonblank and contain only printable ASCII.');
			}
			if (file.id !== undefined && !isFileId(file.id)) {
				throw new DriveError('bad_input', 'Drive reserved file ID is invalid.');
			}
			if (file.appProperties !== undefined && !isProperties(file.appProperties)) {
				throw new DriveError('bad_input', 'Drive appProperties must contain string values and nonblank keys.');
			}
			if (signal?.aborted) throw new DriveError('upstream', 'Google Drive request was cancelled.');

			const boundary = `drive_${globalThis.crypto.randomUUID()}`;
			const encoder = new TextEncoder();
			const metadata = {
				name: file.filename, mimeType, parents: [file.parentFolderId],
				...(file.id === undefined ? {} : { id: file.id }),
				...(file.appProperties === undefined ? {} : { appProperties: file.appProperties })
			};
			const prefix = encoder.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`);
			const suffix = encoder.encode(`\r\n--${boundary}--\r\n`);
			const body = new Uint8Array(prefix.byteLength + file.bytes.byteLength + suffix.byteLength);
			body.set(prefix);
			body.set(file.bytes, prefix.byteLength);
			body.set(suffix, prefix.byteLength + file.bytes.byteLength);
			const id = await create(uploadUrl, `multipart/related; boundary=${boundary}`, body, signal);
			if (file.id !== undefined && id !== file.id) {
				throw new DriveError('upstream', 'Google Drive returned a different file ID.');
			}
			return id;
		},
		async createFolder(folder, signal) {
			if (!isNonblank(folder.name) || !isNonblank(folder.parentFolderId)) {
				throw new DriveError('bad_input', 'Drive folder name and parentFolderId must not be blank.');
			}
			return create(filesUrl, 'application/json', JSON.stringify({
				name: folder.name,
				mimeType: 'application/vnd.google-apps.folder',
				parents: [folder.parentFolderId]
			}), signal);
		}
	};
}
