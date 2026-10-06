import { describe, expect, mock, spyOn, test } from 'bun:test';
import { Buffer } from 'node:buffer';
import type { AttendanceFormValues } from '../src/lib/attendance/types';
import type { IstFormValues } from '../src/lib/ist/types';
import { createAttendanceActions } from '../src/lib/server/attendance-action';
import { createIstActions } from '../src/lib/server/ist-action';
import { createReportArchive, type GetReportArchive, type ReportArchive, type ReportFiles } from '../src/lib/server/drive/archive';
import { DriveError, type DriveClient } from '../src/lib/server/drive/client';
import { generateReportDownloads } from '../src/lib/server/report-downloads';

const languages = ['en', 'es'] as const;
const parentFolderId = 'configured-private-reports-folder';
const fileIds = { en: 'private-drive-file-id-en', es: 'private-drive-file-id-es' };
const sensitive = 'private-refresh-token; María Muñoz; upstream body; %PDF-private-content';
const uuidSuffix = /_([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.pdf$/;

const signedIn = {
	language: 'es',
	user: {
		id: 'student-1', name: 'María Muñoz', email: 'student@example.test', emailVerified: true,
		role: 'student', createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01')
	},
	session: {
		id: 'session-1', userId: 'student-1', token: 'private-session-token',
		createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'), expiresAt: new Date('2099-01-01')
	}
} satisfies App.Locals;
const anonymous: App.Locals = { language: 'es', user: null, session: null };
const unauthenticated = [
	{ name: 'anonymous', locals: anonymous },
	{ name: 'missing user', locals: { ...signedIn, user: null } },
	{ name: 'missing session', locals: { ...signedIn, session: null } },
	{ name: 'mismatched session', locals: { ...signedIn, session: { ...signedIn.session, userId: 'another-student' } } }
] satisfies { name: string; locals: App.Locals }[];

function attendanceValues(): AttendanceFormValues {
	return {
		studentName: 'María Sofía Pagán Cruz', studentSex: 'female',
		programStartDate: '2026-04-15', cohort: 'regular', classTime: 'pm',
		employerName: 'Roberto Quiñones', employerPosition: 'Supervisor',
		employerWorkplace: 'Walgreens, Plaza del Sol'
	};
}

function istValues(): IstFormValues {
	return {
		studentName: 'José María Muñoz', sex: 'male', age: '19', weightLb: '170.25', waistIn: '33.125',
		pushUpsStatus: 'recorded', pushUpsValue: '56', sitUpsStatus: 'recorded', sitUpsValue: '65',
		plankStatus: 'recorded', plankMinutes: '2', plankSeconds: '35',
		runStatus: 'recorded', runMinutes: '7', runSeconds: '45'
	};
}

type ReportAction = ReturnType<typeof createAttendanceActions>['default'] | ReturnType<typeof createIstActions>['default'];

async function submit(
	action: ReportAction,
	values: AttendanceFormValues | IstFormValues,
	locals: App.Locals,
	extras: [string, string][] = []
) {
	const data = new FormData();
	for (const [field, value] of Object.entries(values)) data.append(field, value);
	for (const [field, value] of extras) data.append(field, value);
	const request = new Request('http://localhost', { method: 'POST', body: data });
	const headers: Record<string, string> = {};
	const event = {
		request, locals,
		setHeaders: (next) => { Object.assign(headers, next); }
	} satisfies Pick<Parameters<ReportAction>[0], 'request' | 'locals' | 'setHeaders'>;
	const result = await action(event as Parameters<ReportAction>[0]);
	return { result, headers, signal: request.signal };
}

function archiveFixture(uploadImplementation: DriveClient['upload'] = async (file) =>
	file.filename.includes('_en_') ? fileIds.en : fileIds.es
) {
	const upload = mock<DriveClient['upload']>(uploadImplementation);
	const createFolder = mock<DriveClient['createFolder']>(async () => 'unexpected-folder-id');
	const archive = mock(createReportArchive({ upload, createFolder }, parentFolderId));
	const getArchive = mock<GetReportArchive>(() => archive);
	return { upload, createFolder, archive, getArchive };
}

function reportFiles(): ReportFiles {
	return {
		en: { bytes: new Uint8Array([0, 255, 195, 40, 13, 10, 1]), filename: 'report_en.pdf' },
		es: { bytes: new Uint8Array([128, 0, 254, 10, 13, 2]), filename: 'reporte_es.PDF' }
	};
}

function deferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
	return { promise, resolve, reject };
}

function nextTurn() {
	return new Promise<void>((resolve) => setImmediate(resolve));
}

for (const { name, createActions, validValues, snapshot } of [
	{ name: 'attendance', createActions: createAttendanceActions, validValues: attendanceValues, snapshot: 'certificate' },
	{ name: 'IST', createActions: createIstActions, validValues: istValues, snapshot: 'assessment' }
] as const) {
	describe(`${name} report archive integration`, () => {
		test('disabled archiving preserves anonymous bilingual PDF downloads', async () => {
			const getArchive = mock<GetReportArchive>(() => null);
			const values = validValues();
			const { result, headers } = await submit(createActions(getArchive).default, values, anonymous);
			if ('status' in result || !result.reports) throw new Error('Expected anonymous PDF downloads');
			expect(result).toMatchObject({ values, errors: {}, serverError: false, archiveError: null, archived: false });
			expect('certificate' in result ? result.certificate : result.assessment).not.toBeNull();
			expect(headers['cache-control']).toBe('no-store');
			expect(getArchive).toHaveBeenCalledTimes(1);
			for (const language of languages) {
				expect(Buffer.from(result.reports[language], 'base64').subarray(0, 5).toString()).toBe('%PDF-');
			}
			expect(result.reports.en).not.toBe(result.reports.es);
		});

		test('signed-in submissions archive the exact English and Spanish download bytes without returning Drive IDs', async () => {
			const drive = archiveFixture();
			const values = validValues();
			const { result, headers, signal } = await submit(createActions(drive.getArchive).default, values, signedIn, [
				['parentFolderId', 'client-chosen-folder'], ['filename', 'client-chosen.pdf'], ['fileId', 'client-chosen-id']
			]);
			if ('status' in result || !result.reports) throw new Error('Expected archived PDF downloads');
			expect(result).toMatchObject({ values, errors: {}, serverError: false, archiveError: null, archived: true });
			expect('certificate' in result ? result.certificate : result.assessment).not.toBeNull();
			expect(headers['cache-control']).toBe('no-store');
			expect(drive.getArchive).toHaveBeenCalledTimes(1);
			expect(drive.archive).toHaveBeenCalledTimes(1);
			expect(drive.upload).toHaveBeenCalledTimes(2);
			expect(drive.createFolder).not.toHaveBeenCalled();
			const archiveIds: string[] = [];
			for (const language of languages) {
				const calls = drive.upload.mock.calls.filter(([file]) => file.filename.includes(`_${language}_`));
				expect(calls).toHaveLength(1);
				const [file, uploadSignal] = calls[0];
				const downloaded = Buffer.from(result.reports[language], 'base64');
				expect(downloaded.subarray(0, 5).toString()).toBe('%PDF-');
				expect(Buffer.from(file.bytes)).toEqual(downloaded);
				expect(file.mimeType).toBe('application/pdf');
				expect(file.parentFolderId).toBe(parentFolderId);
				expect(uploadSignal).toBe(signal);
				expect(file.filename).toMatch(uuidSuffix);
				archiveIds.push(file.filename.match(uuidSuffix)![1]);
			}
			expect(archiveIds[0]).toBe(archiveIds[1]);
			expect(result.reports.en).not.toBe(result.reports.es);
			for (const privateValue of [...Object.values(fileIds), parentFolderId, signedIn.session.token, 'client-chosen']) {
				expect(JSON.stringify(result)).not.toContain(privateValue);
			}
		});

		for (const { name: authState, locals } of unauthenticated) {
			test(`enabled archiving rejects ${authState} with 401, preserving raw values without uploads`, async () => {
				const drive = archiveFixture();
				const values = { ...validValues(), studentName: `  ${validValues().studentName}  ` };
				const { result, headers } = await submit(createActions(drive.getArchive).default, values, locals);
				if (!('status' in result)) throw new Error('Expected an authentication failure');
				expect(result.status).toBe(401);
				expect<Record<string, unknown>>(result.data).toEqual({
					values, errors: {}, [snapshot]: null, reports: null,
					serverError: false, archiveError: 'signIn', archived: false
				});
				expect(headers['cache-control']).toBe('no-store');
				expect(drive.getArchive).toHaveBeenCalledTimes(1);
				expect(drive.archive).not.toHaveBeenCalled();
				expect(drive.upload).not.toHaveBeenCalled();
				expect(drive.createFolder).not.toHaveBeenCalled();
			});
		}

		for (const { name: authState, locals } of [{ name: 'signed-in', locals: signedIn }, { name: 'anonymous', locals: anonymous }]) {
			test(`invalid ${authState} submissions never initialize or call the archive`, async () => {
				const drive = archiveFixture();
				const values = { ...validValues(), studentName: '   ' };
				const { result, headers } = await submit(createActions(drive.getArchive).default, values, locals);
				if (!('status' in result)) throw new Error('Expected a validation failure');
				expect(result.status).toBe(400);
				expect<Record<string, unknown>>(result.data).toEqual({
					values, errors: { studentName: 'required' }, [snapshot]: null, reports: null,
					serverError: false, archiveError: null, archived: false
				});
				expect(headers['cache-control']).toBe('no-store');
				expect(drive.getArchive).not.toHaveBeenCalled();
				expect(drive.archive).not.toHaveBeenCalled();
				expect(drive.upload).not.toHaveBeenCalled();
			});
		}

		for (const phase of ['configuration', 'upload'] as const) {
			test(`${phase} failures return 503 with no report or false success and log only a safe category/status`, async () => {
				const error = new DriveError(phase === 'configuration' ? 'configuration' : 'upstream', sensitive, 503);
				const drive = archiveFixture(async (file) => {
					if (file.filename.includes('_en_')) throw error;
					return fileIds.es;
				});
				const getArchive = phase === 'configuration' ? mock<GetReportArchive>(() => { throw error; }) : drive.getArchive;
				const log = spyOn(console, 'error').mockImplementation(() => {});
				try {
					const values = validValues();
					const { result, headers } = await submit(createActions(getArchive).default, values, signedIn);
					if (!('status' in result)) throw new Error('Archive failure unexpectedly returned success');
					expect(result.status).toBe(503);
					expect<Record<string, unknown>>(result.data).toEqual({
						values, errors: {}, [snapshot]: null, reports: null,
						serverError: false, archiveError: 'unavailable', archived: false
					});
					expect(headers['cache-control']).toBe('no-store');
					expect(getArchive).toHaveBeenCalledTimes(1);
					expect(drive.archive).toHaveBeenCalledTimes(phase === 'configuration' ? 0 : 1);
					expect(drive.upload).toHaveBeenCalledTimes(phase === 'configuration' ? 0 : 2);
					expect(drive.createFolder).not.toHaveBeenCalled();
					expect(log.mock.calls).toEqual([['Unable to archive report PDFs', { kind: error.kind, status: 503 }]]);
					for (const privateValue of [sensitive, ...Object.values(fileIds), parentFolderId]) {
						expect(JSON.stringify(result)).not.toContain(privateValue);
					}
				} finally {
					log.mockRestore();
				}
			});
		}
	});
}

describe('native IST choices with archiving enabled', () => {
	for (const { choice, changes } of [
		{ choice: 'runStatus:unable_to_complete', changes: { runStatus: 'unable_to_complete', runMinutes: '', runSeconds: '' } },
		{ choice: 'pushUpsStatus:recorded', changes: { pushUpsStatus: 'recorded' } }
	]) {
		test(`${choice} edits an anonymous form without consulting the archive or generating reports`, async () => {
			const drive = archiveFixture();
			const values = { ...istValues(), studentName: '', age: '', pushUpsValue: '0' };
			const { result, headers } = await submit(createIstActions(drive.getArchive).default, values, anonymous, [
				['exerciseChoice', choice]
			]);
			expect(result).toEqual({
				values: { ...values, ...changes }, errors: {}, assessment: null, reports: null,
				serverError: false, archiveError: null, archived: false
			});
			expect(headers['cache-control']).toBe('no-store');
			expect(drive.getArchive).not.toHaveBeenCalled();
			expect(drive.archive).not.toHaveBeenCalled();
			expect(drive.upload).not.toHaveBeenCalled();
		});
	}
});

describe('shared report download generation', () => {
	test('disabled mode encodes both original binary buffers for anonymous downloads', async () => {
		const files = reportFiles();
		const generate = mock(async () => files);
		const getArchive = mock<GetReportArchive>(() => null);
		const result = await generateReportDownloads({ getArchive, locals: anonymous, signal: new AbortController().signal, generate });
		expect(result).toEqual({
			ok: true, serverError: false, archiveError: null, archived: false,
			reports: { en: Buffer.from(files.en.bytes).toString('base64'), es: Buffer.from(files.es.bytes).toString('base64') }
		});
		expect(getArchive).toHaveBeenCalledTimes(1);
		expect(generate).toHaveBeenCalledTimes(1);
	});

	for (const { name, locals } of unauthenticated) {
		test(`auth rejection for ${name} happens before PDF generation or archiving`, async () => {
			const drive = archiveFixture();
			const generate = mock(async () => reportFiles());
			const result = await generateReportDownloads({
				getArchive: drive.getArchive, locals, signal: new AbortController().signal, generate
			});
			expect(result).toEqual({ ok: false, status: 401, serverError: false, archiveError: 'signIn', archived: false });
			expect(generate).not.toHaveBeenCalled();
			expect(drive.archive).not.toHaveBeenCalled();
			expect(drive.upload).not.toHaveBeenCalled();
		});
	}

	for (const { name, error, category } of [
		{ name: 'Drive configuration error', error: new DriveError('configuration', sensitive), category: { kind: 'configuration', status: undefined } },
		{ name: 'unexpected getter error', error: new Error(sensitive), category: { kind: 'unknown' } }
	]) {
		test(`${name} is an archive failure, skips generation, and does not leak its message`, async () => {
			const generate = mock(async () => reportFiles());
			const getArchive = mock<GetReportArchive>(() => { throw error; });
			const log = spyOn(console, 'error').mockImplementation(() => {});
			try {
				const result = await generateReportDownloads({ getArchive, locals: signedIn, signal: new AbortController().signal, generate });
				expect(result).toEqual({ ok: false, status: 503, serverError: false, archiveError: 'unavailable', archived: false });
				expect(getArchive).toHaveBeenCalledTimes(1);
				expect(generate).not.toHaveBeenCalled();
				expect(log.mock.calls).toEqual([['Unable to archive report PDFs', category]]);
			} finally {
				log.mockRestore();
			}
		});
	}

	for (const enabled of [false, true]) {
		test(`PDF failures skip archiving and remain generation failures with archiving ${enabled ? 'enabled' : 'disabled'}`, async () => {
			const drive = archiveFixture();
			const getArchive = enabled ? drive.getArchive : mock<GetReportArchive>(() => null);
			// Classification follows the failing phase, even if the generator throws a DriveError.
			const generate = mock(async (): Promise<ReportFiles> => { throw new DriveError('auth', sensitive, 401); });
			const log = spyOn(console, 'error').mockImplementation(() => {});
			try {
				const result = await generateReportDownloads({
					getArchive, locals: enabled ? signedIn : anonymous, signal: new AbortController().signal, generate
				});
				expect(result).toEqual({ ok: false, status: 503, serverError: true, archiveError: null, archived: false });
				expect(generate).toHaveBeenCalledTimes(1);
				expect(drive.archive).not.toHaveBeenCalled();
				expect(drive.upload).not.toHaveBeenCalled();
				expect(log.mock.calls).toEqual([['Unable to generate report PDFs']]);
			} finally {
				log.mockRestore();
			}
		});
	}

	for (const { name, error, category } of [
		{ name: 'Drive authentication', error: new DriveError('auth', sensitive, 403), category: { kind: 'auth', status: 403 } },
		{ name: 'Drive upstream', error: new DriveError('upstream', sensitive, 502), category: { kind: 'upstream', status: 502 } },
		{ name: 'unexpected upload', error: new Error(sensitive), category: { kind: 'unknown' } }
	]) {
		test(`${name} failures are archive-unavailable 503s, not PDF or viewer-auth failures`, async () => {
			const files = reportFiles();
			const generate = mock(async () => files);
			const archive = mock<ReportArchive>(async () => { throw error; });
			const signal = new AbortController().signal;
			const log = spyOn(console, 'error').mockImplementation(() => {});
			try {
				const result = await generateReportDownloads({ getArchive: () => archive, locals: signedIn, signal, generate });
				expect(result).toEqual({ ok: false, status: 503, serverError: false, archiveError: 'unavailable', archived: false });
				expect(generate).toHaveBeenCalledTimes(1);
				expect(archive).toHaveBeenCalledTimes(1);
				expect(archive).toHaveBeenCalledWith(files, signal);
				expect(log.mock.calls).toEqual([['Unable to archive report PDFs', category]]);
			} finally {
				log.mockRestore();
			}
		});
	}

	test('waits for the archive to finish before returning successful downloads', async () => {
		const files = reportFiles();
		const entered = deferred<void>();
		const completion = deferred<void>();
		const archive = mock<ReportArchive>(async () => {
			entered.resolve();
			await completion.promise;
		});
		const generate = mock(async () => files);
		const signal = new AbortController().signal;
		let settled = false;
		const pending = generateReportDownloads({ getArchive: () => archive, locals: signedIn, signal, generate })
			.finally(() => { settled = true; });
		try {
			await entered.promise;
			await nextTurn();
			expect(settled).toBe(false);
			expect(generate).toHaveBeenCalledTimes(1);
			expect(archive).toHaveBeenCalledTimes(1);
			expect(archive.mock.calls[0][0]).toBe(files);
			expect(archive.mock.calls[0][1]).toBe(signal);
		} finally {
			completion.resolve();
			await pending;
		}
		expect(await pending).toEqual({
			ok: true, serverError: false, archiveError: null, archived: true,
			reports: { en: Buffer.from(files.en.bytes).toString('base64'), es: Buffer.from(files.es.bytes).toString('base64') }
		});
	});
});

describe('Drive report archive pairing and completion', () => {
	test('pairs languages with one UUID suffix per submission, keeps submissions distinct, and uses only the configured parent', async () => {
		const drive = archiveFixture();
		const files = reportFiles();
		const signals = [new AbortController().signal, new AbortController().signal];
		const results = await Promise.all(signals.map((signal) => drive.archive(files, signal)));
		expect(results).toEqual([undefined, undefined]);
		expect(drive.upload).toHaveBeenCalledTimes(4);
		expect(drive.createFolder).not.toHaveBeenCalled();
		const submissionIds: string[] = [];
		for (const signal of signals) {
			const calls = drive.upload.mock.calls.filter(([, uploadSignal]) => uploadSignal === signal);
			expect(calls).toHaveLength(2);
			const ids: string[] = [];
			for (const language of languages) {
				const prefix = language === 'en' ? 'report_en' : 'reporte_es';
				const matching = calls.filter(([file]) => file.filename.startsWith(`${prefix}_`));
				expect(matching).toHaveLength(1);
				const [file] = matching[0];
				expect(file.bytes).toBe(files[language].bytes);
				expect(file.mimeType).toBe('application/pdf');
				expect(file.parentFolderId).toBe(parentFolderId);
				expect(file.filename).toMatch(uuidSuffix);
				const id = file.filename.match(uuidSuffix)![1];
				expect(file.filename).toBe(`${prefix}_${id}.pdf`);
				ids.push(id);
			}
			expect(ids[0]).toBe(ids[1]);
			submissionIds.push(ids[0]);
		}
		expect(submissionIds[0]).not.toBe(submissionIds[1]);
	});

	for (const failedLanguage of languages) {
		test(`an early ${failedLanguage} upload failure still waits for the other language before rejecting`, async () => {
			const uploads = { en: deferred<string>(), es: deferred<string>() };
			const survivingLanguage = failedLanguage === 'en' ? 'es' : 'en';
			const drive = archiveFixture((file) => uploads[file.filename.includes('_en_') ? 'en' : 'es'].promise);
			const error = new DriveError('upstream', 'Upload failed', 503);
			let settled = false;
			// Observe rejection immediately so a premature failure cannot become an unhandled rejection.
			const pending = drive.archive(reportFiles(), new AbortController().signal).then(
				() => { settled = true; return { ok: true }; },
				(error: unknown) => { settled = true; return { ok: false, error }; }
			);
			try {
				await nextTurn();
				expect(drive.upload).toHaveBeenCalledTimes(2);
				expect(settled).toBe(false);
				uploads[failedLanguage].reject(error);
				await nextTurn();
				expect(settled).toBe(false);
				uploads[survivingLanguage].resolve(fileIds[survivingLanguage]);
				expect(await pending).toEqual({ ok: false, error });
				expect(drive.upload).toHaveBeenCalledTimes(2);
				expect(drive.createFolder).not.toHaveBeenCalled();
			} finally {
				for (const language of languages) uploads[language].resolve(fileIds[language]);
				await pending;
			}
		});
	}
});
