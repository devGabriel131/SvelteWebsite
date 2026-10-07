import type { DriveConfig } from './config';

export type DriveErrorKind = 'upstream' | 'bad_input' | 'auth' | 'configuration';

export class DriveError extends Error {
	readonly kind: DriveErrorKind;
	readonly status?: number;

	constructor(kind: DriveErrorKind, message: string, status?: number) {
		super(message);
		this.name = 'DriveError';
		this.kind = kind;
		if (typeof status === 'number' && Number.isFinite(status)) this.status = status;
	}
}

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

export type DriveClientOptions = {
	fetch?: typeof globalThis.fetch;
	timeoutMs?: number;
};

export type DriveClient = {
	upload(file: DriveUpload, signal?: AbortSignal): Promise<string>;
	createFolder(folder: DriveFolder, signal?: AbortSignal): Promise<string>;
	// Optional so existing upload-only adapters remain compatible.
	generateFileId?(signal?: AbortSignal): Promise<string>;
	getFile?(id: string, signal?: AbortSignal): Promise<DriveFile>;
};

export type DriveClientWithFileIds = DriveClient & Required<Pick<DriveClient, 'generateFileId' | 'getFile'>>;

type AccessToken = { value: string; expiresAt: number };
type TokenRefresh = {
	promise: Promise<AccessToken>;
	controller: AbortController;
	waiters: number;
};

const tokenUrl = 'https://oauth2.googleapis.com/token';
const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id&supportsAllDrives=true';
const filesUrl = 'https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true';
const generateIdsUrl = 'https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=drive&type=files&fields=ids';
const fileFields = 'id,name,mimeType,parents,appProperties,trashed,size,sha256Checksum';
const defaultTimeoutMs = 30_000;
const tokenExpiryBufferMs = 60_000;

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

function cancelled(): DriveError {
	return new DriveError('upstream', 'Google Drive request was cancelled.');
}

// Racing also bounds injected fetch implementations and body readers that ignore the signal.
async function withSignal<T>(signal: AbortSignal | undefined, work: () => Promise<T>): Promise<T> {
	if (signal?.aborted) throw cancelled();
	if (!signal) return work();

	let onAbort!: () => void;
	const aborted = new Promise<never>((_, reject) => {
		onAbort = () => reject(cancelled());
		signal.addEventListener('abort', onAbort, { once: true });
	});
	try {
		return await Promise.race([work(), aborted]);
	} finally {
		signal.removeEventListener('abort', onAbort);
	}
}

function responseError(status: number, oauthError?: unknown): DriveError {
	const kind: DriveErrorKind = status === 401 || status === 403 ||
		(status === 400 && (oauthError === 'invalid_grant' || oauthError === 'invalid_client'))
		? 'auth'
		: status === 429 || status >= 500 || status < 400
			? 'upstream'
			: 'bad_input';
	return new DriveError(kind, 'Google Drive request was rejected.', status);
}

export function createDriveClient(config: DriveConfig, options: DriveClientOptions = {}): DriveClientWithFileIds {
	if (![config.clientId, config.clientSecret, config.refreshToken, config.reportsFolderId].every(isNonblank)) {
		throw new DriveError('configuration', 'Drive client configuration requires nonblank credentials and reportsFolderId.');
	}
	const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
	if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) {
		throw new DriveError('configuration', 'Drive timeoutMs must be a positive, supported integer.');
	}
	const requestFetch = options.fetch ?? globalThis.fetch;
	const { clientId, clientSecret, refreshToken } = config;
	let cachedToken: AccessToken | undefined;
	let pendingRefresh: TokenRefresh | undefined;

	async function requestJson(url: string, init: RequestInit, signal?: AbortSignal, oauth = false) {
		const controller = new AbortController();
		let timedOut = false;
		const onAbort = () => controller.abort();
		signal?.addEventListener('abort', onAbort, { once: true });
		if (signal?.aborted) controller.abort();
		const timer = setTimeout(() => {
			timedOut = true;
			controller.abort();
		}, timeoutMs);

		try {
			return await withSignal(controller.signal, async () => {
				let response: Response;
				try {
					// Never follow redirects with OAuth credentials or a bearer token.
					response = await requestFetch(url, { ...init, redirect: 'error', signal: controller.signal });
				} catch {
					throw new DriveError('upstream', 'Google Drive request failed.');
				}
				if (!response.ok) {
					let oauthError: unknown;
					if (oauth && response.status === 400) {
						try {
							const data: unknown = await response.json();
							if (isRecord(data)) oauthError = data.error;
						} catch {
							// Only the OAuth error code affects classification; never expose its description.
						}
					} else {
						void response.body?.cancel().catch(() => {});
					}
					throw responseError(response.status, oauthError);
				}
				try {
					const data: unknown = await response.json();
					return { data, status: response.status };
				} catch {
					throw new DriveError('upstream', 'Google Drive returned invalid JSON.', response.status);
				}
			});
		} catch (error) {
			if (controller.signal.aborted) {
				if (timedOut) throw new DriveError('upstream', 'Google Drive request timed out.');
				throw cancelled();
			}
			if (error instanceof DriveError) throw error;
			throw new DriveError('upstream', 'Google Drive request failed.');
		} finally {
			clearTimeout(timer);
			signal?.removeEventListener('abort', onAbort);
		}
	}

	async function requestAccessToken(signal: AbortSignal): Promise<AccessToken> {
		const requestedAt = Date.now();
		const { data, status } = await requestJson(tokenUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'refresh_token',
				client_id: clientId,
				client_secret: clientSecret,
				refresh_token: refreshToken
			})
		}, signal, true);

		if (!isRecord(data) || typeof data.access_token !== 'string' ||
			!/^[A-Za-z0-9\-._~+/]+=*$/.test(data.access_token) ||
			typeof data.token_type !== 'string' || data.token_type.toLowerCase() !== 'bearer' ||
			typeof data.expires_in !== 'number' || !Number.isSafeInteger(data.expires_in) || data.expires_in <= 0 ||
			!Number.isSafeInteger(requestedAt + data.expires_in * 1000)) {
			throw new DriveError('upstream', 'Google OAuth returned an invalid token response.', status);
		}
		const lifetimeMs = data.expires_in * 1000;
		return {
			value: data.access_token,
			expiresAt: requestedAt + lifetimeMs - Math.min(tokenExpiryBufferMs, lifetimeMs / 10)
		};
	}

	async function accessToken(signal?: AbortSignal): Promise<string> {
		if (signal?.aborted) throw cancelled();
		if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;
		if (!pendingRefresh) {
			const controller = new AbortController();
			// Subscribe waiters before an injected fetch can synchronously trigger cancellation.
			const promise = Promise.resolve().then(() => requestAccessToken(controller.signal)).then((token) => {
				if (!controller.signal.aborted) cachedToken = token;
				return token;
			}).finally(() => {
				if (pendingRefresh?.promise === promise) pendingRefresh = undefined;
			});
			pendingRefresh = { promise, controller, waiters: 0 };
		}
		const refresh = pendingRefresh;
		refresh.waiters += 1;
		try {
			return (await withSignal(signal, () => refresh.promise)).value;
		} finally {
			refresh.waiters -= 1;
			// One cancelled caller must not abort a refresh still needed by another caller.
			if (refresh.waiters === 0 && pendingRefresh === refresh) {
				pendingRefresh = undefined;
				refresh.controller.abort();
			}
		}
	}

	async function get(url: string, signal?: AbortSignal) {
		const token = await accessToken(signal);
		try {
			return await requestJson(url, {
				method: 'GET', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store'
			}, signal);
		} catch (error) {
			if (error instanceof DriveError && error.kind === 'auth' && cachedToken?.value === token) {
				cachedToken = undefined;
			}
			throw error;
		}
	}

	async function create(url: string, contentType: string, body: BodyInit, signal?: AbortSignal): Promise<string> {
		const token = await accessToken(signal);
		try {
			const { data, status } = await requestJson(url, {
				method: 'POST',
				headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
				body
			}, signal);
			if (!isRecord(data) || !isNonblank(data.id)) {
				throw new DriveError('upstream', 'Google Drive returned an invalid file ID.', status);
			}
			return data.id;
		} catch (error) {
			if (error instanceof DriveError && error.kind === 'auth' && cachedToken?.value === token) {
				cachedToken = undefined;
			}
			// A create may have succeeded even if its response was lost. Never retry it here.
			throw error;
		}
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
			if (signal?.aborted) throw cancelled();

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
