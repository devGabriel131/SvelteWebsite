import { describe, expect, test } from 'bun:test';
import { createDriveClient, DriveError, type DriveClient, type DriveUpload } from '../src/lib/server/drive/client';
import { isDriveEnabled, readDriveConfig, type DriveEnvironment } from '../src/lib/server/drive/config';
import type { GoogleCredentials } from '../src/lib/server/google/client';

const environment = {
	GOOGLE_OAUTH_CLIENT_ID: 'private-client-id',
	GOOGLE_OAUTH_CLIENT_SECRET: 'private-client-secret+&=',
	DRIVE_OAUTH_REFRESH_TOKEN: 'private-refresh-token+&=',
	DRIVE_REPORTS_FOLDER_ID: 'reports-folder'
} satisfies DriveEnvironment;
const config: GoogleCredentials = {
	clientId: environment.GOOGLE_OAUTH_CLIENT_ID,
	clientSecret: environment.GOOGLE_OAUTH_CLIENT_SECRET,
	refreshToken: environment.DRIVE_OAUTH_REFRESH_TOKEN
};
const driveConfig = { ...config, reportsFolderId: environment.DRIVE_REPORTS_FOLDER_ID };
const tokenUrl = 'https://oauth2.googleapis.com/token';
const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id&supportsAllDrives=true';
const folderUrl = 'https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true';
const token = { access_token: 'private-access-token', token_type: 'Bearer', expires_in: 3600 };
const file: DriveUpload = {
	bytes: new Uint8Array([0, 255, 195, 40, 13, 10, 1]),
	filename: 'reporte.pdf',
	mimeType: 'application/pdf',
	parentFolderId: 'explicit-parent'
};
const folder = { name: 'Reportes', parentFolderId: 'explicit-parent' };
const sensitive = [config.clientId, config.clientSecret, config.refreshToken, token.access_token];

function mockFetch(handler: (request: Request) => Response | Promise<Response>) {
	const requests: Request[] = [];
	const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
		const request = new Request(input, init);
		requests.push(request);
		return handler(request);
	};
	return { fetch: fetch as typeof globalThis.fetch, requests };
}

async function driveError(work: () => unknown): Promise<DriveError> {
	try {
		await work();
	} catch (error) {
		expect(error).toBeInstanceOf(DriveError);
		const failure = error as DriveError;
		expect(failure.name).toBe('DriveError');
		expect(failure).not.toHaveProperty('cause');
		if (failure.status !== undefined) {
			expect(typeof failure.status).toBe('number');
			expect(Number.isFinite(failure.status)).toBe(true);
		}
		for (const secret of sensitive) {
			expect(`${String(failure)} ${failure.stack} ${JSON.stringify(failure)}`).not.toContain(secret);
		}
		return failure;
	}
	throw new Error('Expected a safe DriveError.');
}

describe('Drive configuration', () => {
	const names = Object.keys(environment) as (keyof DriveEnvironment)[];
	for (let mask = 0; mask < 16; mask += 1) {
		const env = Object.fromEntries(names.filter((_, i) => mask & (1 << i))
			.map((name) => [name, environment[name]])) as DriveEnvironment;
		test(`handles configuration subset ${mask} without exposing values`, async () => {
			const enabled = Boolean(mask & 12);
			expect(isDriveEnabled(env)).toBe(enabled);
			if (!enabled) {
				expect(readDriveConfig(env)).toBeNull();
			} else if (mask === 15) {
				expect(readDriveConfig(env)).toEqual(driveConfig);
			} else {
				const error = await driveError(() => readDriveConfig(env));
				expect(error.kind).toBe('configuration');
				expect(error.status).toBeUndefined();
				expect(error.message).toBe(`Missing Drive configuration: ${names.filter((name) => !env[name]).join(', ')}.`);
			}
		});
	}

	test('shared Google credentials and blank Drive settings do not enable Drive', () => {
		const env = { ...environment, DRIVE_REPORTS_FOLDER_ID: ' \t', DRIVE_OAUTH_REFRESH_TOKEN: '\n ' };
		expect(isDriveEnabled(env)).toBe(false);
		expect(readDriveConfig(env)).toBeNull();
	});

	for (const name of names) {
		test(`treats blank ${name} as missing in an enabled setup`, async () => {
			const error = await driveError(() => readDriveConfig({ ...environment, [name]: ' \t\n' }));
			expect(error.kind).toBe('configuration');
			expect(error.message).toBe(`Missing Drive configuration: ${name}.`);
		});
	}

	test('trims environment values', () => {
		const env = Object.fromEntries(names.map((name) => [name, ` ${environment[name]}\n`])) as DriveEnvironment;
		expect(readDriveConfig(env)).toEqual(driveConfig);
	});

	test('constructs all four capabilities with credentials only and uses safe Drive errors', async () => {
		const client = createDriveClient(config);
		expect(Object.keys(client).sort()).toEqual(['createFolder', 'generateFileId', 'getFile', 'upload']);
		for (const secret of sensitive) expect(JSON.stringify(client)).not.toContain(secret);
		const error = await driveError(() => createDriveClient({ ...config, refreshToken: '' }));
		expect(error.kind).toBe('configuration');
		expect(error.message).toBe('Drive client configuration requires nonblank credentials.');
	});
});

describe('Drive requests', () => {
	for (const mimeType of [undefined, 'application/pdf', 'text/plain; charset=UTF-8']) {
		test(`uploads exact binary multipart/related data (${mimeType ?? 'default MIME'})`, async () => {
			const source = new Uint8Array([99, ...file.bytes, 88]);
			const bytes = source.subarray(1, source.length - 1);
			const filename = 'Certificación "María"\n2026.pdf';
			const expectedMime = mimeType ?? 'application/octet-stream';
			const transport = mockFetch(async (request) => {
				expect(request.method).toBe('POST');
				if (request.url === tokenUrl) return Response.json(token);
				expect(request.url).toBe(uploadUrl);
				expect(request.headers.get('Authorization')).toBe(`Bearer ${token.access_token}`);
				const contentType = request.headers.get('Content-Type')!;
				expect(contentType).toMatch(/^multipart\/related; boundary=drive_[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
				const boundary = contentType.split('boundary=')[1];
				const prefix = new TextEncoder().encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({
					name: filename, mimeType: expectedMime, parents: [file.parentFolderId]
				})}\r\n--${boundary}\r\nContent-Type: ${expectedMime}\r\n\r\n`);
				const suffix = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);
				const expected = new Uint8Array([...prefix, ...bytes, ...suffix]);
				expect(new Uint8Array(await request.arrayBuffer())).toEqual(expected);
				return Response.json({ id: 'uploaded-id' });
			});
			const client = createDriveClient(config, { fetch: transport.fetch });
			expect(await client.upload({ ...file, filename, bytes, mimeType })).toBe('uploaded-id');
			expect(transport.requests).toHaveLength(2);
			expect(source).toEqual(new Uint8Array([99, ...file.bytes, 88]));
		});
	}

	test('creates a folder with JSON metadata and shared-drive support', async () => {
		const transport = mockFetch(async (request) => {
			if (request.url === tokenUrl) return Response.json(token);
			expect(request.url).toBe(folderUrl);
			expect(request.method).toBe('POST');
			expect(request.headers.get('Authorization')).toBe(`Bearer ${token.access_token}`);
			expect(request.headers.get('Content-Type')).toBe('application/json');
			expect(await request.json()).toEqual({
				name: 'Reportes — María', mimeType: 'application/vnd.google-apps.folder', parents: [folder.parentFolderId]
			});
			return Response.json({ id: 'folder-id' });
		});
		const client = createDriveClient(config, { fetch: transport.fetch });
		expect(await client.createFolder({ ...folder, name: 'Reportes — María' })).toBe('folder-id');
		expect(transport.requests).toHaveLength(2);
	});

	test('uses a different multipart boundary for each upload', async () => {
		const transport = mockFetch((request) => Response.json(request.url === tokenUrl ? token : { id: 'id' }));
		const client = createDriveClient(config, { fetch: transport.fetch });
		await client.upload(file);
		await client.upload(file);
		expect(transport.requests[1].headers.get('Content-Type')).not.toBe(transport.requests[2].headers.get('Content-Type'));
	});

	test('rejects invalid file and folder input before any network request', async () => {
		const transport = mockFetch(() => { throw new Error('Unexpected network request.'); });
		const client = createDriveClient(config, { fetch: transport.fetch });
		const invalidFiles: DriveUpload[] = [
			{ ...file, filename: '' }, { ...file, filename: ' \n' },
			{ ...file, parentFolderId: ' \t' }, { ...file, bytes: new Uint8Array() },
			{ ...file, bytes: [1, 2] as unknown as Uint8Array },
			...['', ' ', 'application/pdf\r\nAuthorization: secret', 'text/plain\nInjected: yes',
				'text/plain\rInjected: yes', 'text/plain\0', 'text/plain\t', 'text/pláin', 'text/plain\x7f']
				.map((mimeType) => ({ ...file, mimeType }))
		];
		for (const input of invalidFiles) {
			expect((await driveError(() => client.upload(input))).kind).toBe('bad_input');
		}
		for (const input of [{ ...folder, name: ' \n' }, { ...folder, parentFolderId: '' }]) {
			expect((await driveError(() => client.createFolder(input))).kind).toBe('bad_input');
		}
		expect(transport.requests).toHaveLength(0);
	});
});

describe('Drive result validation', () => {
	test('rejects missing, blank, or nonstring returned IDs for either create operation', async () => {
		for (const data of [null, [], {}, { id: '' }, { id: ' \n' }, { id: 42 }, { id: {} }]) {
			for (const operation of ['upload', 'folder']) {
				const transport = mockFetch((request) => Response.json(request.url === tokenUrl ? token : data));
				const client = createDriveClient(config, { fetch: transport.fetch });
				const error = await driveError(() => operation === 'upload' ? client.upload(file) : client.createFolder(folder));
				expect(error.kind).toBe('upstream');
				expect(error.status).toBe(200);
				expect(transport.requests).toHaveLength(2);
			}
		}
	});
});

describe('Drive reserved file IDs', () => {
	const reservedId = 'reserved-file_123';
	const sha256 = 'a'.repeat(64);
	const metadata = {
		id: reservedId, name: 'document.pdf', mimeType: 'application/pdf', parents: ['private-folder'],
		appProperties: { bootcampDocumentId: 'document-id', sha256 }, trashed: false,
		size: '7', sha256Checksum: sha256
	};

	test('generates one Drive file ID and fetches private metadata with the shared token', async () => {
		const transport = mockFetch((request) => {
			if (request.url === tokenUrl) return Response.json(token);
			expect(request.method).toBe('GET');
			expect(request.redirect).toBe('error');
			expect(request.cache).toBe('no-store');
			expect(request.headers.get('Authorization')).toBe(`Bearer ${token.access_token}`);
			const url = new URL(request.url);
			if (url.pathname.endsWith('/generateIds')) {
				expect(Object.fromEntries(url.searchParams)).toEqual({ count: '1', space: 'drive', type: 'files', fields: 'ids' });
				return Response.json({ ids: [reservedId] });
			}
			expect(url.pathname).toBe(`/drive/v3/files/${reservedId}`);
			expect(url.searchParams.get('supportsAllDrives')).toBe('true');
			expect(url.searchParams.get('fields')?.split(',')).toEqual([
				'id', 'name', 'mimeType', 'parents', 'appProperties', 'trashed', 'size', 'sha256Checksum'
			]);
			return Response.json(metadata);
		});
		const client = createDriveClient(config, { fetch: transport.fetch });
		expect(await client.generateFileId()).toBe(reservedId);
		expect(await client.getFile(reservedId)).toEqual(metadata);
		expect(transport.requests).toHaveLength(3);
	});

	test('includes the reserved ID and private app properties without altering binary bytes', async () => {
		const transport = mockFetch(async (request) => {
			if (request.url === tokenUrl) return Response.json(token);
			const boundary = request.headers.get('Content-Type')!.split('boundary=')[1];
			const prefix = new TextEncoder().encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({
				name: file.filename, mimeType: file.mimeType, parents: [file.parentFolderId],
				id: reservedId, appProperties: metadata.appProperties
			})}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`);
			const suffix = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);
			expect(new Uint8Array(await request.arrayBuffer())).toEqual(new Uint8Array([...prefix, ...file.bytes, ...suffix]));
			return Response.json({ id: reservedId });
		});
		expect(await createDriveClient(config, { fetch: transport.fetch }).upload({
			...file, id: reservedId, appProperties: metadata.appProperties
		})).toBe(reservedId);
	});

	test('does not swallow conflicts or retry creates, even with a reserved ID', async () => {
		const transport = mockFetch((request) => request.url === tokenUrl
			? Response.json(token) : new Response('private upstream body', { status: 409 }));
		const error = await driveError(() => createDriveClient(config, { fetch: transport.fetch }).upload({ ...file, id: reservedId }));
		expect(error.status).toBe(409);
		expect(transport.requests).toHaveLength(2);
	});

	test('rejects a create response that did not honor the reserved ID', async () => {
		const transport = mockFetch((request) => Response.json(request.url === tokenUrl ? token : { id: 'wrong-id' }));
		expect((await driveError(() => createDriveClient(config, { fetch: transport.fetch })
			.upload({ ...file, id: reservedId }))).kind).toBe('upstream');
		expect(transport.requests).toHaveLength(2);
	});

	test('rejects invalid reservations and private properties before networking', async () => {
		const transport = mockFetch(() => { throw new Error('Unexpected network request.'); });
		const client = createDriveClient(config, { fetch: transport.fetch });
		for (const id of ['', ' ', '../files', '..', 'id?fields=secret', 'id\nheader']) {
			expect((await driveError(() => client.getFile(id))).kind).toBe('bad_input');
			expect((await driveError(() => client.upload({ ...file, id }))).kind).toBe('bad_input');
		}
		for (const appProperties of [null, [], 'text', { '': 'value' }, { key: 42 }]) {
			expect((await driveError(() => client.upload({ ...file, appProperties } as unknown as DriveUpload))).kind).toBe('bad_input');
		}
		expect(transport.requests).toHaveLength(0);
	});

	test('rejects missing, malformed, or multiple generated IDs', async () => {
		for (const response of [{}, { ids: [] }, { ids: [reservedId, 'second'] }, { ids: [' '] }, { ids: [null] }, { ids: ['bad/id'] }]) {
			const transport = mockFetch((request) => Response.json(request.url === tokenUrl ? token : response));
			expect((await driveError(() => createDriveClient(config, { fetch: transport.fetch }).generateFileId())).kind).toBe('upstream');
		}
	});

	test('validates metadata without inventing missing integrity fields', async () => {
		const changes = [
			{ id: 'other' }, { name: 1 }, { mimeType: '' }, { trashed: undefined },
			{ parents: 'folder' }, { parents: [1] }, { appProperties: [] }, { appProperties: { key: null } },
			{ size: 7 }, { size: '-1' }, { sha256Checksum: 'invalid' }
		];
		for (const change of changes) {
			const transport = mockFetch((request) => Response.json(request.url === tokenUrl ? token : { ...metadata, ...change }));
			expect((await driveError(() => createDriveClient(config, { fetch: transport.fetch }).getFile(reservedId))).kind).toBe('upstream');
		}
		const transport = mockFetch((request) => Response.json(request.url === tokenUrl ? token : {
			id: reservedId, name: '', mimeType: 'application/pdf', trashed: true
		}));
		expect(await createDriveClient(config, { fetch: transport.fetch }).getFile(reservedId)).toEqual({
			id: reservedId, name: '', mimeType: 'application/pdf', trashed: true, parents: [], appProperties: {}
		});
	});
});

describe('Drive operation transport boundaries', () => {
	const operations: Array<[string, (client: DriveClient, signal?: AbortSignal) => Promise<unknown>]> = [
		['upload', (client, signal) => client.upload(file, signal)],
		['createFolder', (client, signal) => client.createFolder(folder, signal)],
		['generateFileId', (client, signal) => client.generateFileId(signal)],
		['getFile', (client, signal) => client.getFile('reserved-file_123', signal)]
	];
	for (const [name, call] of operations) {
		test(`${name} retains Drive subclass and service label without replay`, async () => {
			const transport = mockFetch((request) => request.url === tokenUrl
				? Response.json(token) : new Response(sensitive.join(' '), { status: 403 }));
			const error = await driveError(() => call(createDriveClient(config, { fetch: transport.fetch })));
			expect(error.kind).toBe('auth');
			expect(error.status).toBe(403);
			expect(error.message).toBe('Google Drive request was rejected.');
			expect(transport.requests).toHaveLength(2);
		});

		test(`${name} forwards in-flight cancellation and rejects pre-aborted input`, async () => {
			const started = Promise.withResolvers<void>();
			const transport = mockFetch((request) => {
				if (request.url === tokenUrl) return Response.json(token);
				started.resolve();
				return Promise.withResolvers<Response>().promise;
			});
			const client = createDriveClient(config, { fetch: transport.fetch });
			const controller = new AbortController();
			const cancelled = driveError(() => call(client, controller.signal));
			await started.promise;
			controller.abort(new Error(sensitive.join(' ')));
			expect((await cancelled).message).toBe('Google Drive request was cancelled.');
			expect(transport.requests).toHaveLength(2);
			expect(transport.requests[1].signal.aborted).toBe(true);
			expect((await driveError(() => call(client, controller.signal))).message).toBe('Google Drive request was cancelled.');
			expect(transport.requests).toHaveLength(2);
		});
	}
});
