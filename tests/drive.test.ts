import { describe, expect, spyOn, test } from 'bun:test';
import { createDriveClient, DriveError, type DriveErrorKind, type DriveUpload } from '../src/lib/server/drive/client';
import { isDriveEnabled, readDriveConfig, type DriveConfig, type DriveEnvironment } from '../src/lib/server/drive/config';

const environment = {
	GOOGLE_OAUTH_CLIENT_ID: 'private-client-id',
	GOOGLE_OAUTH_CLIENT_SECRET: 'private-client-secret+&=',
	DRIVE_OAUTH_REFRESH_TOKEN: 'private-refresh-token+&=',
	DRIVE_REPORTS_FOLDER_ID: 'reports-folder'
} satisfies DriveEnvironment;
const config: DriveConfig = {
	clientId: environment.GOOGLE_OAUTH_CLIENT_ID,
	clientSecret: environment.GOOGLE_OAUTH_CLIENT_SECRET,
	refreshToken: environment.DRIVE_OAUTH_REFRESH_TOKEN,
	reportsFolderId: environment.DRIVE_REPORTS_FOLDER_ID
};
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

function deferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
	return { promise, resolve, reject };
}

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
				expect(readDriveConfig(env)).toEqual(config);
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
		expect(readDriveConfig(env)).toEqual(config);
	});

	test('rejects blank direct client configuration and invalid timeout settings', async () => {
		for (const name of Object.keys(config) as (keyof DriveConfig)[]) {
			expect((await driveError(() => createDriveClient({ ...config, [name]: ' ' }))).kind).toBe('configuration');
		}
		for (const timeoutMs of [0, -1, 0.5, NaN, Infinity, 2_147_483_648]) {
			expect((await driveError(() => createDriveClient(config, { timeoutMs }))).kind).toBe('configuration');
		}
	});

	test('only retains finite numeric error statuses', () => {
		for (const status of [undefined, NaN, Infinity, 'private-access-token']) {
			expect(new DriveError('upstream', 'Safe message.', status as number).status).toBeUndefined();
		}
		expect(new DriveError('auth', 'Safe message.', 401).status).toBe(401);
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
				expect(request.redirect).toBe('error');
				for (const secret of sensitive) expect(request.url).not.toContain(secret);
				if (request.url === tokenUrl) {
					expect(request.headers.has('Authorization')).toBe(false);
					expect(request.headers.get('Content-Type')).toBe('application/x-www-form-urlencoded');
					expect(Object.fromEntries(new URLSearchParams(await request.text()))).toEqual({
						grant_type: 'refresh_token', client_id: config.clientId,
						client_secret: config.clientSecret, refresh_token: config.refreshToken
					});
					return Response.json(token);
				}
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

describe('safe Drive errors', () => {
	const statuses: [number, DriveErrorKind][] = [
		[400, 'bad_input'], [401, 'auth'], [403, 'auth'], [404, 'bad_input'], [409, 'bad_input'],
		[422, 'bad_input'], [429, 'upstream'], [500, 'upstream'], [503, 'upstream'], [302, 'upstream']
	];
	for (const operation of ['upload', 'folder', 'oauth'] as const) {
		for (const [status, kind] of statuses) {
			test(`${operation} classifies HTTP ${status} as ${kind} without exposing its body or retrying`, async () => {
				const transport = mockFetch((request) => {
					if (operation !== 'oauth' && request.url === tokenUrl) return Response.json(token);
					return new Response(sensitive.join(' '), { status });
				});
				const client = createDriveClient(config, { fetch: transport.fetch });
				const error = await driveError(() => operation === 'folder' ? client.createFolder(folder) : client.upload(file));
				expect(error.kind).toBe(kind);
				expect(error.status).toBe(status);
				expect(transport.requests).toHaveLength(operation === 'oauth' ? 1 : 2);
			});
		}
	}

	for (const code of ['invalid_grant', 'invalid_client', 'invalid_scope', 'invalid_request', token.access_token]) {
		test(`classifies OAuth 400 ${code} without exposing its description`, async () => {
			const transport = mockFetch(() => Response.json({ error: code, error_description: sensitive.join(' ') }, { status: 400 }));
			const error = await driveError(() => createDriveClient(config, { fetch: transport.fetch }).upload(file));
			expect(error.kind).toBe(['invalid_grant', 'invalid_client'].includes(code) ? 'auth' : 'bad_input');
			expect(error.status).toBe(400);
			expect(transport.requests).toHaveLength(1);
		});
	}

	for (const stage of ['oauth', 'drive']) {
		test(`sanitizes ${stage} network errors, including their original causes`, async () => {
			const transport = mockFetch((request) => {
				if (stage === 'drive' && request.url === tokenUrl) return Response.json(token);
				throw new Error(sensitive.join(' '), { cause: new Error(token.access_token) });
			});
			const error = await driveError(() => createDriveClient(config, { fetch: transport.fetch }).createFolder(folder));
			expect(error.kind).toBe('upstream');
			expect(error.status).toBeUndefined();
			expect(transport.requests).toHaveLength(stage === 'oauth' ? 1 : 2);
		});

		test(`sanitizes invalid ${stage} JSON`, async () => {
			const transport = mockFetch((request) => {
				if (stage === 'drive' && request.url === tokenUrl) return Response.json(token);
				return new Response(sensitive.join(' '));
			});
			const error = await driveError(() => createDriveClient(config, { fetch: transport.fetch }).upload(file));
			expect(error.kind).toBe('upstream');
			expect(error.status).toBe(200);
		});
	}

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

	test('rejects malformed token responses before sending a Drive request', async () => {
		const invalid = [
			null, [], {}, { ...token, access_token: undefined }, { ...token, access_token: '' },
			{ ...token, access_token: ' ' }, { ...token, access_token: 123 },
			{ ...token, access_token: 'token\r\nInjected: yes' }, { ...token, access_token: 'token with spaces' },
			{ ...token, token_type: undefined }, { ...token, token_type: 'Basic' }, { ...token, token_type: 1 },
			...[undefined, 0, -1, 1.5, '3600', null, 1e30].map((expires_in) => ({ ...token, expires_in }))
		];
		for (const data of invalid) {
			const transport = mockFetch(() => Response.json(data));
			const error = await driveError(() => createDriveClient(config, { fetch: transport.fetch }).upload(file));
			expect(error.kind).toBe('upstream');
			expect(error.status).toBe(200);
			expect(transport.requests).toHaveLength(1);
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

	for (const operation of ['generateFileId', 'getFile'] as const) {
		const call = (client: ReturnType<typeof createDriveClient>, signal?: AbortSignal) => operation === 'generateFileId'
			? client.generateFileId(signal) : client.getFile(reservedId, signal);
		test(`${operation} honors cancellation and bounds an unresponsive fetch`, async () => {
			const transport = mockFetch((request) => request.url === tokenUrl ? Response.json(token) : new Promise<Response>(() => {}));
			const client = createDriveClient(config, { fetch: transport.fetch, timeoutMs: 20 });
			const controller = new AbortController();
			controller.abort(sensitive.join(' '));
			expect((await driveError(() => call(client, controller.signal))).kind).toBe('upstream');
			expect(transport.requests).toHaveLength(0);
			expect((await driveError(() => call(client))).message).toContain('timed out');
			expect(transport.requests).toHaveLength(2);
		});

		test(`${operation} invalidates rejected tokens without implicit retries`, async () => {
			let gets = 0;
			const transport = mockFetch((request) => {
				if (request.url === tokenUrl) return Response.json(token);
				gets += 1;
				return gets === 1 ? new Response(null, { status: 401 }) : Response.json(operation === 'generateFileId' ? { ids: [reservedId] } : metadata);
			});
			const client = createDriveClient(config, { fetch: transport.fetch });
			expect((await driveError(() => call(client))).kind).toBe('auth');
			expect(gets).toBe(1);
			await call(client);
			expect(transport.requests.filter((request) => request.url === tokenUrl)).toHaveLength(2);
		});
	}
});

describe('Drive token cache', () => {
	test('deduplicates concurrent refreshes across uploads and folders and reuses the token', async () => {
		const started = deferred<void>();
		const response = deferred<Response>();
		const transport = mockFetch((request) => {
			if (request.url === tokenUrl) {
				started.resolve();
				return response.promise;
			}
			return Response.json({ id: request.url === uploadUrl ? 'file-id' : 'folder-id' });
		});
		const client = createDriveClient(config, { fetch: transport.fetch });
		const operations = [client.upload(file), client.createFolder(folder), client.upload(file)];
		await started.promise;
		expect(transport.requests).toHaveLength(1);
		response.resolve(Response.json(token));
		expect(await Promise.all(operations)).toEqual(['file-id', 'folder-id', 'file-id']);
		expect(await client.createFolder(folder)).toBe('folder-id');
		expect(transport.requests.filter((request) => request.url === tokenUrl)).toHaveLength(1);
		expect(transport.requests).toHaveLength(5);
	});

	test('refreshes at the expiry buffer rather than waiting for token expiration', async () => {
		const clock = spyOn(Date, 'now').mockReturnValue(1_000_000);
		try {
			let refreshes = 0;
			const transport = mockFetch((request) => {
				if (request.url === tokenUrl) {
					refreshes += 1;
					return Response.json({ ...token, access_token: `token-${refreshes}` });
				}
				return Response.json({ id: 'id' });
			});
			const client = createDriveClient(config, { fetch: transport.fetch });
			await client.upload(file);
			clock.mockReturnValue(1_000_000 + 3_540_000 - 1);
			await client.createFolder(folder);
			expect(refreshes).toBe(1);
			clock.mockReturnValue(1_000_000 + 3_540_000);
			await Promise.all([client.upload(file), client.createFolder(folder)]);
			expect(refreshes).toBe(2);
			expect(transport.requests.filter((request) => request.url !== tokenUrl)
				.map((request) => request.headers.get('Authorization')))
				.toEqual(['Bearer token-1', 'Bearer token-1', 'Bearer token-2', 'Bearer token-2']);
		} finally {
			clock.mockRestore();
		}
	});

	test('a failed shared refresh is not cached and a later explicit call can try again', async () => {
		const started = deferred<void>();
		const response = deferred<Response>();
		let refreshes = 0;
		const transport = mockFetch((request) => {
			if (request.url === tokenUrl) {
				refreshes += 1;
				if (refreshes > 1) return Response.json(token);
				started.resolve();
				return response.promise;
			}
			return Response.json({ id: 'id' });
		});
		const client = createDriveClient(config, { fetch: transport.fetch });
		const first = driveError(() => client.upload(file));
		const second = driveError(() => client.createFolder(folder));
		await started.promise;
		response.resolve(new Response('private-access-token', { status: 503 }));
		expect((await first).kind).toBe('upstream');
		expect((await second).kind).toBe('upstream');
		expect(transport.requests).toHaveLength(1);
		expect(await client.upload(file)).toBe('id');
		expect(refreshes).toBe(2);
	});

	test('invalidates rejected credentials for the next call without replaying a create', async () => {
		let refreshes = 0;
		let creates = 0;
		const transport = mockFetch((request) => {
			if (request.url === tokenUrl) {
				refreshes += 1;
				return Response.json(token);
			}
			creates += 1;
			return creates === 1 ? new Response('private-access-token', { status: 401 }) : Response.json({ id: 'id' });
		});
		const client = createDriveClient(config, { fetch: transport.fetch });
		expect((await driveError(() => client.upload(file))).kind).toBe('auth');
		expect(creates).toBe(1);
		expect(refreshes).toBe(1);
		expect(await client.upload(file)).toBe('id');
		expect(refreshes).toBe(2);
	});

	test('keeps token caches private to each client', async () => {
		const transport = mockFetch((request) => Response.json(request.url === tokenUrl ? token : { id: 'id' }));
		const first = createDriveClient(config, { fetch: transport.fetch });
		const second = createDriveClient(config, { fetch: transport.fetch });
		await Promise.all([first.upload(file), second.createFolder(folder)]);
		expect(transport.requests.filter((request) => request.url === tokenUrl)).toHaveLength(2);
		expect(Object.keys(first).sort()).toEqual(['createFolder', 'generateFileId', 'getFile', 'upload']);
		for (const secret of sensitive) expect(JSON.stringify(first)).not.toContain(secret);
	});
});

describe('Drive timeouts and cancellation', () => {
	for (const stage of ['oauth', 'drive'] as const) {
		for (const stalled of ['fetch', 'body'] as const) {
			test(`bounds a stalled ${stage} ${stalled}, even when the mock ignores abort`, async () => {
				const transport = mockFetch((request) => {
					if (stage === 'drive' && request.url === tokenUrl) return Response.json(token);
					if (stalled === 'fetch') return new Promise<Response>(() => {});
					return new Response(new ReadableStream({
						start(controller) { controller.enqueue(new TextEncoder().encode('{"partial":')); }
					}));
				});
				const client = createDriveClient(config, { fetch: transport.fetch, timeoutMs: 20 });
				const error = await driveError(() => client.upload(file));
				expect(error.kind).toBe('upstream');
				expect(error.message).toMatch(/timed out/);
				expect(transport.requests.at(-1)!.signal.aborted).toBe(true);
				expect(transport.requests).toHaveLength(stage === 'oauth' ? 1 : 2);
			});

			test(`passes external cancellation through a stalled ${stage} ${stalled} without leaking the abort reason`, async () => {
				const reached = deferred<void>();
				const transport = mockFetch((request) => {
					if (stage === 'drive' && request.url === tokenUrl) return Response.json(token);
					if (stalled === 'fetch') {
						reached.resolve();
						return new Promise<Response>(() => {});
					}
					const response = Response.json({});
					response.json = () => {
						reached.resolve();
						return new Promise(() => {});
					};
					return response;
				});
				const controller = new AbortController();
				const client = createDriveClient(config, { fetch: transport.fetch, timeoutMs: 1000 });
				const failed = driveError(() => client.createFolder(folder, controller.signal));
				await reached.promise;
				controller.abort(new Error(sensitive.join(' ')));
				const error = await failed;
				expect(error.kind).toBe('upstream');
				expect(error.message).toMatch(/cancelled/);
				expect(transport.requests.at(-1)!.signal.aborted).toBe(true);
				expect(transport.requests).toHaveLength(stage === 'oauth' ? 1 : 2);
			});
		}
	}

	test('bounds OAuth error-body parsing as well as success-body parsing', async () => {
		const transport = mockFetch(() => new Response(new ReadableStream(), { status: 400 }));
		const error = await driveError(() => createDriveClient(config, { fetch: transport.fetch, timeoutMs: 20 }).upload(file));
		expect(error.kind).toBe('upstream');
		expect(error.message).toMatch(/timed out/);
		expect(transport.requests[0].signal.aborted).toBe(true);
	});

	test('handles synchronous cancellation inside an injected fetch without an unhandled refresh rejection', async () => {
		const controller = new AbortController();
		const transport = mockFetch(() => {
			controller.abort(new Error(sensitive.join(' ')));
			return Response.json(token);
		});
		const client = createDriveClient(config, { fetch: transport.fetch });
		const error = await driveError(() => client.upload(file, controller.signal));
		expect(error.kind).toBe('upstream');
		expect(error.message).toMatch(/cancelled/);
		expect(transport.requests).toHaveLength(1);
		expect(transport.requests[0].signal.aborted).toBe(true);
		await new Promise((resolve) => setTimeout(resolve, 0));
	});

	test('pre-aborted signals prevent any network request', async () => {
		const transport = mockFetch(() => { throw new Error('Unexpected network request.'); });
		const controller = new AbortController();
		controller.abort(sensitive.join(' '));
		const client = createDriveClient(config, { fetch: transport.fetch });
		expect((await driveError(() => client.upload(file, controller.signal))).message).toMatch(/cancelled/);
		expect((await driveError(() => client.createFolder(folder, controller.signal))).message).toMatch(/cancelled/);
		expect(transport.requests).toHaveLength(0);
	});

	test('cancelling one waiter does not cancel a shared refresh needed by another', async () => {
		const started = deferred<void>();
		const response = deferred<Response>();
		const transport = mockFetch((request) => {
			if (request.url === tokenUrl) {
				started.resolve();
				return response.promise;
			}
			return Response.json({ id: 'id' });
		});
		const controller = new AbortController();
		const client = createDriveClient(config, { fetch: transport.fetch });
		const cancelled = driveError(() => client.upload(file, controller.signal));
		const surviving = client.createFolder(folder);
		await started.promise;
		controller.abort('private-access-token');
		expect((await cancelled).message).toMatch(/cancelled/);
		expect(transport.requests[0].signal.aborted).toBe(false);
		response.resolve(Response.json(token));
		expect(await surviving).toBe('id');
		expect(await client.upload(file)).toBe('id');
		expect(transport.requests).toHaveLength(3);
	});

	test('aborts an abandoned refresh and lets a later caller start a fresh one', async () => {
		const started = deferred<void>();
		const staleResponse = deferred<Response>();
		let refreshes = 0;
		const transport = mockFetch((request) => {
			if (request.url === tokenUrl) {
				refreshes += 1;
				if (refreshes === 1) {
					started.resolve();
					return staleResponse.promise;
				}
				return Response.json({ ...token, access_token: 'replacement-token' });
			}
			return Response.json({ id: 'id' });
		});
		const controllers = [new AbortController(), new AbortController()];
		const client = createDriveClient(config, { fetch: transport.fetch });
		const cancelled = controllers.map((controller) => driveError(() => client.upload(file, controller.signal)));
		await started.promise;
		controllers.forEach((controller) => controller.abort());
		await Promise.all(cancelled);
		expect(transport.requests[0].signal.aborted).toBe(true);
		expect(await client.createFolder(folder)).toBe('id');
		staleResponse.resolve(Response.json(token));
		expect(await client.upload(file)).toBe('id');
		expect(refreshes).toBe(2);
		expect(transport.requests.filter((request) => request.url !== tokenUrl)
			.map((request) => request.headers.get('Authorization')))
			.toEqual(['Bearer replacement-token', 'Bearer replacement-token']);
	});
});