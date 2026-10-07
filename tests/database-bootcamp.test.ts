import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createHash, randomUUID } from 'node:crypto';
import { crc32, deflateSync, inflateSync } from 'node:zlib';
import { and, eq, inArray } from 'drizzle-orm';
import { assertLocalDatabaseUrl, verifyLocalDatabase } from '../scripts/db/local-target';
import { migrateDatabase } from '../scripts/db/migrate';
import { signingDate } from '../src/lib/bootcamp/rules';
import { sectionKeys, type LetterSnapshot, type WaiverSnapshot } from '../src/lib/bootcamp/types';
import { activateEvent, eventReport, getEvent, listEvents, reportCsv, saveEvent, toggleEvent } from '../src/lib/server/bootcamp/admin';
import type { AthClient } from '../src/lib/server/bootcamp/ath';
import { createBootcampBackup } from '../src/lib/server/bootcamp/backup';
import { createPaymentService, createPaymentTokenVault } from '../src/lib/server/bootcamp/payments';
import { renderLetterPdf, renderWaiverPdf } from '../src/lib/server/bootcamp/pdf';
import { createRegistrationService, documentForViewer, eventView, linkedStudent, studentPage } from '../src/lib/server/bootcamp/registration';
import { validateSignature } from '../src/lib/server/bootcamp/signatures';
import { studentIdentityVersion } from '../src/lib/server/bootcamp/signing';
import { BootcampError } from '../src/lib/server/bootcamp/validation';
import { createDatabase, type DatabaseConnection } from '../src/lib/server/db/connection';
import { user } from '../src/lib/server/db/auth-schema';
import { bootcampAccounts as accounts, bootcampDocuments as documents, bootcampEvents as events, bootcampPayments as payments, bootcampRegistrations as registrations } from '../src/lib/server/db/bootcamp-schema';
import { students, type NewStudent, type Student } from '../src/lib/server/db/schema';
import type { DriveClient, DriveUpload } from '../src/lib/server/drive/client';

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;
const day = 86_400_000;
const paymentKey = 'ab'.repeat(32); // Fictional test-only encryption key and capability.
const paymentToken = 'bootcamp.integration.test-token';
const previewSecret = 'cd'.repeat(16);
type Event = typeof events.$inferSelect;
type Participant = { account: typeof user.$inferSelect; student: typeof students.$inferSelect };

function form(values: Record<string, string>): FormData {
	const result = new FormData();
	for (const [key, value] of Object.entries(values)) result.set(key, value);
	return result;
}

// Real RGB PNGs with CRCs, filter-0 scanlines, and distinct fictional ink for each section.
// Do not import another test module: doing so also registers that module's tests.
function signature(seed: number): string {
	function chunk(type: string, data: Buffer): Buffer {
		const result = Buffer.alloc(data.length + 12);
		result.writeUInt32BE(data.length);
		result.write(type, 4);
		data.copy(result, 8);
		result.writeUInt32BE(crc32(result.subarray(4, -4)), result.length - 4);
		return result;
	}
	const header = Buffer.alloc(13);
	header.writeUInt32BE(600);
	header.writeUInt32BE(180, 4);
	header[8] = 8;
	header[9] = 2;
	const raw = Buffer.alloc(1801 * 180, 255);
	for (let y = 0; y < 180; y++) {
		raw[y * 1801] = 0;
		for (let x = 40; x < 180; x++) {
			if (Math.abs(y - (40 + seed * 10 + Math.floor(x / 6) % 20)) < 2) {
				raw.fill(0, y * 1801 + 1 + x * 3, y * 1801 + 4 + x * 3);
			}
		}
	}
	return 'data:image/png;base64,' + Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
		chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))
	]).toString('base64');
}
const signatures = { agreement: signature(1), liability: signature(2), media: signature(3) };

function birthday(years: number): string {
	const today = signingDate(new Date());
	const year = Number(today.slice(0, 4)) - years;
	const candidate = `${year}${today.slice(4)}`;
	return new Date(`${candidate}T12:00:00Z`).toISOString().slice(0, 10) === candidate
		? candidate : `${year}-02-28`;
}
function waiverForm(event: Event, student: Student, overrides: Record<string, string> = {}): FormData {
	const values: Record<string, string> = {
		eventId: event.id, revision: String(event.revision), identityVersion: studentIdentityVersion(student),
		language: 'es', dateOfBirth: '1990-01-01',
		phone: '787-555-0100', municipality: 'Mayagüez', signingCity: 'Añasco', ...signatures
	};
	for (const key of sectionKeys) values[`read${key[0].toUpperCase()}${key.slice(1)}`] = 'true';
	return form({ ...values, ...overrides });
}
function letterForm(event: Event, overrides: Record<string, string> = {}): FormData {
	return form({ eventId: event.id, revision: String(event.revision), needsLetter: 'true', language: 'es',
		employer: 'Empresa Ficticia', contact: 'Alex de Prueba', position: 'Gerencia', workplace: 'Oficina de Prueba',
		...overrides });
}
function eventForm(overrides: Record<string, string> = {}): FormData {
	return form({ title: 'Bootcamp Ficticio Estándar', venue: 'Cancha de Añasco', legalSource: 'standard', legalApproved: 'true',
		eventDate: signingDate(new Date(Date.now() + 10 * day)), startTime: '08:00', endTime: '16:00',
		...overrides });
}
function sha256(pdf: Uint8Array): string { return createHash('sha256').update(pdf).digest('hex'); }
function expectPdf(pdf: Buffer) {
	expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
	expect(pdf.toString('latin1').trimEnd()).toEndWith('%%EOF');
}
// Same PDFKit stream inspection as bootcamp-pdf.test.ts, limited to the legal body.
// Importing that test module would register its tests a second time.
function pdfLegalText(pdf: Buffer): string {
	const objects = new Map([...pdf.toString('latin1').matchAll(/(\d+) 0 obj\n([\s\S]*?)\nendobj/g)]
		.map((match) => [Number(match[1]), match[2]]));
	const decoder = new TextDecoder('windows-1252');
	let text = '';
	for (const object of objects.values()) {
		if (!/\/Type \/Page\b/.test(object)) continue;
		const resources = objects.get(Number(object.match(/\/Resources (\d+) 0 R/)?.[1]))!;
		const fonts = new Map([...resources.matchAll(/\/(F\d+) (\d+) 0 R/g)]
			.map((match) => [match[1], objects.get(Number(match[2]))!.match(/\/BaseFont \/([^\s]+)/)![1]]));
		const content = objects.get(Number(object.match(/\/Contents (\d+) 0 R/)?.[1]))!;
		const commands = inflateSync(Buffer.from(content.match(/stream\n([\s\S]*?)\nendstream/)![1], 'latin1')).toString('latin1');
		for (const match of commands.matchAll(/BT\n([\s\S]*?)\nET/g)) {
			if (fonts.get(match[1].match(/\/(F\d+) [\d.]+ Tf/)![1]) !== 'Times-Roman') continue;
			text += decoder.decode(Buffer.concat([...match[1].matchAll(/<([\da-f]+)>/gi)].map((hex) => Buffer.from(hex[1], 'hex'))));
		}
	}
	return text;
}
function postgresError(error: unknown): unknown {
	let current = error;
	for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth++) {
		if ('code' in current) return current;
		current = 'cause' in current ? current.cause : undefined;
	}
	return current;
}
function ath(overrides: Partial<AthClient> = {}): AthClient {
	return {
		async create() { return { reference: randomUUID(), authorizationToken: paymentToken }; },
		async verify() { throw new Error('Unexpected fake ATH verification'); },
		...overrides
	};
}
async function concurrent<T>(work: PromiseLike<T>[]): Promise<T[]> {
	// Settle every query before propagating failure so fixture cleanup cannot race a late commit.
	const results = await Promise.allSettled(work);
	return results.map((result) => {
		if (result.status === 'rejected') throw result.reason;
		return result.value;
	});
}
function gate() {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => { resolve = done; });
	return { promise, resolve };
}
async function bounded<T>(promise: Promise<T>): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([promise, new Promise<never>((_, reject) => {
			timer = setTimeout(() => reject(new Error('Concurrent operation did not progress within 5 seconds')), 5000);
		})]);
	} finally { clearTimeout(timer); }
}

describeDatabase('isolated PostgreSQL bootcamp schema and services', () => {
	let connection: DatabaseConnection;

	beforeAll(async () => {
		const target = assertLocalDatabaseUrl(databaseUrl!, 'test');
		connection = createDatabase(databaseUrl!);
		await verifyLocalDatabase(connection, target);
		await migrateDatabase(connection.db);
	}, 30000);

	afterAll(async () => { await connection?.client.end(); });

	async function withFixtures(run: (f: Awaited<ReturnType<typeof fixtures>>) => Promise<void>) {
		const owned = { users: [] as string[], students: [] as string[], events: [] as string[] };
		try {
			await run(await fixtures(owned));
		} finally {
			// Services must commit real transactions and use different pooled connections. An outer
			// rollback would hide locking/backup bugs. Delete only this test's UUID-scoped fixtures,
			// children first, without truncation, disabling triggers, or touching another test's rows.
			await connection.db.transaction(async (tx) => {
				if (owned.events.length) {
					const ownRegistrations = tx.select({ id: registrations.id }).from(registrations)
						.where(inArray(registrations.eventId, owned.events));
					await tx.delete(documents).where(inArray(documents.registrationId, ownRegistrations));
					await tx.delete(payments).where(inArray(payments.registrationId, ownRegistrations));
					await tx.delete(registrations).where(inArray(registrations.eventId, owned.events));
					await tx.delete(events).where(inArray(events.id, owned.events));
				}
				if (owned.users.length) await tx.delete(accounts).where(inArray(accounts.userId, owned.users));
				if (owned.students.length) await tx.delete(students).where(inArray(students.id, owned.students));
				if (owned.users.length) await tx.delete(user).where(inArray(user.id, owned.users));
			});
		}
	}

	async function fixtures(owned: { users: string[]; students: string[]; events: string[] }) {
		const db = connection.db;
		const service = createRegistrationService(db);
		async function account(role: 'student' | 'admin' = 'student', email = `bootcamp-account-${randomUUID()}@example.test`) {
			const id = randomUUID();
			owned.users.push(id);
			const [row] = await db.insert(user).values({ id, name: 'Cuenta Ficticia', email, role }).returning();
			return row;
		}
		const admin = await account('admin');
		async function student(overrides: Partial<NewStudent> = {}) {
			const id = randomUUID();
			owned.students.push(id);
			const [row] = await db.insert(students).values({
				firstName: 'María', lastName: 'de Prueba', email: `bootcamp-roster-${id}@example.test`,
				classType: 'basic', isActive: true, dateOfBirth: '1990-01-01', ...overrides, id
			}).returning();
			return row;
		}
		async function participant(overrides: Partial<NewStudent> = {}): Promise<Participant> {
			const roster = await student(overrides);
			const login = await account();
			await db.insert(accounts).values({ userId: login.id, studentId: roster.id, linkedBy: admin.id });
			return { student: roster, account: login };
		}
		async function event(overrides: Partial<typeof events.$inferInsert> = {}) {
			const id = randomUUID();
			owned.events.push(id);
			const now = Date.now();
			const [row] = await db.insert(events).values({
				title: `Bootcamp Ficticio ${id}`, venue: 'Cancha de Prueba',
				startsAt: new Date(now + 10 * day), endsAt: new Date(now + 11 * day),
				arrivalAt: new Date(now + 10 * day - 3600000), registrationClosesAt: new Date(now + 9 * day),
				legal: {
					en: { agreement: 'Fictional approved agreement. Preserve  exact words.', liability: 'Fictional liability terms.', media: 'Fictional media terms.' },
					es: { agreement: 'Acuerdo ficticio aprobado. Conservar  palabras exactas.', liability: 'Relevo ficticio.', media: 'Términos ficticios de imagen.' }
				},
				legalApproved: true, registrationOpen: true, approvedBy: admin.id, createdBy: admin.id,
				...overrides, id
			}).returning();
			return row;
		}
		async function createEvent(input: FormData, activate = false) {
			const id = await (activate ? activateEvent : saveEvent)(db, admin.id, input);
			owned.events.push(id);
			const [row] = await db.select().from(events).where(eq(events.id, id));
			return row;
		}
		async function registration(person: Participant, event: Event) {
			const [row] = await db.select().from(registrations).where(and(
				eq(registrations.studentId, person.student.id), eq(registrations.eventId, event.id)
			));
			return row;
		}
		async function document(id: string) {
			const [row] = await db.select().from(documents).where(eq(documents.id, id));
			return row;
		}
		async function ready(event: Event, person?: Participant) {
			person ??= await participant();
			await service.submitWaiver(person.account.id, waiverForm(event, person.student));
			await service.submitLetter(person.account.id, form({ eventId: event.id, needsLetter: 'false' }));
			return { person, registration: await registration(person, event) };
		}
		return { db, service, admin, account, student, participant, event, createEvent, registration, document, ready };
	}

	test('email matching never grants access; an existing account-to-roster association is required', async () => {
		await withFixtures(async (f) => {
			const roster = await f.student();
			const spoof = await f.account('student', roster.email);
			const intended = await f.account();
			const event = await f.event();
			expect(await linkedStudent(f.db, spoof.id)).toBeNull();
			expect(await studentPage(f.db, spoof.id, false)).toEqual({ student: null, events: [], registrations: [], paymentEnabled: false });
			await expect(f.service.start(spoof.id, event.id)).rejects.toMatchObject({ code: 'notLinked' });
			await expect(f.service.submitWaiver(spoof.id, waiverForm(event, roster, { studentId: roster.id, email: roster.email })))
				.rejects.toMatchObject({ code: 'notLinked' });
			await f.db.insert(accounts).values({ userId: intended.id, studentId: roster.id, linkedBy: f.admin.id });
			expect((await linkedStudent(f.db, intended.id))?.id).toBe(roster.id);
			expect(await linkedStudent(f.db, spoof.id)).toBeNull();
			const other = await f.student();
			const documentId = await f.service.submitWaiver(intended.id, waiverForm(event, roster, {
				studentId: other.id, email: other.email, name: 'Spoofed Name'
			}));
			const saved = await f.document(documentId);
			expect(saved.snapshot.student).toMatchObject({ name: 'María de Prueba', email: roster.email });
			expect(await f.db.select().from(registrations).where(eq(registrations.studentId, other.id))).toHaveLength(0);
			expect(await documentForViewer(f.db, documentId, spoof)).toBeNull();
			expect((await documentForViewer(f.db, documentId, intended))?.id).toBe(documentId);
			await expect(f.service.ownedRegistration(spoof.id, event.id)).rejects.toMatchObject({ code: 'notLinked' });
		});
	});

	test('existing account-to-roster associations remain one-to-one', async () => {
		await withFixtures(async (f) => {
			const person = await f.participant();
			const otherStudent = await f.student();
			const otherAccount = await f.account();
			for (const values of [
				{ studentId: otherStudent.id, userId: person.account.id },
				{ studentId: person.student.id, userId: otherAccount.id }
			]) await expect(f.db.insert(accounts).values({ ...values, linkedBy: f.admin.id })
				.catch((error) => { throw postgresError(error); })).rejects.toMatchObject({ code: '23505' });
			expect((await linkedStudent(f.db, person.account.id))?.id).toBe(person.student.id);
			expect(await linkedStudent(f.db, otherAccount.id)).toBeNull();
		});
	});

	for (const [label, overrides] of [
		['inactive adult', { isActive: false }], ['active under 21', { dateOfBirth: birthday(20) }]
	] as const) {
		test(`server rejects ${label}, even with a forged adult birthday`, async () => {
			await withFixtures(async (f) => {
				const person = await f.participant(overrides);
				const event = await f.event();
				await expect(f.service.start(person.account.id, event.id)).rejects.toMatchObject({ code: 'ineligible' });
				await expect(f.service.preview(person.account.id, waiverForm(event, person.student))).rejects.toMatchObject({ code: 'ineligible' });
				await expect(f.service.submitWaiver(person.account.id, waiverForm(event, person.student))).rejects.toMatchObject({ code: 'ineligible' });
				expect(await f.registration(person, event)).toBeUndefined();
				expect((await studentPage(f.db, person.account.id, true)).events.some((row) => row.id === event.id)).toBe(false);
			});
		});
	}

	test('age 21 is eligible, but an unknown birthday must be completed server-side before signing', async () => {
		await withFixtures(async (f) => {
			const event = await f.event();
			const adult = await f.participant({ dateOfBirth: birthday(21) });
			await f.service.submitWaiver(adult.account.id, waiverForm(event, adult.student, { dateOfBirth: adult.student.dateOfBirth! }));
			expect((await f.registration(adult, event)).waiver).not.toBeNull();
			const unknown = await f.participant({ dateOfBirth: null });
			await f.service.start(unknown.account.id, event.id);
			for (const dateOfBirth of ['', birthday(20), '2023-02-29', '2999-01-01']) {
				await expect(f.service.submitWaiver(unknown.account.id, waiverForm(event, unknown.student, { dateOfBirth }))).rejects.toBeInstanceOf(Error);
			}
			expect((await f.registration(unknown, event)).waiver).toBeNull();
			expect((await linkedStudent(f.db, unknown.account.id))?.dateOfBirth).toBeNull();
		});
	});

	test('concurrent starts return one registration and do not advance waiver or letter state', async () => {
		await withFixtures(async (f) => {
			const person = await f.participant();
			const event = await f.event();
			const results = await concurrent(Array.from({ length: 6 }, () => f.service.start(person.account.id, event.id)));
			expect(new Set(results).size).toBe(1);
			expect(await f.service.start(person.account.id, event.id)).toBe(results[0]);
			const rows = await f.db.select().from(registrations).where(eq(registrations.eventId, event.id));
			expect(rows).toHaveLength(1);
			expect(rows[0]).toMatchObject({ id: results[0], waiver: null, letterChoice: null });
			expect(await f.db.select().from(documents).where(eq(documents.registrationId, results[0]))).toHaveLength(0);
		});
	});

	test('Spanish preview renders a real PDF without saving registration, birthday, or documents', async () => {
		await withFixtures(async (f) => {
			const person = await f.participant({ dateOfBirth: null });
			const event = await f.event();
			let backups = 0;
			const service = createRegistrationService(f.db, async () => { backups++; });
			expectPdf(await service.preview(person.account.id, waiverForm(event, person.student)));
			expect(await f.registration(person, event)).toBeUndefined();
			expect((await linkedStudent(f.db, person.account.id))?.dateOfBirth).toBeNull();
			const registrationId = await service.start(person.account.id, event.id);
			const before = await f.registration(person, event);
			expectPdf(await service.preview(person.account.id, waiverForm(event, person.student)));
			expect(await f.registration(person, event)).toEqual(before);
			expect(await f.db.select().from(documents).where(eq(documents.registrationId, registrationId))).toHaveLength(0);
			expect(backups).toBe(0);
		});
	});

	test('Spanish preview token saves the exact reviewed PDF, not a newly dated rendering', async () => {
		await withFixtures(async (f) => {
			const person = await f.participant({ dateOfBirth: null });
			const event = await f.event();
			const backups: Buffer[] = [];
			const service = createRegistrationService(f.db, async (id) => {
				backups.push((await f.document(id)).pdf);
				throw new Error('Fictional backup outage');
			}, previewSecret);
			const input = waiverForm(event, person.student);
			const preview = await service.previewDocument(person.account.id, input);
			expectPdf(preview.pdf);
			expect(typeof preview.token).toBe('string');
			expect(preview.token.length).toBeGreaterThan(0);
			expect(await f.registration(person, event)).toBeUndefined();
			expect((await linkedStudent(f.db, person.account.id))?.dateOfBirth).toBeNull();
			expect(backups).toHaveLength(0);
			// PDF metadata has second precision. Cross a second boundary so accidentally
			// re-rendering with a fresh signing time cannot pass a byte-equality assertion.
			await Bun.sleep(1100);
			const submittedAt = Date.now();
			input.set('previewToken', preview.token);
			const documentId = await service.submitWaiver(person.account.id, input);
			const saved = await f.document(documentId);
			expect(saved.pdf).toEqual(preview.pdf);
			expect(saved.sha256).toBe(sha256(preview.pdf));
			expect(saved).toMatchObject({ language: 'es', kind: 'waiver', backupStatus: 'pending' });
			expect(Date.parse((saved.snapshot as WaiverSnapshot).signedAt)).toBeLessThan(submittedAt);
			expect(saved.snapshot).toEqual((await f.registration(person, event)).waiver!);
			expect((await linkedStudent(f.db, person.account.id))?.dateOfBirth).toBe('1990-01-01');
			expect(backups).toEqual([preview.pdf]);
			expect((await documentForViewer(f.db, documentId, { id: person.account.id, role: 'student' }))?.pdf).toEqual(preview.pdf);
		});
	}, 15000);

	test('tampered preview tokens are rejected without saving any registration or birthday', async () => {
		await withFixtures(async (f) => {
			const person = await f.participant({ dateOfBirth: null });
			const event = await f.event();
			let backups = 0;
			const service = createRegistrationService(f.db, async () => { backups++; }, previewSecret);
			const input = waiverForm(event, person.student);
			const preview = await service.previewDocument(person.account.id, input);
			const index = Math.floor(preview.token.length / 2);
			const tampered = preview.token.slice(0, index) + (preview.token[index] === 'A' ? 'B' : 'A') + preview.token.slice(index + 1);
			input.set('previewToken', tampered);
			await expect(service.submitWaiver(person.account.id, input)).rejects.toBeInstanceOf(BootcampError);
			expect(await f.registration(person, event)).toBeUndefined();
			expect((await linkedStudent(f.db, person.account.id))?.dateOfBirth).toBeNull();
			expect(backups).toBe(0);
			input.set('previewToken', preview.token);
			const id = await service.submitWaiver(person.account.id, input);
			expect((await f.document(id)).pdf).toEqual(preview.pdf);
			expect(backups).toBe(1);
		});
	});

	test('a preview token cannot be reused for changed form contents or another linked student', async () => {
		await withFixtures(async (f) => {
			const person = await f.participant();
			const other = await f.participant();
			const event = await f.event();
			const service = createRegistrationService(f.db, undefined, previewSecret);
			const preview = await service.previewDocument(person.account.id, waiverForm(event, person.student));
			const changed = waiverForm(event, person.student, { phone: '787-555-0199', previewToken: preview.token });
			await expect(service.submitWaiver(person.account.id, changed)).rejects.toBeInstanceOf(BootcampError);
			const transplanted = waiverForm(event, other.student, { previewToken: preview.token });
			await expect(service.submitWaiver(other.account.id, transplanted)).rejects.toBeInstanceOf(BootcampError);
			expect(await f.registration(person, event)).toBeUndefined();
			expect(await f.registration(other, event)).toBeUndefined();
		});
	});

	for (const changedField of ['firstName', 'email', 'updatedAt'] as const) {
		test(`a changed roster ${changedField} invalidates the identity version from an already-open form`, async () => {
			await withFixtures(async (f) => {
				const person = await f.participant();
				const event = await f.event();
				const staleForm = waiverForm(event, person.student);
				await f.service.start(person.account.id, event.id);
				const before = await f.registration(person, event);
				// The roster trigger uses the DB clock; ensure an updatedAt-only change also
				// differs at the millisecond precision returned by the driver.
				await connection.client`SELECT pg_sleep(0.005)`;
				const change = changedField === 'firstName' ? { firstName: 'Nombre Corregido' }
					: changedField === 'email' ? { email: `corrected-${randomUUID()}@example.test` }
						: { updatedAt: new Date() };
				const [current] = await f.db.update(students).set(change).where(eq(students.id, person.student.id)).returning();
				expect(studentIdentityVersion(current)).not.toBe(staleForm.get('identityVersion'));
				await expect(f.service.preview(person.account.id, staleForm)).rejects.toMatchObject({ code: 'stale' });
				await expect(f.service.submitWaiver(person.account.id, staleForm)).rejects.toMatchObject({ code: 'stale' });
				expect(await f.registration(person, event)).toEqual(before);
				expect(await f.db.select().from(documents).where(eq(documents.registrationId, before.id))).toHaveLength(0);
				const id = await f.service.submitWaiver(person.account.id, waiverForm(event, current));
				expect((await f.document(id)).snapshot.student).toMatchObject({
					name: `${current.firstName} ${current.lastName}`, email: current.email
				});
			});
		});
	}

	test('waiver preview and submission require an explicit identity version', async () => {
		await withFixtures(async (f) => {
			const person = await f.participant();
			const event = await f.event();
			const input = waiverForm(event, person.student);
			input.delete('identityVersion');
			await expect(f.service.preview(person.account.id, input)).rejects.toBeInstanceOf(BootcampError);
			await expect(f.service.submitWaiver(person.account.id, input)).rejects.toBeInstanceOf(BootcampError);
			expect(await f.registration(person, event)).toBeUndefined();
		});
	});

	for (const section of sectionKeys) {
		test(`waiver requires both the ${section} acknowledgement and a valid PNG signature`, async () => {
			await withFixtures(async (f) => {
				const person = await f.participant();
				const event = await f.event();
				const readKey = `read${section[0].toUpperCase()}${section.slice(1)}`;
				for (const overrides of [{ [readKey]: 'false' }, { [section]: 'data:image/png;base64,bm90LWEtcG5n' }]) {
					await expect(f.service.submitWaiver(person.account.id, waiverForm(event, person.student, overrides)))
						.rejects.toMatchObject({ code: 'invalid' });
				}
				expect(await f.registration(person, event)).toBeUndefined();
			});
		});
	}

	test('new waiver previews and submissions reject every language except exact es without side effects', async () => {
		await withFixtures(async (f) => {
			const person = await f.participant({ dateOfBirth: null });
			const event = await f.event();
			let backups = 0;
			const service = createRegistrationService(f.db, async () => { backups++; }, previewSecret);
			for (const language of [null, 'en', 'fr', '', 'ES', 'es-PR', ' es ', new File(['es'], 'language.txt')]) {
				const input = waiverForm(event, person.student);
				if (language === null) input.delete('language');
				else input.set('language', language);
				await expect(service.preview(person.account.id, input)).rejects.toMatchObject({ name: 'BootcampError', code: 'invalid' });
				await expect(service.previewDocument(person.account.id, input)).rejects.toMatchObject({ code: 'invalid' });
				await expect(service.submitWaiver(person.account.id, input)).rejects.toMatchObject({ code: 'invalid' });
				expect(await f.registration(person, event)).toBeUndefined();
				expect((await linkedStudent(f.db, person.account.id))?.dateOfBirth).toBeNull();
			}
			expect(backups).toBe(0);
		});
	});

	test('stale revisions, a changed saved birthday, and invalid languages cannot create a waiver', async () => {
		await withFixtures(async (f) => {
			const person = await f.participant();
			const event = await f.event();
			for (const [overrides, code] of [
				[{ revision: '2' }, 'stale'], [{ dateOfBirth: '1991-01-01' }, 'stale'], [{ language: 'fr' }, 'invalid']
			] as const) {
				await expect(f.service.submitWaiver(person.account.id, waiverForm(event, person.student, overrides))).rejects.toMatchObject({ code });
			}
			expect(await f.registration(person, event)).toBeUndefined();
		});
	});

	test('Spanish waiver commits exact snapshot/PDF/birthday before a real backup-service failure', async () => {
		await withFixtures(async (f) => {
			const person = await f.participant({ dateOfBirth: null });
			const event = await f.event();
			const uploads: DriveUpload[] = [];
			const observed: { document: typeof documents.$inferSelect; registration: typeof registrations.$inferSelect; birthday: string | null | undefined }[] = [];
			const fileId = `fictional-drive-${randomUUID()}`;
			const drive: DriveClient = {
				async generateFileId() { return fileId; },
				async upload(upload) {
					uploads.push(upload);
					observed.push({ document: await f.document(upload.appProperties!.bootcampDocumentId),
						registration: await f.registration(person, event), birthday: (await linkedStudent(f.db, person.account.id))?.dateOfBirth });
					throw new Error('Fictional Drive outage; do not persist provider details');
				},
				async getFile() { throw new Error('Unexpected fake Drive read'); },
				async createFolder() { throw new Error('Unexpected fake Drive folder creation'); }
			};
			const backup = createBootcampBackup(f.db, drive, 'fictional-folder');
			const service = createRegistrationService(f.db, backup.backupDocument);
			const documentId = await service.submitWaiver(person.account.id, waiverForm(event, person.student, { ssn: '000-00-0000' }));
			const registration = await f.registration(person, event);
			const saved = await f.document(documentId);
			expect(saved).toMatchObject({ registrationId: registration.id, kind: 'waiver', language: 'es',
				backupStatus: 'failed', backupError: 'drive_unavailable', backupAttempts: 1, driveFileId: fileId });
			expect(saved.snapshot).toEqual(registration.waiver!);
			expect(saved.snapshot).toMatchObject({ event: eventView(event), language: 'es',
				student: { name: 'María de Prueba', email: person.student.email, dateOfBirth: '1990-01-01' },
				signatures: Object.fromEntries(sectionKeys.map((key) => [key, validateSignature(signatures[key])])) });
			expect(JSON.stringify(saved.snapshot)).not.toContain('000-00-0000');
			expectPdf(saved.pdf);
			expect(saved.pdf).toEqual(await renderWaiverPdf(saved.snapshot as WaiverSnapshot));
			expect(saved.sha256).toBe(sha256(saved.pdf));
			expect(uploads).toHaveLength(1);
			expect(uploads[0].bytes).toEqual(saved.pdf);
			expect(uploads[0].appProperties).toEqual({ bootcampDocumentId: documentId, sha256: saved.sha256 });
			expect(observed).toHaveLength(1);
			expect(observed[0].document.pdf).toEqual(saved.pdf);
			expect(saved.snapshot).toEqual(observed[0].registration.waiver!);
			expect(observed[0].birthday).toBe('1990-01-01');
			expect(await backup.backupDocument(documentId)).toEqual({ documentId, status: 'busy' });
			expect(uploads).toHaveLength(1);
		});
	});

	test('a throwing backup callback cannot roll back the saved waiver or force a replacement on repeat submission', async () => {
		await withFixtures(async (f) => {
			const person = await f.participant();
			const event = await f.event();
			const backups: string[] = [];
			const service = createRegistrationService(f.db, async (id) => { backups.push(id); throw new Error('Fictional outage'); });
			const ids = await concurrent(Array.from({ length: 3 }, () => service.submitWaiver(person.account.id, waiverForm(event, person.student))));
			expect(new Set(ids).size).toBe(1);
			const original = await f.document(ids[0]);
			expect(original.backupStatus).toBe('pending');
			expect(await service.submitWaiver(person.account.id, waiverForm(event, person.student, { phone: '787-555-0199', language: 'es' }))).toBe(original.id);
			expect(await f.document(original.id)).toEqual(original);
			expect(original.snapshot).toEqual((await f.registration(person, event)).waiver!);
			expect(await f.db.select().from(documents).where(eq(documents.registrationId, original.registrationId))).toHaveLength(1);
			expect(backups).toEqual([original.id, original.id, original.id, original.id]);
		});
	});

	test('a late document uniqueness failure rolls back both the waiver snapshot and newly supplied birthday', async () => {
		await withFixtures(async (f) => {
			const person = await f.participant({ dateOfBirth: null });
			const event = await f.event();
			const registrationId = await f.service.start(person.account.id, event.id);
			const snapshot: WaiverSnapshot = {
				event: eventView(event), language: 'en', signedAt: new Date().toISOString(), signatures,
				student: { name: 'María de Prueba', email: person.student.email, dateOfBirth: '1990-01-01',
					phone: '787-555-0100', municipality: 'Mayagüez', signingCity: 'Añasco' }
			};
			const pdf = await renderWaiverPdf(snapshot);
			// A schema-valid competing document forces the INSERT to fail after the service's
			// student/registration UPDATEs. No mocks or shared-table failure triggers are needed.
			const [competing] = await f.db.insert(documents).values({ registrationId, kind: 'waiver', language: 'en',
				snapshot, pdf, sha256: sha256(pdf) }).returning();
			let backups = 0;
			const service = createRegistrationService(f.db, async () => { backups++; });
			const failure = await service.submitWaiver(person.account.id, waiverForm(event, person.student)).then(() => null, postgresError);
			expect(failure).toMatchObject({ code: '23505', constraint_name: 'bootcamp_document_registration_kind' });
			expect((await f.registration(person, event)).waiver).toBeNull();
			expect((await linkedStudent(f.db, person.account.id))?.dateOfBirth).toBeNull();
			expect(await f.document(competing.id)).toEqual(competing);
			expect(backups).toBe(0);
		});
	});

	test('declining the optional letter requires no employer fields and creates no letter document', async () => {
		await withFixtures(async (f) => {
			const person = await f.participant();
			const event = await f.event();
			await expect(f.service.submitLetter(person.account.id, form({ eventId: event.id, needsLetter: 'false' })))
				.rejects.toMatchObject({ code: 'invalid' });
			await f.service.submitWaiver(person.account.id, waiverForm(event, person.student));
			expect(await f.service.submitLetter(person.account.id, form({ eventId: event.id, needsLetter: 'false' }))).toBeNull();
			expect((await f.registration(person, event)).letterChoice).toBe(false);
			await f.service.submitLetter(person.account.id, letterForm(event));
			const registration = await f.registration(person, event);
			expect(registration.letterChoice).toBe(false);
			expect((await f.db.select().from(documents).where(eq(documents.registrationId, registration.id))).map((row) => row.kind)).toEqual(['waiver']);
		});
	});

	test('letter saves only approved employer fields, exact PDF bytes, and no SSN; retries never replace it', async () => {
		await withFixtures(async (f) => {
			const person = await f.participant();
			const event = await f.event();
			await f.service.submitWaiver(person.account.id, waiverForm(event, person.student));
			for (const key of ['employer', 'contact', 'position', 'workplace']) {
				const incomplete = letterForm(event);
				incomplete.delete(key);
				await expect(f.service.submitLetter(person.account.id, incomplete)).rejects.toMatchObject({ code: 'invalid' });
				expect((await f.registration(person, event)).letterChoice).toBeNull();
			}
			const backedUp: string[] = [];
			const service = createRegistrationService(f.db, async (id) => { backedUp.push(id); throw new Error('Fictional backup outage'); });
			const documentId = await service.submitLetter(person.account.id, letterForm(event, { ssn: '000-00-0000', socialSecurityNumber: '000-00-0000' }));
			expect(documentId).not.toBeNull();
			const saved = await f.document(documentId!);
			const snapshot = saved.snapshot as LetterSnapshot;
			expect(saved).toMatchObject({ kind: 'letter', language: 'es', backupStatus: 'pending' });
			expect(snapshot.employer).toEqual({ employer: 'Empresa Ficticia', contact: 'Alex de Prueba', position: 'Gerencia', workplace: 'Oficina de Prueba' });
			expect(Object.keys(snapshot).sort()).toEqual(['employer', 'event', 'issuedAt', 'language', 'student']);
			expect(JSON.stringify(snapshot)).not.toMatch(/ssn|socialSecurity|000-00-0000/i);
			expect(snapshot.student).toEqual((await f.registration(person, event)).waiver!.student);
			expectPdf(saved.pdf);
			expect(saved.pdf).toEqual(await renderLetterPdf(snapshot));
			expect(saved.sha256).toBe(sha256(saved.pdf));
			expect((await f.registration(person, event)).letterChoice).toBe(true);
			await service.submitLetter(person.account.id, letterForm(event, { employer: 'Changed employer' }));
			expect(await f.document(saved.id)).toEqual(saved);
			expect(backedUp).toEqual([saved.id]);
			expect(await f.db.select().from(documents).where(and(eq(documents.registrationId, saved.registrationId), eq(documents.kind, 'letter')))).toHaveLength(1);
		});
	});

	test('new employer letters use the current event schedule and revision without replacing the signed waiver', async () => {
		await withFixtures(async (f) => {
			const person = await f.participant();
			const event = await f.event();
			const waiverId = await f.service.submitWaiver(person.account.id, waiverForm(event, person.student));
			const waiver = await f.document(waiverId);
			const [current] = await f.db.update(events).set({
				revision: event.revision + 1, title: 'Bootcamp Ficticio Reprogramado', venue: 'Nueva Cancha de Prueba',
				startsAt: new Date(event.startsAt.getTime() + day), endsAt: new Date(event.endsAt.getTime() + day),
				arrivalAt: new Date(event.arrivalAt.getTime() + day), registrationClosesAt: new Date(event.registrationClosesAt.getTime() + day)
			}).where(eq(events.id, event.id)).returning();
			await expect(f.service.submitLetter(person.account.id, letterForm(event))).rejects.toMatchObject({ code: 'stale' });
			const missingRevision = letterForm(current);
			missingRevision.delete('revision');
			await expect(f.service.submitLetter(person.account.id, missingRevision)).rejects.toBeInstanceOf(BootcampError);
			expect((await f.registration(person, event)).letterChoice).toBeNull();
			expect(await f.db.select().from(documents).where(eq(documents.registrationId, waiver.registrationId))).toHaveLength(1);
			const letterId = await f.service.submitLetter(person.account.id, letterForm(current));
			const letter = await f.document(letterId!);
			expect(letter.snapshot.event).toEqual(eventView(current));
			expect(letter.snapshot.student).toEqual(waiver.snapshot.student);
			expect(letter.pdf).toEqual(await renderLetterPdf(letter.snapshot as LetterSnapshot));
			expect(await f.document(waiverId)).toEqual(waiver);
			expect((await f.registration(person, event)).waiver?.event).toEqual(eventView(event));
		});
	});

	test('a letter event edit committed during the row-lock wait aborts the letter atomically', async () => {
		await withFixtures(async (f) => {
			const person = await f.participant();
			const event = await f.event();
			const waiverId = await f.service.submitWaiver(person.account.id, waiverForm(event, person.student));
			const original = await f.registration(person, event);
			const waiver = await f.document(waiverId);
			const locked = gate();
			const release = gate();
			let lockerPid = 0;
			const editor = connection.client.begin(async (tx) => {
				await tx`SELECT id FROM bootcamp_events WHERE id = ${event.id} FOR UPDATE`;
				const [backend] = await tx`SELECT pg_backend_pid() AS pid`;
				lockerPid = backend.pid;
				locked.resolve();
				await release.promise;
				await tx`UPDATE bootcamp_events SET revision = revision + 1,
					starts_at = starts_at + interval '1 day', ends_at = ends_at + interval '1 day',
					arrival_at = arrival_at + interval '1 day' WHERE id = ${event.id}`;
			});
			const pending: Promise<unknown>[] = [editor];
			try {
				await bounded(locked.promise);
				const submission = f.service.submitLetter(person.account.id, letterForm(event))
					.then((id) => ({ id, error: null }), (error: unknown) => ({ id: null, error }));
				pending.push(submission);
				let waiting = false;
				for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
					const [row] = await connection.client`SELECT EXISTS (
						SELECT 1 FROM pg_stat_activity WHERE datname = current_database()
						AND ${lockerPid} = ANY(pg_blocking_pids(pid))
					) AS waiting`;
					waiting = row.waiting;
					if (!waiting) await Bun.sleep(20);
				}
				expect(waiting).toBe(true);
				release.resolve();
				await editor;
				expect((await submission).error).toMatchObject({ code: 'stale' });
				expect(await f.registration(person, event)).toEqual(original);
				expect(await f.document(waiverId)).toEqual(waiver);
				expect(await f.db.select().from(documents).where(eq(documents.registrationId, original.id))).toHaveLength(1);
			} finally { release.resolve(); await Promise.allSettled(pending); }
		});
	}, 15000);

	test('document triggers reject PDF, snapshot, hash, and registration changes while allowing backup bookkeeping', async () => {
		await withFixtures(async (f) => {
			const person = await f.participant();
			const other = await f.participant();
			const event = await f.event();
			const otherRegistration = await f.service.start(other.account.id, event.id);
			const waiverId = await f.service.submitWaiver(person.account.id, waiverForm(event, person.student));
			const letterId = await f.service.submitLetter(person.account.id, letterForm(event));
			for (const documentId of [waiverId, letterId!]) {
				const original = await f.document(documentId);
				for (const change of [
					{ pdf: Buffer.from('%PDF-fictional-replacement') },
					{ snapshot: { ...original.snapshot, student: { ...original.snapshot.student, name: 'Changed Evidence' } } },
					{ sha256: '0'.repeat(64) }, { registrationId: otherRegistration }
				]) {
					const failure = await f.db.update(documents).set(change).where(eq(documents.id, documentId)).then(() => null, postgresError);
					expect(failure).toMatchObject({ code: '23514' });
					expect(await f.document(documentId)).toEqual(original);
				}
				await f.db.update(documents).set({ backupStatus: 'failed', backupAttempts: 1, backupError: 'drive_unavailable' }).where(eq(documents.id, documentId));
				expect(await f.document(documentId)).toEqual({ ...original, backupStatus: 'failed', backupAttempts: 1, backupError: 'drive_unavailable' });
			}
		});
	});

	test('registration triggers preserve the signed waiver, letter choice, student, and event associations', async () => {
		await withFixtures(async (f) => {
			const event = await f.event();
			const nextEvent = await f.event();
			const other = await f.participant();
			const { person, registration } = await f.ready(event);
			for (const change of [
				{ eventId: nextEvent.id }, { studentId: other.student.id }, { waiver: null }, { letterChoice: true },
				{ waiver: { ...registration.waiver!, student: { ...registration.waiver!.student, name: 'Changed Evidence' } } }
			]) {
				const failure = await f.db.update(registrations).set(change).where(eq(registrations.id, registration.id)).then(() => null, postgresError);
				expect(failure).toMatchObject({ code: '23514' });
				expect(await f.registration(person, event)).toEqual(registration);
			}
			expect(await f.registration(person, nextEvent)).toBeUndefined();
			expect(await f.registration(other, event)).toBeUndefined();
		});
	});

	test('saved PDFs remain available only to the owner through event lifetime, or to an admin at any time', async () => {
		await withFixtures(async (f) => {
			const person = await f.participant();
			const other = await f.participant();
			const spoof = await f.account('student', person.student.email);
			const event = await f.event();
			const waiverId = await f.service.submitWaiver(person.account.id, waiverForm(event, person.student));
			const letterId = await f.service.submitLetter(person.account.id, letterForm(event));
			const original = await f.document(waiverId);
			await f.db.update(events).set({ registrationOpen: false, registrationClosesAt: new Date(Date.now() - 1000), title: 'Changed title' }).where(eq(events.id, event.id));
			await f.db.update(students).set({ isActive: false, firstName: 'Changed name' }).where(eq(students.id, person.student.id));
			for (const documentId of [waiverId, letterId!]) {
				const stored = await f.document(documentId);
				const owner = { id: person.account.id, role: 'student' };
				expect((await documentForViewer(f.db, documentId, owner))?.pdf).toEqual(stored.pdf);
				expect(await documentForViewer(f.db, documentId, { id: other.account.id, role: 'student' })).toBeNull();
				expect(await documentForViewer(f.db, documentId, { id: spoof.id, role: 'student' })).toBeNull();
				expect((await documentForViewer(f.db, documentId, owner, event.endsAt))?.pdf).toEqual(stored.pdf);
				const expired = new Date(event.endsAt.getTime() + 1);
				expect(await documentForViewer(f.db, documentId, owner, expired)).toBeNull();
				expect((await documentForViewer(f.db, documentId, { id: f.admin.id, role: 'admin' }, expired))?.pdf).toEqual(stored.pdf);
			}
			expect(await f.document(waiverId)).toEqual(original);
			const page = await studentPage(f.db, person.account.id, false);
			expect(page.events.find((row) => row.id === event.id)?.registrationOpen).toBe(false);
			expect(page.registrations.find((row) => row.eventId === event.id)?.documents).toHaveLength(2);
			expect((await studentPage(f.db, person.account.id, false, new Date(event.endsAt.getTime() + 1))).registrations).toHaveLength(0);
			await expect(documentForViewer(f.db, 'not-a-uuid', { id: f.admin.id, role: 'admin' })).rejects.toMatchObject({ code: 'invalid' });
		});
	});

	test('eligibility is checked again after signing, before the letter and owned payment registration are returned', async () => {
		await withFixtures(async (f) => {
			const person = await f.participant();
			const event = await f.event();
			await f.service.submitWaiver(person.account.id, waiverForm(event, person.student));
			const before = await f.registration(person, event);
			await f.db.update(students).set({ isActive: false }).where(eq(students.id, person.student.id));
			await expect(f.service.submitLetter(person.account.id, letterForm(event))).rejects.toMatchObject({ code: 'ineligible' });
			await expect(f.service.ownedRegistration(person.account.id, event.id)).rejects.toMatchObject({ code: 'ineligible' });
			expect(await f.service.ownedRegistration(person.account.id, event.id, false)).toEqual(before);
			expect(await f.registration(person, event)).toEqual(before);
		});
	});

	test('closed deadlines block every registration mutation, including already-started registrations', async () => {
		await withFixtures(async (f) => {
			const person = await f.participant();
			const event = await f.event();
			await f.service.submitWaiver(person.account.id, waiverForm(event, person.student));
			const before = await f.registration(person, event);
			await f.db.update(events).set({ registrationClosesAt: new Date(Date.now() - 1000) }).where(eq(events.id, event.id));
			await expect(f.service.start(person.account.id, event.id)).rejects.toMatchObject({ code: 'closed' });
			await expect(f.service.preview(person.account.id, waiverForm(event, person.student))).rejects.toMatchObject({ code: 'closed' });
			await expect(f.service.submitWaiver(person.account.id, waiverForm(event, person.student))).rejects.toMatchObject({ code: 'closed' });
			await expect(f.service.submitLetter(person.account.id, letterForm(event))).rejects.toMatchObject({ code: 'closed' });
			expect(await f.registration(person, event)).toEqual(before);
		});
	});

	test('activation creates standard Spanish legal without approval and ignores forged IDs and legal fields', async () => {
		await withFixtures(async (f) => {
			const existing = await f.event();
			const details = eventForm();
			details.delete('legalSource');
			details.delete('legalApproved');
			const created = await f.createEvent(details, true);
			expect(created.id).not.toBe(existing.id);
			expect(created).toMatchObject({ revision: 1, legalApproved: false, approvedBy: null, registrationOpen: false, createdBy: f.admin.id });
			expect(created.legal.en).toEqual(created.legal.es);
			for (const key of sectionKeys) expect(created.legal.es[key].length).toBeGreaterThan(100);
			const forged = eventForm({ id: existing.id, revision: String(existing.revision), legalSource: 'custom', legalApproved: 'true',
				registrationOpen: 'true', approvedBy: f.admin.id, startsAt: existing.startsAt.toISOString(), arrivalAt: 'forged' });
			for (const language of ['en', 'es']) for (const key of sectionKeys) forged.set(`legal_${language}_${key}`, 'Forged legal text');
			const activated = await f.createEvent(forged, true);
			expect(activated.id).not.toBe(existing.id);
			expect(activated.id).not.toBe(created.id);
			expect(activated).toMatchObject({ revision: 1, legalApproved: false, approvedBy: null, registrationOpen: false, legal: created.legal });
			expect((await f.db.select().from(events).where(eq(events.id, existing.id)))[0]).toEqual(existing);
			await expect(toggleEvent(f.db, form({ eventId: activated.id, revision: '1', open: 'true' }), true))
				.rejects.toMatchObject({ code: 'unavailable' });
			await saveEvent(f.db, f.admin.id, eventForm({ id: activated.id, revision: '1', legalApproved: 'true' }), activated.id);
			expect(await getEvent(f.db, activated.id)).toMatchObject({ id: activated.id, revision: 2, legalApproved: true });
		});
	});

	test('route-scoped edits reject forged or missing IDs and keep optimistic revision protection', async () => {
		await withFixtures(async (f) => {
			const event = await f.event();
			const other = await f.event();
			for (const submittedId of [other.id, '', 'invalid', randomUUID()]) {
				await expect(saveEvent(f.db, f.admin.id, eventForm({ id: submittedId, revision: '1' }), event.id))
					.rejects.toMatchObject({ code: 'invalid' });
			}
			await expect(saveEvent(f.db, f.admin.id, eventForm({ revision: '1' }), event.id)).rejects.toMatchObject({ code: 'invalid' });
			expect((await f.db.select().from(events).where(eq(events.id, event.id)))[0]).toEqual(event);
			expect((await f.db.select().from(events).where(eq(events.id, other.id)))[0]).toEqual(other);
			const edit = eventForm({ id: event.id, revision: '1' });
			expect(await saveEvent(f.db, f.admin.id, edit, event.id)).toBe(event.id);
			await expect(saveEvent(f.db, f.admin.id, edit, event.id)).rejects.toMatchObject({ code: 'stale' });
			expect(await getEvent(f.db, event.id)).toMatchObject({ revision: 2, registrationOpen: false });
		});
	});

	test('admin event list and lookup return event views without a roster or a fallback event', async () => {
		await withFixtures(async (f) => {
			const first = await f.event();
			const latest = await f.event({ startsAt: new Date(first.startsAt.getTime() + day), endsAt: new Date(first.endsAt.getTime() + day) });
			const listed = (await listEvents(f.db)).filter((event) => [first.id, latest.id].includes(event.id));
			expect(listed).toEqual([eventView(latest), eventView(first)]);
			expect(await getEvent(f.db, first.id)).toEqual(eventView(first));
			for (const eventId of [null, undefined, '', 'invalid', randomUUID()]) expect(await getEvent(f.db, eventId)).toBeNull();
		});
	});

	test('admin standard saves persist derived dates, ignore forged timestamps and regenerate Spanish without legal inputs', async () => {
		await withFixtures(async (f) => {
			const input = eventForm({ legalApproved: 'false', startsAt: '2030-01-01T08:00', endsAt: '2030-01-03T16:00',
				arrivalAt: 'not a date', registrationClosesAt: '2030-01-01T08:00' });
			const inputDate = input.get('eventDate') as string;
			expect([...input.keys()].some((key) => key.startsWith('legal_'))).toBe(false);
			const event = await f.createEvent(input);
			expect(event).toMatchObject({ revision: 1, registrationOpen: false, legalApproved: false,
				approvedBy: null, createdBy: f.admin.id,
				startsAt: new Date(`${inputDate}T12:00:00.000Z`), endsAt: new Date(`${inputDate}T20:00:00.000Z`),
				arrivalAt: new Date(`${inputDate}T11:00:00.000Z`), registrationClosesAt: new Date(`${inputDate}T00:00:00.000Z`) });
			expect(event.legal.en).toEqual(event.legal.es);
			for (const section of sectionKeys) {
				expect(event.legal.es[section].length).toBeGreaterThan(100);
				expect(event.legal.es[section]).not.toMatch(/\{\w+\}/);
			}
			for (const value of [event.venue, '$30.00', '$15.00', 'El registro comienza a las 07:00:00.',
				'No se aceptarán estudiantes después de las 08:00:00.']) expect(event.legal.es.agreement).toContain(value);
			await expect(toggleEvent(f.db, form({ eventId: event.id, revision: '1', open: 'true' }), true))
				.rejects.toMatchObject({ code: 'unavailable' });
			const date = signingDate(new Date(event.startsAt.getTime() + 2 * day));
			const edit = eventForm({ id: event.id, revision: '1', venue: 'Cancha Nueva de Ponce',
				eventDate: date, startTime: '13:15', endTime: '18:00',
				startsAt: event.startsAt.toISOString(), endsAt: event.endsAt.toISOString(),
				arrivalAt: event.arrivalAt.toISOString(), registrationClosesAt: event.registrationClosesAt.toISOString() });
			for (const language of ['en', 'es']) for (const section of sectionKeys) {
				edit.set(`legal_${language}_${section}`, 'Tampered browser clauses 🖊');
			}
			expect(await saveEvent(f.db, f.admin.id, edit)).toBe(event.id);
			const [saved] = await f.db.select().from(events).where(eq(events.id, event.id));
			expect(saved).toMatchObject({ revision: 2, registrationOpen: false, legalApproved: true,
				approvedBy: f.admin.id, venue: 'Cancha Nueva de Ponce',
				startsAt: new Date(`${date}T13:15:00-04:00`), endsAt: new Date(`${date}T18:00:00-04:00`),
				arrivalAt: new Date(`${date}T12:15:00-04:00`), registrationClosesAt: new Date(`${date}T01:15:00-04:00`) });
			expect(saved.legal.en).toEqual(saved.legal.es);
			const eventDate = new Intl.DateTimeFormat('es-PR', { timeZone: 'America/Puerto_Rico', dateStyle: 'long' }).format(saved.startsAt);
			for (const section of ['agreement', 'liability'] as const) {
				expect(saved.legal.es[section]).toContain(saved.venue);
				expect(saved.legal.es[section]).toContain(eventDate);
				expect(saved.legal.es[section]).not.toContain(event.venue);
				expect(saved.legal.es[section]).not.toContain('Tampered');
				expect(saved.legal.es[section]).not.toBe(event.legal.es[section]);
			}
			expect(saved.legal.es.agreement).toContain('El registro comienza a las 12:15:00.');
			expect(saved.legal.es.agreement).toContain('No se aceptarán estudiantes después de las 13:15:00.');
			expect(saved.legal.es.media).toBe(event.legal.es.media);
			await expect(saveEvent(f.db, f.admin.id, edit)).rejects.toMatchObject({ code: 'stale' });
		});
	});

	test('derived schedules and standard clauses reach snapshots/PDFs; rescheduling preserves signed waivers and letters', async () => {
		await withFixtures(async (f) => {
			const inputDate = signingDate(new Date(Date.now() + 10 * day));
			const previousDate = signingDate(new Date(Date.parse(`${inputDate}T00:00:00-04:00`) - day));
			const event = await f.createEvent(eventForm({ eventDate: inputDate, startTime: '00:30', endTime: '08:00' }));
			expect(event).toMatchObject({
				startsAt: new Date(`${inputDate}T00:30:00-04:00`), endsAt: new Date(`${inputDate}T08:00:00-04:00`),
				arrivalAt: new Date(`${previousDate}T23:30:00-04:00`), registrationClosesAt: new Date(`${previousDate}T12:30:00-04:00`)
			});
			await toggleEvent(f.db, form({ eventId: event.id, revision: '1', open: 'true' }), true);
			const person = await f.participant();
			const displayed = (await studentPage(f.db, person.account.id, false)).events.find((row) => row.id === event.id)!;
			expect(displayed.legal).toEqual(event.legal);
			const service = createRegistrationService(f.db, undefined, previewSecret);
			const input = waiverForm(event, person.student);
			const preview = await service.previewDocument(person.account.id, input);
			input.set('previewToken', preview.token);
			const documentId = await service.submitWaiver(person.account.id, input);
			const saved = await f.document(documentId);
			const snapshot = saved.snapshot as WaiverSnapshot;
			expect(saved).toMatchObject({ language: 'es', kind: 'waiver', sha256: sha256(preview.pdf) });
			expect(snapshot.language).toBe('es');
			expect(snapshot.event).toMatchObject({ revision: 1,
				startsAt: event.startsAt.toISOString(), endsAt: event.endsAt.toISOString(),
				arrivalAt: event.arrivalAt.toISOString(), registrationClosesAt: event.registrationClosesAt.toISOString() });
			expect(snapshot.event.legal).toEqual(displayed.legal);
			expect(saved.pdf).toEqual(preview.pdf);
			expect(saved.pdf.toString('latin1')).toContain('/Lang (es)');
			expect(pdfLegalText(saved.pdf)).toBe(sectionKeys.map((key) => displayed.legal.es[key].replace(/\r\n|\r|\n/g, '')).join(''));
			expect(saved.pdf).toEqual(await renderWaiverPdf(snapshot));
			const letterId = await service.submitLetter(person.account.id, letterForm(event));
			const letter = await f.document(letterId!);
			expect(letter.snapshot.event).toEqual(snapshot.event);
			const date = signingDate(new Date(event.startsAt.getTime() + 2 * day));
			const edit = eventForm({ id: event.id, revision: '1', venue: 'Cancha Nueva de Ponce',
				eventDate: date, startTime: '13:15', endTime: '18:00' });
			await saveEvent(f.db, f.admin.id, edit);
			const [current] = await f.db.select().from(events).where(eq(events.id, event.id));
			expect(current).toMatchObject({ revision: 2, registrationOpen: false,
				startsAt: new Date(`${date}T13:15:00-04:00`), endsAt: new Date(`${date}T18:00:00-04:00`),
				arrivalAt: new Date(`${date}T12:15:00-04:00`), registrationClosesAt: new Date(`${date}T01:15:00-04:00`) });
			expect(current.legal.es.agreement).not.toBe(snapshot.event.legal.es.agreement);
			expect(current.legal.es.liability).not.toBe(snapshot.event.legal.es.liability);
			expect(await f.document(documentId)).toEqual(saved);
			expect((await f.registration(person, event)).waiver).toEqual(snapshot);
			expect((await documentForViewer(f.db, documentId, { id: person.account.id, role: 'student' }))?.pdf).toEqual(preview.pdf);
			expect(await renderWaiverPdf(snapshot)).toEqual(preview.pdf);
			expect(await f.document(letterId!)).toEqual(letter);
			expect(await renderLetterPdf(letter.snapshot as LetterSnapshot)).toEqual(letter.pdf);
			await toggleEvent(f.db, form({ eventId: event.id, revision: '2', open: 'true' }), true);
			const nextPerson = await f.participant();
			const nextId = await service.submitWaiver(nextPerson.account.id, waiverForm(current, nextPerson.student));
			const next = await f.document(nextId);
			expect(next.language).toBe('es');
			expect(next.snapshot.event).toMatchObject({ revision: 2,
				startsAt: current.startsAt.toISOString(), endsAt: current.endsAt.toISOString(),
				arrivalAt: current.arrivalAt.toISOString(), registrationClosesAt: current.registrationClosesAt.toISOString() });
			expect(next.snapshot.event.legal).toEqual(current.legal);
			expect(pdfLegalText(next.pdf)).toBe(sectionKeys.map((key) => current.legal.es[key].replace(/\r\n|\r|\n/g, '')).join(''));
			expect(await f.document(documentId)).toEqual(saved);
		});
	});

	for (const language of ['en', 'es'] as const) {
		test(`an optional ${language} employer letter remains available after a Spanish-only waiver`, async () => {
			await withFixtures(async (f) => {
				const event = await f.event();
				const person = await f.participant();
				const waiverId = await f.service.submitWaiver(person.account.id, waiverForm(event, person.student));
				const waiver = await f.document(waiverId);
				const letterId = await f.service.submitLetter(person.account.id, letterForm(event, { language }));
				const letter = await f.document(letterId!);
				expect(letter).toMatchObject({ kind: 'letter', language });
				expect(letter.snapshot.language).toBe(language);
				expect(letter.pdf.toString('latin1')).toContain(`/Lang (${language})`);
				expect(letter.pdf).toEqual(await renderLetterPdf(letter.snapshot as LetterSnapshot));
				expect(await f.document(waiverId)).toEqual(waiver);
			});
		});
	}

	test('admin custom saves copy Spanish into both slots, preserve manual clauses, enforce approval/readiness and reject stale edits', async () => {
		await withFixtures(async (f) => {
			const event = await f.event({ registrationOpen: false });
			const date = signingDate(new Date(event.startsAt.getTime() + day));
			const values: Record<string, string> = { id: event.id, revision: '1', title: 'Evento Ficticio Editado',
				venue: 'Cancha Nueva', legalSource: 'custom', legalApproved: 'false',
				eventDate: date, startTime: '08:00', endTime: '16:00' };
			for (const section of sectionKeys) values[`legal_es_${section}`] = ` \n${event.legal.es[section].normalize('NFD')}\n `;
			expect(await saveEvent(f.db, f.admin.id, form(values))).toBe(event.id);
			const [saved] = await f.db.select().from(events).where(eq(events.id, event.id));
			expect(saved).toMatchObject({ revision: 2, registrationOpen: false, legalApproved: false, approvedBy: null,
				startsAt: new Date(`${date}T12:00:00.000Z`), endsAt: new Date(`${date}T20:00:00.000Z`),
				arrivalAt: new Date(`${date}T11:00:00.000Z`), registrationClosesAt: new Date(`${date}T00:00:00.000Z`),
				legal: { en: event.legal.es, es: event.legal.es } });
			await expect(saveEvent(f.db, f.admin.id, form(values))).rejects.toMatchObject({ code: 'stale' });
			await expect(toggleEvent(f.db, form({ eventId: event.id, revision: '2', open: 'true' }), true)).rejects.toMatchObject({ code: 'unavailable' });
			await saveEvent(f.db, f.admin.id, form({ ...values, revision: '2', legalApproved: 'true' }));
			const open = form({ eventId: event.id, revision: '3', open: 'true' });
			await expect(toggleEvent(f.db, open, false)).rejects.toMatchObject({ code: 'unavailable' });
			await toggleEvent(f.db, open, true);
			const [opened] = await f.db.select().from(events).where(eq(events.id, event.id));
			expect(opened).toMatchObject({ registrationOpen: true, legalApproved: true, approvedBy: f.admin.id });
		});
	});

	test('event report includes active non-starters, every registration stage, and event-local balances only', async () => {
		await withFixtures(async (f) => {
			const event = await f.event();
			const nextEvent = await f.event();
			const people = {
				notStarted: await f.participant(), waiver: await f.participant(), letter: await f.participant(),
				payment: await f.participant(), deposit: await f.participant(), full: await f.participant(),
				refunded: await f.participant(), inactiveRegistered: await f.participant()
			};
			const underage = await f.student({ dateOfBirth: birthday(20) });
			const unknown = await f.student({ dateOfBirth: null });
			const inactive = await f.student({ isActive: false });
			await f.service.start(people.waiver.account.id, event.id);
			await f.service.start(people.inactiveRegistered.account.id, event.id);
			await f.db.update(students).set({ isActive: false }).where(eq(students.id, people.inactiveRegistered.student.id));
			await f.service.submitWaiver(people.letter.account.id, waiverForm(event, people.letter.student));
			for (const key of ['payment', 'deposit', 'full', 'refunded'] as const) {
				const { registration } = await f.ready(event, people[key]);
				const status = key === 'payment' ? 'uncertain' : key === 'refunded' ? 'refunded' : 'completed';
				await f.db.insert(payments).values({ registrationId: registration.id, amountCents: key === 'deposit' ? 1500 : 3000,
					status, transactionId: status === 'uncertain' ? null : `fictional-receipt-${randomUUID()}` });
			}
			const rows = await eventReport(f.db, event.id);
			const row = (id: string) => rows.find((entry) => entry.studentId === id);
			for (const [key, status, paidCents, remainingCents] of [
				['notStarted', 'not_started', 0, 3000], ['waiver', 'waiver', 0, 3000], ['letter', 'letter', 0, 3000],
				['payment', 'payment', 0, 3000], ['deposit', 'confirmed', 1500, 1500], ['full', 'confirmed', 3000, 0],
				['refunded', 'payment', 0, 3000], ['inactiveRegistered', 'waiver', 0, 3000]
			] as const) expect(row(people[key].student.id)).toMatchObject({ status, paidCents, remainingCents });
			expect(row(underage.id)).toMatchObject({ eligibility: 'underage', status: 'not_started' });
			expect(row(unknown.id)).toMatchObject({ eligibility: 'unknown', status: 'not_started' });
			expect(row(inactive.id)).toBeUndefined();
			expect(row(people.inactiveRegistered.student.id)?.eligibility).toBe('inactive');
			expect(row(people.refunded.student.id)?.paymentStatus).toBe('refunded');
			expect(row(people.deposit.student.id)?.documents).toEqual([expect.objectContaining({ kind: 'waiver', backupStatus: 'pending' })]);
			const next = await eventReport(f.db, nextEvent.id);
			expect(next.some((entry) => entry.studentId === people.inactiveRegistered.student.id)).toBe(false);
			await expect(eventReport(f.db, randomUUID())).rejects.toMatchObject({ code: 'invalid' });
			await expect(eventReport(f.db, 'invalid')).rejects.toMatchObject({ code: 'invalid' });
			expect(next.find((entry) => entry.studentId === people.deposit.student.id)).toMatchObject({ status: 'not_started', paidCents: 0, remainingCents: 3000, documents: [] });
			const { registration } = await f.ready(nextEvent, people.full);
			await f.db.insert(payments).values({ registrationId: registration.id, amountCents: 1500, status: 'completed', transactionId: `fictional-receipt-${randomUUID()}` });
			expect((await eventReport(f.db, nextEvent.id)).find((entry) => entry.studentId === people.full.student.id)).toMatchObject({ paidCents: 1500, remainingCents: 1500 });
			expect((await eventReport(f.db, event.id)).find((entry) => entry.studentId === people.full.student.id)).toMatchObject({ paidCents: 3000, remainingCents: 0 });
			const page = await studentPage(f.db, people.full.account.id, true);
			expect(page.registrations.find((entry) => entry.eventId === event.id)?.paidCents).toBe(3000);
			expect(page.registrations.find((entry) => entry.eventId === nextEvent.id)?.paidCents).toBe(1500);
		});
	});

	test('English and Spanish CSV exports neutralize spreadsheet formulas from real roster rows', async () => {
		await withFixtures(async (f) => {
			const event = await f.event();
			const own: (typeof students.$inferSelect)[] = [];
			for (const firstName of ['=HYPERLINK("https://example.test","fiction")', '+SUM(1,2)', '-1+2', '@SUM(1)', '\t=1+1', '\r\n=2+2']) {
				own.push(await f.student({ firstName, email: `+formula-${randomUUID()}@example.test` }));
			}
			const rows = (await eventReport(f.db, event.id)).filter((row) => own.some((person) => person.id === row.studentId));
			expect(rows).toHaveLength(own.length);
			for (const language of ['en', 'es'] as const) {
				const csv = reportCsv(rows, language);
				expect(csv).toStartWith('\uFEFF');
				expect(csv).toEndWith('\r\n');
				for (const person of own) {
					const escapedName = `${person.firstName} ${person.lastName}`.replaceAll('"', '""');
					expect(csv).toContain(`"'${escapedName}","'${person.email}"`);
				}
				expect(csv).toContain('"0.00","30.00"');
			}
		});
	});

	test('payment requires a saved waiver and letter choice, accepts older signed revisions, but rejects a closed deadline', async () => {
		await withFixtures(async (f) => {
			const person = await f.participant();
			const event = await f.event();
			const registrationId = await f.service.start(person.account.id, event.id);
			let calls = 0;
			const service = createPaymentService(f.db, ath({ async create() {
				calls++;
				return { reference: randomUUID(), authorizationToken: paymentToken };
			} }), paymentKey);
			await expect(service.start(registrationId, 1500, '787-555-0100')).rejects.toMatchObject({ code: 'prerequisites' });
			const waiverId = await f.service.submitWaiver(person.account.id, waiverForm(event, person.student));
			const original = await f.document(waiverId);
			await expect(service.start(registrationId, 1500, '787-555-0100')).rejects.toMatchObject({ code: 'prerequisites' });
			expect(calls).toBe(0);
			await f.service.submitLetter(person.account.id, form({ eventId: event.id, needsLetter: 'false' }));
			await f.db.update(events).set({ revision: event.revision + 1 }).where(eq(events.id, event.id));
			expect(await service.start(registrationId, 1500, '787-555-0100')).toMatchObject({ status: 'pending', amountCents: 1500 });
			expect((await f.registration(person, event)).waiver?.event.revision).toBe(event.revision);
			expect(await f.document(waiverId)).toEqual(original);
			await f.db.update(events).set({ registrationClosesAt: new Date(Date.now() - 1000) }).where(eq(events.id, event.id));
			await expect(service.start(registrationId, 1500, '787-555-0100')).rejects.toMatchObject({ code: 'unavailable' });
			expect(calls).toBe(1);
			expect(await f.db.select().from(payments).where(eq(payments.registrationId, registrationId))).toHaveLength(1);
		});
	});

	test('simultaneous payment starts share one durable attempt and never hold SQL locks across fake ATH creation', async () => {
		await withFixtures(async (f) => {
			const event = await f.event();
			const { registration } = await f.ready(event);
			const entered = gate();
			const release = gate();
			let calls = 0;
			const client = ath({ async create() {
				calls++;
				entered.resolve();
				await release.promise;
				return { reference: randomUUID(), authorizationToken: paymentToken };
			} });
			const first = createPaymentService(f.db, client, paymentKey).start(registration.id, 1500, '787-555-0100');
			const pending: Promise<unknown>[] = [first];
			try {
				await bounded(entered.promise);
				const other = createPaymentService(f.db, client, paymentKey);
				const repeats = Array.from({ length: 4 }, () => other.start(registration.id, 3000, '787-555-0100'));
				pending.push(...repeats);
				const results = await bounded(Promise.all(repeats));
				expect(new Set(results.map((row) => row.attemptId)).size).toBe(1);
				expect(results.every((row) => row.status === 'creating' && row.amountCents === 1500)).toBe(true);
				release.resolve();
				const result = await first;
				expect(result).toMatchObject({ attemptId: results[0].attemptId, status: 'pending', amountCents: 1500 });
				const rows = await f.db.select().from(payments).where(eq(payments.registrationId, registration.id));
				expect(rows).toHaveLength(1);
				expect(calls).toBe(1);
				expect(rows[0].authorizationToken).toStartWith('v1.');
				expect(rows[0].authorizationToken).not.toContain(paymentToken);
				expect(createPaymentTokenVault(paymentKey).open(rows[0].authorizationToken!, { ...rows[0], reference: rows[0].reference! })).toBe(paymentToken);
				expect(JSON.stringify(result)).not.toContain(paymentToken);
			} finally { release.resolve(); await Promise.allSettled(pending); }
		});
	}, 15000);

	test('simultaneous reconciliation leases allow exactly one verified authorization and credit', async () => {
		await withFixtures(async (f) => {
			const event = await f.event();
			const { registration, person } = await f.ready(event);
			const entered = gate();
			const release = gate();
			let verifications = 0;
			const receipt = `fictional-receipt-${randomUUID()}`;
			const client = ath({ async verify(input) {
				verifications++;
				await input.beforeAuthorize!();
				entered.resolve();
				await release.promise;
				return { status: 'completed', transactionId: receipt };
			} });
			const service = createPaymentService(f.db, client, paymentKey);
			const started = await service.start(registration.id, 1500, '787-555-0100');
			const first = service.reconcile(started.attemptId);
			const pending: Promise<unknown>[] = [first];
			try {
				await bounded(entered.promise);
				const second = createPaymentService(f.db, client, paymentKey);
				const repeats = Array.from({ length: 4 }, () => second.reconcile(started.attemptId));
				pending.push(...repeats);
				await bounded(Promise.all(repeats));
				expect(verifications).toBe(1);
				release.resolve();
				expect(await first).toMatchObject({ status: 'completed', amountCents: 1500, uncertain: false });
				const [saved] = await f.db.select().from(payments).where(eq(payments.id, started.attemptId));
				expect(saved).toMatchObject({ status: 'completed', transactionId: receipt, authorizationStarted: true, leaseUntil: null, lastError: null });
				expect((await eventReport(f.db, event.id)).find((row) => row.studentId === person.student.id)).toMatchObject({ paidCents: 1500, remainingCents: 1500 });
			} finally { release.resolve(); await Promise.allSettled(pending); }
		});
	}, 15000);

	test('the real partial unique index arbitrates colliding attempts per registration, but permits cancelled history', async () => {
		await withFixtures(async (f) => {
			const person = await f.participant();
			const event = await f.event();
			const registrationId = await f.service.start(person.account.id, event.id);
			await f.db.insert(payments).values({ registrationId, amountCents: 1500, status: 'cancelled' });
			const results = await Promise.allSettled(Array.from({ length: 4 }, () =>
				f.db.insert(payments).values({ registrationId, amountCents: 1500, status: 'creating' }).returning()
			));
			expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
			const failures = results.filter((result) => result.status === 'rejected');
			expect(failures).toHaveLength(3);
			for (const failure of failures) expect(postgresError(failure.reason)).toMatchObject({ code: '23505', constraint_name: 'bootcamp_payment_active_registration' });
			expect(await f.db.select().from(payments).where(eq(payments.registrationId, registrationId))).toHaveLength(2);
		});
	});

	test('two registrations cannot claim the same provider transaction: one credits, the other stays uncertain', async () => {
		await withFixtures(async (f) => {
			const event = await f.event();
			const first = await f.ready(event);
			const second = await f.ready(event);
			const receipt = `fictional-shared-receipt-${randomUUID()}`;
			const service = createPaymentService(f.db, ath({ async verify() { return { status: 'completed', transactionId: receipt }; } }), paymentKey);
			const starts = await concurrent([first, second].map(({ registration }) => service.start(registration.id, 1500, '787-555-0100')));
			const results = await concurrent(starts.map((row) => service.reconcile(row.attemptId)));
			expect(results.map((row) => row?.status).sort()).toEqual(['completed', 'uncertain']);
			const saved = await f.db.select().from(payments).where(inArray(payments.id, starts.map((row) => row.attemptId)));
			expect(saved.filter((row) => row.transactionId === receipt)).toHaveLength(1);
			expect(saved.find((row) => row.status === 'uncertain')).toMatchObject({ transactionId: null, lastError: 'transaction_conflict', leaseUntil: null });
			const report = (await eventReport(f.db, event.id)).filter((row) => [first.person.student.id, second.person.student.id].includes(row.studentId));
			expect(report.reduce((sum, row) => sum + row.paidCents, 0)).toBe(1500);
		});
	});

	test('pending, uncertain, completed, and refunded attempts all prevent another purchase for that registration', async () => {
		await withFixtures(async (f) => {
			const event = await f.event();
			let calls = 0;
			const service = createPaymentService(f.db, ath({ async create() { calls++; throw new Error('Must not create another payment'); } }), paymentKey);
			for (const status of ['pending', 'uncertain', 'completed', 'refunded'] as const) {
				const { registration } = await f.ready(event);
				const [existing] = await f.db.insert(payments).values({ registrationId: registration.id, amountCents: 1500,
					status, transactionId: ['completed', 'refunded'].includes(status) ? `fictional-receipt-${randomUUID()}` : null }).returning();
				expect(await service.start(registration.id, 3000, '787-555-0100')).toMatchObject({ attemptId: existing.id, status, amountCents: 1500 });
				const failure = await f.db.insert(payments).values({ registrationId: registration.id, amountCents: 3000 })
					.then(() => null, postgresError);
				expect(failure).toMatchObject({ code: '23505', constraint_name: 'bootcamp_payment_active_registration' });
			}
			expect(calls).toBe(0);
		});
	});

	test('payment schema rejects invalid amounts/statuses and completed or refunded rows without receipts', async () => {
		await withFixtures(async (f) => {
			const person = await f.participant();
			const event = await f.event();
			const registrationId = await f.service.start(person.account.id, event.id);
			for (const [amount, status, constraint] of [
				[1, 'creating', 'bootcamp_payment_amount'], [1500, 'invented', 'bootcamp_payment_status'],
				[1500, 'completed', 'bootcamp_payment_receipt'], [3000, 'refunded', 'bootcamp_payment_receipt']
			] as const) {
				await expect(Promise.resolve(connection.client`
					INSERT INTO bootcamp_payments (registration_id, amount_cents, status)
					VALUES (${registrationId}, ${amount}, ${status})
				`)).rejects.toMatchObject({ code: '23514', constraint_name: constraint });
			}
			expect(await f.db.select().from(payments).where(eq(payments.registrationId, registrationId))).toHaveLength(0);
		});
	});
});
