import { describe, expect, mock, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { drizzle } from 'drizzle-orm/pg-proxy';
import {
	BootcampBackupError, createBootcampBackup, type BootcampBackupDatabase
} from '../src/lib/server/bootcamp/backup';
import { DriveError, type DriveClient, type DriveClientWithFileIds, type DriveFile } from '../src/lib/server/drive/client';

const documentId = '11111111-1111-4111-8111-111111111111';
const eventId = '22222222-2222-4222-8222-222222222222';
const folderId = 'private-bootcamp-folder';
const secret = 'private-refresh-token; student signature; upstream response; database credentials';
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function document(overrides: Partial<TestDocument> = {}): TestDocument {
	const source = Buffer.from([99, 37, 80, 68, 70, 0, 255, 195, 40, 13, 10, 88]);
	const pdf = source.subarray(1, source.length - 1);
	return {
		id: documentId, eventId, kind: 'waiver', language: 'es', pdf, sha256: sha256(pdf),
		driveFileId: null, backupStatus: 'pending', backupAttempts: 0,
		backupLeaseUntil: null, backupError: null, backedUpAt: null, createdAt: 0,
		...overrides
	};
}

type TestDocument = {
	id: string; eventId: string; kind: 'waiver' | 'letter'; language: 'en' | 'es'; pdf: Buffer; sha256: string;
	driveFileId: string | null; backupStatus: 'pending' | 'uploading' | 'saved' | 'failed';
	backupAttempts: number; backupLeaseUntil: number | null; backupError: string | null;
	backedUpAt: number | null; createdAt: number;
};
type Stage = 'claim' | 'reserve' | 'save' | 'fail' | 'list' | 'lookup';

/**
 * Dependency-level model, not a PostgreSQL integration test. Run the real Drizzle query
 * builder and assert every CAS predicate, while modeling committed rows and a DB clock.
 * The parent integration suite must also exercise these queries on PostgreSQL.
 */
function database(...initial: TestDocument[]) {
	const rows = new Map(initial.map((row) => [row.id, row]));
	const queries: { stage: Stage; query: string; params: unknown[] }[] = [];
	let now = 1_000_000;
	let fault: ((stage: Stage, point: 'before' | 'after') => void) | undefined;
	const eligible = (row: TestDocument) => row.backupStatus !== 'saved' && (row.backupLeaseUntil === null || row.backupLeaseUntil <= now);
	const db = drizzle(async (query, params) => {
		const stage: Stage = query.startsWith('select') ? query.includes('inner join') ? 'list' : 'lookup'
			: query.includes('"backup_attempts" + 1') ? 'claim'
				: query.startsWith('update "bootcamp_documents" set "drive_file_id"') ? 'reserve'
					: params[0] === 'saved' ? 'save' : 'fail';
		queries.push({ stage, query, params });
		fault?.(stage, 'before');
		const where = query.split(' where ')[1] ?? '';
		const value = (fragment: string, table: string | null, column: string) => {
			const expression = `${table ? `"${table}"\\.` : ''}"${column}" = \\$(\\d+)`;
			const match = new RegExp(expression).exec(fragment);
			return match ? params[Number(match[1]) - 1] : undefined;
		};
		const condition = (column: string) => value(where, 'bootcamp_documents', column);
		const setting = (column: string) => value(query.split(' where ')[0], null, column);
		let output: unknown[][] = [];
		if (stage === 'list' || stage === 'claim') {
			expect(where).toContain('"bootcamp_documents"."backup_status" <>');
			expect(where).toContain('"bootcamp_documents"."backup_lease_until" is null or');
			expect(where).toContain('"bootcamp_documents"."backup_lease_until" <= statement_timestamp()');
			expect(params).toContain('saved');
		}
		if (stage === 'list') {
			expect(query).toStartWith('select "bootcamp_documents"."id"');
			expect(query).not.toContain('"pdf"');
			expect(query).toContain('order by "bootcamp_documents"."backup_attempts" asc');
			const event = value(where, 'bootcamp_registrations', 'event_id');
			const limit = params.at(-1) as number;
			output = [...rows.values()].filter((row) => eligible(row) && (event === undefined || row.eventId === event))
				.sort((a, b) => a.backupAttempts - b.backupAttempts || a.createdAt - b.createdAt || a.id.localeCompare(b.id))
				.slice(0, limit).map((row) => [row.id]);
		} else {
			const row = rows.get(condition('id') as string);
			if (stage === 'lookup') {
				output = row ? [[row.backupStatus, row.driveFileId]] : [];
			} else if (stage === 'claim') {
				expect(query).toContain('"backup_attempts" = "bootcamp_documents"."backup_attempts" + 1');
				expect(query).toContain("statement_timestamp() + $2 * interval '1 millisecond'");
				if (row && eligible(row)) {
					row.backupStatus = 'uploading';
					row.backupAttempts += 1;
					row.backupLeaseUntil = now + Number(params[1]);
					row.backupError = null;
					output = [[row.id, row.kind, row.language, row.pdf, row.sha256, row.driveFileId, row.backupAttempts]];
				}
			} else {
				expect(condition('backup_status')).toBe('uploading');
				expect(typeof condition('backup_attempts')).toBe('number');
				expect(where).toContain('"bootcamp_documents"."backup_lease_until" > statement_timestamp()');
				const owned = row && row.backupStatus === 'uploading' && row.backupAttempts === condition('backup_attempts') &&
					row.backupLeaseUntil !== null && row.backupLeaseUntil > now;
				if (stage === 'reserve') {
					expect(where).toContain('"bootcamp_documents"."drive_file_id" is null');
					if (owned && row.driveFileId === null) {
						row.driveFileId = setting('drive_file_id') as string;
						output = [[row.id]];
					}
				} else if (stage === 'save') {
					expect(query).toContain('"backed_up_at" = statement_timestamp()');
					expect(typeof condition('drive_file_id')).toBe('string');
					if (owned && row.driveFileId === condition('drive_file_id')) {
						row.backupStatus = 'saved'; row.backedUpAt = now;
						row.backupError = null; row.backupLeaseUntil = null;
						output = [[row.id]];
					}
				} else if (owned) {
					row.backupStatus = 'failed'; row.backupError = setting('backup_error') as string;
					row.backupLeaseUntil = now + Number(params[1]);
					output = [[row.id]];
				}
			}
		}
		fault?.(stage, 'after');
		return { rows: output };
	});
	return {
		db: db as unknown as BootcampBackupDatabase, rows, queries,
		advance: (ms: number) => { now += ms; }, now: () => now,
		setFault: (next?: typeof fault) => { fault = next; }
	};
}

function drive() {
	const files = new Map<string, DriveFile>();
	let sequence = 0;
	const generateFileId = mock(async () => `reserved-${++sequence}`);
	const upload = mock<DriveClient['upload']>(async (file) => {
		if (!file.id) throw new Error('Backup must always supply a reserved ID.');
		if (files.has(file.id)) throw new DriveError('bad_input', 'Conflict.', 409);
		files.set(file.id, {
			id: file.id, name: file.filename, mimeType: file.mimeType!, parents: [file.parentFolderId],
			appProperties: { ...file.appProperties }, trashed: false,
			sha256Checksum: sha256(file.bytes), size: String(file.bytes.byteLength)
		});
		return file.id;
	});
	const getFile = mock(async (id: string) => {
		const file = files.get(id);
		if (!file) throw new DriveError('bad_input', 'Not found.', 404);
		return file;
	});
	const client: DriveClientWithFileIds = { upload, generateFileId, getFile, createFolder: async () => { throw new Error('No folders expected.'); } };
	return { client, files, generateFileId, upload, getFile };
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
	return { promise, resolve, reject };
}

const saved = (id = documentId, fileId = 'reserved-1') => ({ documentId: id, status: 'saved' as const, driveFileId: fileId });

describe('persistent bootcamp backups', () => {
	test('commits a reservation before sending the exact persisted bytes, then verifies and saves', async () => {
		const row = document();
		const pdf = Buffer.from(row.pdf);
		const store = database(row);
		const remote = drive();
		const upload = remote.client.upload;
		remote.client.upload = async (file, signal) => {
			if (!file.id) throw new Error('Expected a reserved ID before upload.');
			expect(row.driveFileId).toBe(file.id);
			expect(row.backupStatus).toBe('uploading');
			expect(row.backedUpAt).toBeNull();
			expect(row.backupAttempts).toBe(1);
			expect(file.bytes).toEqual(pdf);
			expect(file.filename).toBe(`bootcamp-${documentId}-waiver-es.pdf`);
			expect(file.appProperties).toEqual({ bootcampDocumentId: documentId, sha256: row.sha256 });
			expect(signal).toBeInstanceOf(AbortSignal);
			return upload(file, signal);
		};
		const backup = createBootcampBackup(store.db, remote.client, folderId);
		expect(await backup.backupDocument(documentId)).toEqual(saved());
		expect(row).toMatchObject({ backupStatus: 'saved', backupError: null, backupLeaseUntil: null, backedUpAt: store.now() });
		expect(row.pdf).toEqual(pdf);
		expect(row.sha256).toBe(sha256(pdf));
		expect(store.queries.map(({ stage }) => stage)).toEqual(['claim', 'reserve', 'save']);
		expect(remote.getFile).toHaveBeenCalledTimes(1);
		expect(await backup.backupDocument(documentId)).toEqual(saved());
		expect(remote.upload).toHaveBeenCalledTimes(1);
		expect(row.backupAttempts).toBe(1);
	});

	test('an ambiguous upload survives a restart, reuses its ID, and verifies the 409', async () => {
		const row = document();
		const store = database(row);
		const remote = drive();
		const upload = remote.client.upload;
		remote.client.upload = async (file, signal) => {
			await upload(file, signal);
			throw new Error(secret);
		};
		expect(await createBootcampBackup(store.db, remote.client, folderId).backupDocument(documentId)).toEqual({
			documentId, status: 'failed', error: 'drive_unavailable'
		});
		expect(row).toMatchObject({ driveFileId: 'reserved-1', backupStatus: 'failed', backupAttempts: 1, backupError: 'drive_unavailable' });
		expect(row.backupLeaseUntil).toBe(store.now() + 30_000);
		remote.client.upload = upload;
		const restarted = createBootcampBackup(store.db, remote.client, folderId);
		expect(await restarted.backupDocument(documentId)).toEqual({ documentId, status: 'busy' });
		store.advance(30_000);
		expect(await restarted.backupDocument(documentId)).toEqual(saved());
		expect(remote.files.size).toBe(1);
		expect(remote.generateFileId).toHaveBeenCalledTimes(1);
		expect(remote.upload.mock.calls.map(([file]) => file.id)).toEqual(['reserved-1', 'reserved-1']);
		expect(row.backupAttempts).toBe(2);
	});

	test('missing or legacy Drive configuration leaves documents queued and does not consume attempts', async () => {
		const row = document({ backupStatus: 'failed', backupError: 'drive_auth' });
		const store = database(row);
		const remote = drive();
		for (const [client, folder] of [
			[undefined, folderId], [null, folderId], [remote.client, undefined], [remote.client, '  '],
			[{ upload: remote.upload, createFolder: remote.client.createFolder }, folderId]
		] as const) {
			const backup = createBootcampBackup(store.db, client, folder);
			expect(await backup.backupDocument(documentId)).toEqual({ documentId, status: 'queued', error: 'not_configured' });
			expect(await backup.drain()).toEqual([]);
		}
		expect(store.queries).toHaveLength(0);
		expect(row.backupAttempts).toBe(0);
		expect(row.backupStatus).toBe('failed');
		expect(remote.generateFileId).not.toHaveBeenCalled();
	});

	test('only one concurrent claimant uploads; missing documents do not reach Drive', async () => {
		const store = database(document());
		const remote = drive();
		const workers = Array.from({ length: 5 }, () => createBootcampBackup(store.db, remote.client, folderId));
		const results = await Promise.all(workers.map((worker) => worker.backupDocument(documentId)));
		expect(results.filter((result) => result.status === 'saved')).toHaveLength(1);
		expect(results.filter((result) => result.status === 'busy')).toHaveLength(4);
		expect(remote.generateFileId).toHaveBeenCalledTimes(1);
		expect(remote.upload).toHaveBeenCalledTimes(1);
		expect(await workers[0].backupDocument('missing')).toEqual({ documentId: 'missing', status: 'not_found' });
	});

	for (const lateOutcome of ['success', 'failure'] as const) {
		test(`expired worker ${lateOutcome} cannot overwrite a new owner's saved result`, async () => {
			const row = document();
			const store = database(row);
			const remote = drive();
			const started = deferred<void>();
			const response = deferred<string>();
			const upload = remote.client.upload;
			const oldClient = { ...remote.client, upload: async (file: Parameters<DriveClient['upload']>[0]) => {
				await upload(file); started.resolve(); return response.promise;
			} };
			const old = createBootcampBackup(store.db, oldClient, folderId).backupDocument(documentId);
			await started.promise;
			store.advance(120_001);
			expect(await createBootcampBackup(store.db, remote.client, folderId).backupDocument(documentId)).toEqual(saved());
			if (lateOutcome === 'success') response.resolve('reserved-1');
			else response.reject(new Error(secret));
			expect(await old).toEqual({ documentId, status: 'busy' });
			expect(row).toMatchObject({ backupStatus: 'saved', backupAttempts: 2, backupError: null });
			expect(remote.files.size).toBe(1);
			expect(remote.generateFileId).toHaveBeenCalledTimes(1);
		});
	}

	test('an expired ID generator cannot replace a successor reservation or upload its orphan ID', async () => {
		const row = document();
		const store = database(row);
		const remote = drive();
		const started = deferred<void>();
		const generated = deferred<string>();
		const oldClient = { ...remote.client, generateFileId: async () => { started.resolve(); return generated.promise; } };
		const old = createBootcampBackup(store.db, oldClient, folderId).backupDocument(documentId);
		await started.promise;
		store.advance(120_001);
		expect(await createBootcampBackup(store.db, remote.client, folderId).backupDocument(documentId)).toEqual(saved());
		generated.resolve('orphan-generated-id');
		expect(await old).toEqual({ documentId, status: 'busy' });
		expect(row.driveFileId).toBe('reserved-1');
		expect(remote.upload).toHaveBeenCalledTimes(1);
	});

	for (const point of ['before', 'after'] as const) {
		for (const stage of ['reserve', 'save'] as const) {
			test(`a DB failure ${point} ${stage} is safe to retry after the lease expires`, async () => {
				const row = document();
				const store = database(row);
				const remote = drive();
				store.setFault((operation, when) => { if (operation === stage && when === point) throw new Error(secret); });
				expect(await createBootcampBackup(store.db, remote.client, folderId).backupDocument(documentId)).toEqual({
					documentId, status: 'queued', error: 'storage_unavailable'
				});
				if (stage === 'reserve') expect(remote.upload).not.toHaveBeenCalled();
				store.setFault();
				store.advance(120_001);
				const result = await createBootcampBackup(store.db, remote.client, folderId).backupDocument(documentId);
				expect(result.status).toBe('saved');
				expect(remote.files.size).toBe(1);
				expect(remote.generateFileId).toHaveBeenCalledTimes(stage === 'reserve' && point === 'before' ? 2 : 1);
			});
		}
	}

	test('never uploads a corrupted PDF or an incorrect persisted digest', async () => {
		for (const change of [{ sha256: '0'.repeat(64) }, { pdf: Buffer.alloc(0) }]) {
			const row = document(change);
			const store = database(row);
			const remote = drive();
			expect(await createBootcampBackup(store.db, remote.client, folderId).backupDocument(documentId)).toEqual({
				documentId, status: 'failed', error: 'invalid_pdf'
			});
			expect(remote.generateFileId).not.toHaveBeenCalled();
			expect(remote.upload).not.toHaveBeenCalled();
			expect(row.backedUpAt).toBeNull();
		}
	});

	for (const conflict of [false, true]) {
		test(`checks all integrity metadata on ${conflict ? 'conflict' : 'successful create'}, not just the ID`, async () => {
			for (const change of [
				{ id: 'other-id' }, { trashed: true }, { mimeType: 'text/plain' }, { parents: ['wrong-folder'] },
				{ appProperties: { bootcampDocumentId: 'other-document', sha256: document().sha256 } },
				{ appProperties: { bootcampDocumentId: documentId, sha256: '0'.repeat(64) } },
				{ sha256Checksum: '0'.repeat(64) }, { sha256Checksum: undefined }, { size: '1000' }
			] satisfies Partial<DriveFile>[]) {
				const row = document({ driveFileId: 'reserved-1' });
				const store = database(row);
				const remote = drive();
				const upload = remote.client.upload;
				remote.client.upload = async (file) => {
					const id = await upload(file);
					Object.assign(remote.files.get(id)!, change);
					if (conflict) throw new DriveError('bad_input', secret, 409);
					return id;
				};
				expect(await createBootcampBackup(store.db, remote.client, folderId).backupDocument(documentId)).toEqual({
					documentId, status: 'failed', error: 'drive_mismatch'
				});
				expect(row.backedUpAt).toBeNull();
				expect(row.driveFileId).toBe('reserved-1');
				expect(remote.generateFileId).not.toHaveBeenCalled();
			}
		});
	}

	test('fails closed on a different returned ID and on a conflict whose metadata cannot be read', async () => {
		for (const response of ['wrong-id', 'conflict'] as const) {
			const row = document({ driveFileId: 'reserved-1' });
			const store = database(row);
			const remote = drive();
			remote.client.upload = async () => {
				if (response === 'conflict') throw new DriveError('bad_input', secret, 409);
				return 'wrong-id';
			};
			expect(await createBootcampBackup(store.db, remote.client, folderId).backupDocument(documentId)).toEqual({
				documentId, status: 'failed', error: response === 'conflict' ? 'drive_rejected' : 'drive_mismatch'
			});
			expect(row.backupStatus).toBe('failed');
			expect(row.driveFileId).toBe('reserved-1');
		}
	});

	test('stores only fixed failure codes, including generation and authentication failures', async () => {
		for (const [error, code] of [
			[new Error(secret), 'drive_unavailable'], [new DriveError('auth', secret, 401), 'drive_auth'],
			[new DriveError('bad_input', secret, 400), 'drive_rejected'],
			[new DriveError('configuration', secret), 'not_configured']
		] as const) {
			const row = document();
			const store = database(row);
			const remote = drive();
			remote.client.generateFileId = async () => { throw error; };
			const result = await createBootcampBackup(store.db, remote.client, folderId).backupDocument(documentId);
			expect(result).toEqual({ documentId, status: 'failed', error: code });
			expect(row.backupError).toBe(code);
			expect(JSON.stringify(result)).not.toContain(secret);
			expect(remote.upload).not.toHaveBeenCalled();
		}
	});

	test('does not abandon retries at a maximum attempt count; backoff is capped at 30 minutes', async () => {
		const row = document({ backupAttempts: 100 });
		const store = database(row);
		const remote = drive();
		remote.client.generateFileId = async () => { throw new Error(secret); };
		await createBootcampBackup(store.db, remote.client, folderId).backupDocument(documentId);
		expect(row.backupAttempts).toBe(101);
		expect(row.backupLeaseUntil).toBe(store.now() + 30 * 60_000);
	});
});

describe('bounded backup draining', () => {
	test('scopes by event, skips saved/leased/backoff rows and continues after one failure', async () => {
		const initial = [
			document({ id: 'a', sha256: 'invalid' }), document({ id: 'b', kind: 'letter', language: 'en' }),
			document({ id: 'c' }), document({ id: 'd', eventId: 'different-event' }),
			document({ id: 'e', backupStatus: 'saved', driveFileId: 'saved-elsewhere' }),
			document({ id: 'f', backupStatus: 'uploading', backupLeaseUntil: 2_000_000 }),
			document({ id: 'g', backupStatus: 'failed', backupLeaseUntil: 2_000_000 })
		];
		const store = database(...initial);
		const remote = drive();
		const results = await createBootcampBackup(store.db, remote.client, folderId).drain({ eventId, limit: 2 });
		expect(results).toEqual([{ documentId: 'a', status: 'failed', error: 'invalid_pdf' }, saved('b')]);
		expect(initial.slice(2).map((row) => row.backupAttempts)).toEqual([0, 0, 0, 0, 0]);
		expect(remote.upload.mock.calls[0][0].filename).toBe('bootcamp-b-letter-en.pdf');
	});

	test('recovers expired uploading rows without a reservation and reuses existing reservations', async () => {
		const store = database(
			document({ id: 'a', backupStatus: 'uploading', backupLeaseUntil: 1, backupAttempts: 1 }),
			document({ id: 'b', backupStatus: 'uploading', backupLeaseUntil: 1, backupAttempts: 1, driveFileId: 'reserved-before-restart' })
		);
		const remote = drive();
		expect(await createBootcampBackup(store.db, remote.client, folderId).drain()).toEqual([
			saved('a'), saved('b', 'reserved-before-restart')
		]);
		expect(remote.generateFileId).toHaveBeenCalledTimes(1);
	});

	test('has a default batch of ten, validates bounds, and performs no unbounded loop', async () => {
		const store = database(...Array.from({ length: 12 }, (_, index) => document({ id: `doc-${index}` })));
		const remote = drive();
		const backup = createBootcampBackup(store.db, remote.client, folderId);
		expect(await backup.drain()).toHaveLength(10);
		expect(remote.upload).toHaveBeenCalledTimes(10);
		for (const limit of [0, -1, 1.5, 51, Infinity, NaN]) {
			await expect(backup.drain({ limit })).rejects.toBeInstanceOf(RangeError);
		}
		expect(store.queries.filter(({ stage }) => stage === 'list')).toHaveLength(1);
		expect(await backup.drain({ limit: 50 })).toHaveLength(2);
	});

	test('a list failure is sanitized; claim and failure-recording outages leave recoverable leases', async () => {
		const row = document();
		const store = database(row);
		const remote = drive();
		const backup = createBootcampBackup(store.db, remote.client, folderId);
		store.setFault(() => { throw new Error(secret); });
		await expect(backup.drain()).rejects.toEqual(new BootcampBackupError('storage_unavailable'));
		expect(await backup.backupDocument(documentId)).toEqual({ documentId, status: 'queued', error: 'storage_unavailable' });
		store.setFault((stage) => { if (stage === 'fail') throw new Error(secret); });
		remote.client.generateFileId = async () => { throw new Error(secret); };
		expect(await backup.backupDocument(documentId)).toEqual({ documentId, status: 'queued', error: 'storage_unavailable' });
		expect(row.backupStatus).toBe('uploading');
		expect(row.backupLeaseUntil).toBe(store.now() + 120_000);
	});
});
