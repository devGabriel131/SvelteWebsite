import { createHash } from 'node:crypto';
import { and, asc, eq, isNull, lte, ne, or, sql } from 'drizzle-orm';
import type { Database } from '../db/connection';
import { bootcampDocuments as documents, bootcampRegistrations as registrations } from '../db/bootcamp-schema';
import { DriveError, type DriveClient, type DriveFile } from '../drive/client';

export type BootcampBackupDatabase = Pick<Database, 'select' | 'update'>;
export type BootcampBackupFailure =
	| 'not_configured' | 'storage_unavailable' | 'invalid_pdf'
	| 'drive_unavailable' | 'drive_auth' | 'drive_rejected' | 'drive_mismatch';
export type BootcampBackupResult =
	| { documentId: string; status: 'saved'; driveFileId: string }
	| { documentId: string; status: 'queued' | 'failed'; error: BootcampBackupFailure }
	| { documentId: string; status: 'busy' | 'not_found' };
export type BootcampBackupDrainOptions = { eventId?: string; limit?: number };
export type BootcampBackup = {
	backupDocument(documentId: string): Promise<BootcampBackupResult>;
	/** One sequential batch, at most 50 documents (default 10); never starts a background task. */
	drain(options?: BootcampBackupDrainOptions): Promise<BootcampBackupResult[]>;
};

const leaseMs = 120_000;
const operationTimeoutMs = 90_000;
const maxBatchSize = 50;
const selection = {
	id: documents.id, kind: documents.kind, language: documents.language,
	pdf: documents.pdf, sha256: documents.sha256,
	driveFileId: documents.driveFileId, backupAttempts: documents.backupAttempts
};
type ClaimedDocument = Pick<typeof documents.$inferSelect, keyof typeof selection>;

/** Only fixed codes cross this boundary; never retain provider/SQL messages or causes. */
export class BootcampBackupError extends Error {
	constructor(readonly code: BootcampBackupFailure) {
		super(`Bootcamp backup: ${code}.`);
		this.name = 'BootcampBackupError';
	}
}

async function storage<T>(work: () => PromiseLike<T>): Promise<T> {
	try {
		return await work();
	} catch {
		throw new BootcampBackupError('storage_unavailable');
	}
}

function failureCode(error: unknown): BootcampBackupFailure {
	if (error instanceof BootcampBackupError) return error.code;
	if (error instanceof DriveError) {
		switch (error.kind) {
			case 'configuration': return 'not_configured';
			case 'auth': return 'drive_auth';
			case 'bad_input': return 'drive_rejected';
		}
	}
	return 'drive_unavailable';
}

function eligible() {
	return and(
		ne(documents.backupStatus, 'saved'),
		or(isNull(documents.backupLeaseUntil), lte(documents.backupLeaseUntil, sql`statement_timestamp()`))
	);
}

function owned(document: ClaimedDocument) {
	return and(
		eq(documents.id, document.id),
		eq(documents.backupStatus, 'uploading'),
		eq(documents.backupAttempts, document.backupAttempts),
		sql`${documents.backupLeaseUntil} > statement_timestamp()`
	);
}

function verifyFile(file: DriveFile, document: ClaimedDocument, fileId: string, folderId: string) {
	if (file.id !== fileId || file.trashed !== false || file.mimeType !== 'application/pdf' ||
		!file.parents.includes(folderId) || file.appProperties.bootcampDocumentId !== document.id ||
		file.appProperties.sha256 !== document.sha256 || file.sha256Checksum?.toLowerCase() !== document.sha256 ||
		file.size !== String(document.pdf.byteLength)) {
		throw new BootcampBackupError('drive_mismatch');
	}
}

/**
 * Pass a normal, autocommitting DB connection, NOT an open transaction. Call only after the
 * immutable snapshot/PDF insert commits. Google failures never roll back that insert.
 *
 * driveFileId is a reservation until backupStatus='saved'. Never clear/reassign it on retry.
 * backupAttempts fences stale workers; backupLeaseUntil is also the retry-not-before time
 * for failed rows (30s exponential backoff, capped at 30m). All timing uses the DB clock.
 * A scheduled/admin caller must invoke drain() again after failures or process restarts.
 */
export function createBootcampBackup(
	db: BootcampBackupDatabase,
	drive: { client: Pick<DriveClient, 'upload' | 'generateFileId' | 'getFile'>; folderId: string } | null
): BootcampBackup {

	async function backupDocument(documentId: string): Promise<BootcampBackupResult> {
		if (drive === null) {
			return { documentId, status: 'queued', error: 'not_configured' };
		}
		const { client, folderId } = drive;

		let document: ClaimedDocument | undefined;
		try {
			// A single UPDATE is the claim/CAS; no transaction spans external HTTP.
			[document] = await storage(() => db.update(documents).set({
				backupStatus: 'uploading',
				backupAttempts: sql`${documents.backupAttempts} + 1`,
				backupLeaseUntil: sql`statement_timestamp() + ${leaseMs} * interval '1 millisecond'`,
				backupError: null
			}).where(and(eq(documents.id, documentId), eligible())).returning(selection));
			if (!document) {
				const [existing] = await storage(() => db.select({
					status: documents.backupStatus, driveFileId: documents.driveFileId
				}).from(documents).where(eq(documents.id, documentId)).limit(1));
				if (!existing) return { documentId, status: 'not_found' };
				if (existing.status === 'saved' && existing.driveFileId) {
					return { documentId, status: 'saved', driveFileId: existing.driveFileId };
				}
				return { documentId, status: 'busy' };
			}

			if (!(document.pdf instanceof Uint8Array) || document.pdf.byteLength === 0 ||
				createHash('sha256').update(document.pdf).digest('hex') !== document.sha256) {
				throw new BootcampBackupError('invalid_pdf');
			}
			const ownership = owned(document);
			const signal = AbortSignal.timeout(operationTimeoutMs);
			let fileId = document.driveFileId;
			if (!fileId) {
				fileId = await client.generateFileId(signal);
				// Commit the reservation before upload. A lost DB response must never lead to upload.
				const reserved = await storage(() => db.update(documents).set({ driveFileId: fileId })
					.where(and(ownership, isNull(documents.driveFileId))).returning({ id: documents.id }));
				if (!reserved.length) return { documentId, status: 'busy' };
			}

			try {
				const uploadedId = await client.upload({
					id: fileId,
					bytes: document.pdf,
					filename: `bootcamp-${document.id}-${document.kind}-${document.language}.pdf`,
					mimeType: 'application/pdf', parentFolderId: folderId,
					appProperties: { bootcampDocumentId: document.id, sha256: document.sha256 }
				}, signal);
				if (uploadedId !== fileId) throw new BootcampBackupError('drive_mismatch');
			} catch (error) {
				// Documented pre-generated-ID retry behavior: 409 means inspect, not assume success.
				// https://developers.google.com/workspace/drive/api/guides/manage-uploads#use_a_pre-generated_id_to_upload_files
				if (!(error instanceof DriveError) || error.status !== 409) throw error;
			}
			verifyFile(await client.getFile(fileId, signal), document, fileId, folderId);
			const saved = await storage(() => db.update(documents).set({
				backupStatus: 'saved', backedUpAt: sql`statement_timestamp()`,
				backupLeaseUntil: null, backupError: null
			}).where(and(ownership, eq(documents.driveFileId, fileId))).returning({ id: documents.id }));
			return saved.length ? { documentId, status: 'saved', driveFileId: fileId } : { documentId, status: 'busy' };
		} catch (error) {
			const code = failureCode(error);
			if (!document || code === 'storage_unavailable') {
				// A DB outage may prevent recording failure. The committed lease still expires.
				return { documentId, status: 'queued', error: code };
			}
			try {
				const ownership = owned(document);
				const retryMs = Math.min(30 * 60_000, 30_000 * 2 ** Math.min(document.backupAttempts - 1, 6));
				const failed = await storage(() => db.update(documents).set({
					backupStatus: 'failed', backupError: code,
					backupLeaseUntil: sql`statement_timestamp() + ${retryMs} * interval '1 millisecond'`
				}).where(ownership).returning({ id: documents.id }));
				return failed.length ? { documentId, status: 'failed', error: code } : { documentId, status: 'busy' };
			} catch {
				return { documentId, status: 'queued', error: 'storage_unavailable' };
			}
		}
	}

	return {
		backupDocument,
		async drain({ eventId, limit = 10 } = {}) {
			if (!Number.isInteger(limit) || limit < 1 || limit > maxBatchSize) {
				throw new RangeError('Bootcamp backup limit must be an integer between 1 and 50.');
			}
			if (drive === null) return [];
			// Select IDs only: PDFs are loaded one at a time by the lease winner.
			// Concurrent drainers may select the same candidates; backupDocument's CAS arbitrates.
			const candidates = await storage(() => db.select({ id: documents.id }).from(documents)
				.innerJoin(registrations, eq(documents.registrationId, registrations.id))
				.where(and(eligible(), eventId === undefined ? undefined : eq(registrations.eventId, eventId)))
				.orderBy(asc(documents.backupAttempts), asc(documents.createdAt), asc(documents.id)).limit(limit));
			const results: BootcampBackupResult[] = [];
			for (const { id } of candidates) results.push(await backupDocument(id));
			return results;
		}
	};
}
