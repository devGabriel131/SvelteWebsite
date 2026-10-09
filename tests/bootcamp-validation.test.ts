import { defaultLegalText } from '../src/lib/bootcamp/legal';
import { describe, expect, test } from 'bun:test';
import { sectionKeys, type LegalText } from '../src/lib/bootcamp/types';
import { BootcampError, employerFields, eventFields, field, id, languageField, readForm, revisionField } from '../src/lib/server/bootcamp/validation';
import { webhookBody, webhookHints } from '../src/lib/server/bootcamp/webhook';

const attemptId = 'a13e4517-2bc9-4abc-8def-0123456789ab';
const reference = 'b24f5628-3cda-4bcd-9efa-123456789abc';
const languages = ['en', 'es'] as const;
const scheduleKeys = ['eventDate', 'startTime', 'endTime'] as const;
const derivedDateKeys = ['startsAt', 'endsAt', 'arrivalAt', 'registrationClosesAt'] as const;
const spanishLegal = {
	agreement: 'ACUERDO APROBADO  §1: Conservar  estas palabras exactas.\nSegundo párrafo: café — “aprobado”.',
	liability: 'RELEVO APROBADO: No alterar la puntuación; excepciones (a), (b).',
	media: 'IMAGEN APROBADA: Fotografías y vídeo.\n\nPárrafo separado.'
};
const legal: LegalText = { en: spanishLegal, es: spanishLegal };

function form(values: Record<string, string | Blob> = {}): FormData {
	const result = new FormData();
	for (const [key, value] of Object.entries(values)) result.set(key, value);
	return result;
}
function eventForm(overrides: Record<string, string | Blob> = {}): FormData {
	const result = form({
		title: 'Bootcamp de preparación', venue: 'San Juan, Puerto Rico',
		eventDate: '2026-10-10', startTime: '08:00', endTime: '16:00',
		legalApproved: 'true'
	});
	if (overrides.legalSource !== 'standard') for (const section of sectionKeys) result.set(`legal_es_${section}`, legal.es[section]);
	for (const [key, value] of Object.entries(overrides)) result.set(key, value);
	return result;
}
function expectInvalid(run: () => unknown) {
	let caught: unknown;
	try { run(); } catch (error) { caught = error; }
	expect(caught).toBeInstanceOf(BootcampError);
	expect(caught).toMatchObject({ name: 'BootcampError', code: 'invalid', message: 'invalid' });
}
function request(body: BodyInit | null, contentType: string | null, contentLength?: string): Request {
	const headers = new Headers();
	if (contentType !== null) headers.set('content-type', contentType);
	if (contentLength !== undefined) headers.set('content-length', contentLength);
	return new Request('https://example.test/bootcamps', { method: 'POST', headers, body });
}
function streamed(chunks: Uint8Array[], contentType: string, contentLength?: string) {
	let index = 0;
	let cancelled = false;
	const body = new ReadableStream<Uint8Array>({
		pull(controller) {
			if (index === chunks.length) controller.close();
			else controller.enqueue(chunks[index++]);
		},
		cancel() { cancelled = true; }
	}, { highWaterMark: 0 });
	return { request: request(body, contentType, contentLength), body, cancelled: () => cancelled, reads: () => index };
}

test('event publication rejects PDF-unsupported title and venue', () => {
	for (const key of ['title', 'venue', ]) {
		for (const value of ['Non\u2011breaking hyphen', 'Internal\ttab', 'Unsupported 🖊']) {
			expect(() => eventFields(eventForm({ [key]: value }))).toThrow(BootcampError);
			try { eventFields(eventForm({ [key]: value })); } catch (error) { expect(error).toMatchObject({ code: 'unsupportedText' }); }
		}
	}
});

const invalidUuidValues: unknown[] = [
	undefined, null, false, 123, {}, [], [attemptId], new String(attemptId),
	'', 'not-a-uuid', '00000000-0000-0000-0000-000000000000',
	'a13e4517-2bc9-0abc-8def-0123456789ab', 'a13e4517-2bc9-9abc-8def-0123456789ab',
	'a13e4517-2bc9-4abc-7def-0123456789ab', 'a13e4517-2bc9-4abc-cdef-0123456789ab',
	'a13e4517-2bc9-4abc-8def-0123456789ag', attemptId.replaceAll('-', ''),
	`{${attemptId}}`, `urn:uuid:${attemptId}`, ` ${attemptId}`, `${attemptId} `,
	`${attemptId}\n`, `${attemptId}\r`, `${attemptId}\r\n`, `${attemptId}\u2028`, `${attemptId}\u2029`
];

describe('bootcamp scalar and employer fields', () => {
	test('accepts UUID versions 1–8 and RFC variants without rewriting case', () => {
		for (const version of '12345678') for (const variant of '89ab') {
			const value = `a13e4517-2bc9-${version}abc-${variant}def-0123456789ab`;
			expect(id(value)).toBe(value);
			expect(id(value.toUpperCase())).toBe(value.toUpperCase());
		}
	});

	test.each(invalidUuidValues.map((value) => [value]))('rejects a non-UUID identifier %j', (value) => {
		expectInvalid(() => id(value));
	});

	test('trims and NFC-normalizes text without changing case, internal spaces, punctuation, or paragraphs', () => {
		const raw = ' \tMari\u0301a  Mun\u0303oz — “Sí”.\n\nSecond\tparagraph.\r\nFinal. \n';
		const values = form({ name: raw });
		const canonical = 'María  Muñoz — “Sí”.\n\nSecond\tparagraph.\r\nFinal.';
		expect(field(values, 'name')).toBe(canonical);
		expect(field(form({ name: canonical }), 'name')).toBe(canonical);
		expect(values.get('name')).toBe(raw);
	});

	test('rejects absent, blank, File, and forbidden control-character text values', () => {
		expectInvalid(() => field(form(), 'name'));
		for (const value of ['', ' \t\r\n\u00a0', new File(['María'], 'María.txt')]) {
			expectInvalid(() => field(form({ name: value }), 'name'));
		}
		for (const code of [...Array.from({ length: 32 }, (_, index) => index).filter((code) => ![9, 10, 13].includes(code)), 127]) {
			for (const value of [`${String.fromCharCode(code)}María`, `Ma${String.fromCharCode(code)}ría`, `María${String.fromCharCode(code)}`]) {
				expectInvalid(() => field(form({ name: value }), 'name'));
			}
		}
	});

	test('enforces default and explicit text bounds before trimming or normalization, without truncation', () => {
		expect(field(form({ name: 'x'.repeat(200) }), 'name')).toBe('x'.repeat(200));
		expectInvalid(() => field(form({ name: 'x'.repeat(201) }), 'name'));
		expect(field(form({ name: 'café' }), 'name', 4)).toBe('café');
		for (const value of [' café', 'cafe\u0301', 'cafés']) expectInvalid(() => field(form({ name: value }), 'name', 4));
	});

	test('requires exact en/es language choices, including when given uploaded files', () => {
		for (const value of languages) expect(languageField(form({ language: value }))).toBe(value);
		expectInvalid(() => languageField(form()));
		for (const value of ['', 'EN', 'ES', 'es-PR', 'en-US', ' en', 'es\n', 'fr', new File(['en'], 'en')]) {
			expectInvalid(() => languageField(form({ language: value })));
		}
	});

	test('accepts positive safe integer revisions and rejects missing, fractional, unsafe, or File revisions', () => {
		for (const value of [1, 2, 42, Number.MAX_SAFE_INTEGER]) expect(revisionField(form({ revision: String(value) }))).toBe(value);
		expectInvalid(() => revisionField(form()));
		for (const value of ['', ' ', '0', '-1', '1.5', 'NaN', 'Infinity', '-Infinity', '9007199254740992', '1e100', '1abc', new File(['1'], '1')]) {
			expectInvalid(() => revisionField(form({ revision: value })));
		}
	});

	test('returns only the four canonical employer fields', () => {
		expect(employerFields(form({
			employer: '  Compan\u0303i\u0301a del Caribe ', contact: ' Mari\u0301a Rivera ',
			position: '  Supervisora  de personal ', workplace: '  Oficina de San Juan ',
			status: 'confirmed', studentId: attemptId
		}))).toEqual({ employer: 'Compañía del Caribe', contact: 'María Rivera', position: 'Supervisora  de personal', workplace: 'Oficina de San Juan' });
	});

	for (const key of ['employer', 'contact', 'position', 'workplace']) {
		test(`employer ${key} is required, bounded, and cannot be supplied as a File`, () => {
			const values = form({ employer: 'Company', contact: 'María', position: 'Supervisor', workplace: 'San Juan' });
			values.delete(key);
			expectInvalid(() => employerFields(values));
			values.set(key, 'x'.repeat(200));
			expect(employerFields(values)).toHaveProperty(key, 'x'.repeat(200));
			for (const value of ['', ' ', 'x'.repeat(201), new File(['valid'], 'valid.txt')]) {
				values.set(key, value);
				expectInvalid(() => employerFields(values));
			}
		});
	}
});

describe('one-day event schedules and standard legal text', () => {
	test('derives the four canonical UTC dates solely from the Puerto Rico date and minute-precision times', () => {
		expect(eventFields(eventForm())).toEqual({
			title: 'Bootcamp de preparación', venue: 'San Juan, Puerto Rico',
			startsAt: new Date('2026-10-10T12:00:00.000Z'), endsAt: new Date('2026-10-10T20:00:00.000Z'),
			arrivalAt: new Date('2026-10-10T11:00:00.000Z'), registrationClosesAt: new Date('2026-10-10T00:00:00.000Z'),
			legal: defaultLegalText({ venue: 'San Juan, Puerto Rico', startsAt: new Date('2026-10-10T12:00:00Z'), endsAt: new Date('2026-10-10T20:00:00Z'), arrivalAt: new Date('2026-10-10T11:00:00Z') })
		});
	});

	test.each([
		['2027-01-01', '2026-12-31'], ['2026-03-01', '2026-02-28'], ['2024-03-01', '2024-02-29']
	])('derives prior-day check-in and registration closure for %s without calendar truncation', (eventDate, previousDate) => {
		expect(eventFields(eventForm({ eventDate, startTime: '00:30', endTime: '08:00' }))).toMatchObject({
			startsAt: new Date(`${eventDate}T00:30:00-04:00`), endsAt: new Date(`${eventDate}T08:00:00-04:00`),
			arrivalAt: new Date(`${previousDate}T23:30:00-04:00`), registrationClosesAt: new Date(`${previousDate}T12:30:00-04:00`)
		});
	});

	for (const key of scheduleKeys) {
		test(`${key} is required canonical text, never a missing, blank or uploaded value`, () => {
			const missing = eventForm();
			missing.delete(key);
			expectInvalid(() => eventFields(missing));
			const valid = String(eventForm().get(key));
			for (const value of ['', ' ', ` ${valid}`, `${valid} `, `${valid}\n`, `${valid}\0`, new File([valid], 'schedule.txt')]) {
				expectInvalid(() => eventFields(eventForm({ [key]: value })));
			}
		});
	}

	test.each([
		'1900-02-29', '2026-02-29', '2024-02-30', '2026-04-31', '2026-00-10', '2026-13-10',
		'2026-10-00', '2026-10-32', '2026-1-10', '2026-10-1', '2026/10/10', '10/10/2026',
		'2026-10-10T08:00', '2026-10-10Z'
	])('rejects noncanonical or impossible event date %j', (eventDate) => {
		expectInvalid(() => eventFields(eventForm({ eventDate })));
	});

	test.each([
		'8:00', '08:0', '24:00', '12:60', '08:00 AM', '08:00:00', '08:00:01', '08:00:00.001',
		'08:00Z', '08:00-04:00', '2026-10-10T08:00'
	])('rejects invalid minute-precision time %j in either field', (value) => {
		for (const key of ['startTime', 'endTime']) {
			expectInvalid(() => eventFields(eventForm({ startTime: '00:00', endTime: '23:59', [key]: value })));
		}
	});

	test('requires a strictly later end on the same Puerto Rico date, not an overnight rollover', () => {
		expect(eventFields(eventForm({ endTime: '08:01' })).endsAt.toISOString()).toBe('2026-10-10T12:01:00.000Z');
		for (const [startTime, endTime] of [['08:00', '08:00'], ['08:00', '07:59'], ['23:00', '01:00'], ['23:59', '00:00']]) {
			expectInvalid(() => eventFields(eventForm({ startTime, endTime })));
		}
	});

	for (const legalSource of ['standard', 'custom']) {
		test(`${legalSource} ignores all forged derived fields, including a multi-day end and invalid uploads`, () => {
			const expected = eventFields(eventForm({ legalSource }));
			const forged = eventForm({ legalSource, startsAt: '2030-01-01T08:00', endsAt: '2030-01-03T16:00',
				arrivalAt: '2030-01-01T08:00', registrationClosesAt: '2030-01-01T08:00' });
			const before = [...forged.entries()];
			expect(eventFields(forged)).toEqual(expected);
			expect([...forged.entries()]).toEqual(before);
			for (const value of ['', 'not a date', 'invalid\0', 'x'.repeat(30001), new File(['forged'], 'date.txt')]) {
				for (const key of derivedDateKeys) forged.set(key, value);
				expect(eventFields(forged)).toEqual(expected);
			}
		});

		test(`${legalSource} never falls back to the old four-timestamp contract`, () => {
			const input = eventForm({ legalSource, startsAt: '2026-10-10T08:00', endsAt: '2026-10-10T16:00',
				arrivalAt: '2026-10-10T07:00', registrationClosesAt: '2026-10-09T20:00' });
			for (const key of scheduleKeys) {
				const value = input.get(key)!;
				input.delete(key);
				expectInvalid(() => eventFields(input));
				input.set(key, 'invalid');
				expectInvalid(() => eventFields(input));
				input.set(key, value);
			}
			for (const key of scheduleKeys) input.delete(key);
			expectInvalid(() => eventFields(input));
		});
	}

	test('all browser legal and approval fields are ignored', () => {
		const expected = eventFields(eventForm({ legalSource: 'standard' }));
		for (const legalSource of ['custom', 'unknown', new File(['custom'], 'source')]) {
			const input = eventForm({ legalSource, legalApproved: 'true', legal_es_agreement: 'Forged 🖊' });
			expect(eventFields(input)).toEqual(expected);
			expect(eventFields(input)).not.toHaveProperty('legalApproved');
		}
	});

	test('standard source needs no manual legal fields and generates Spanish from canonical event fields', () => {
		const input = eventForm({ legalSource: 'standard', venue: '  An\u0303asco ',
			eventDate: '2027-02-11', startTime: '22:03', endTime: '23:30' });
		expect([...input.keys()].some((key) => key.startsWith('legal_'))).toBe(false);
		const before = [...input.entries()];
		const saved = eventFields(input);
		expect(saved.legal.en).toEqual(saved.legal.es);
		for (const value of ['Añasco', '11 de febrero de 2027', '21:03:00', '22:03:00', '$30.00', '$15.00']) {
			expect(saved.legal.es.agreement).toContain(value);
		}
		expect(Object.values(saved.legal.es).join('\n')).not.toMatch(/\{\w+\}/);
		expect([...input.entries()]).toEqual(before);
	});

	test.each([
		['2027-01-01', '1 de enero de 2027', '31 de diciembre de 2026'],
		['2024-03-01', '1 de marzo de 2024', '29 de febrero de 2024']
	])('standard legal text for %s includes the actual previous-date check-in, not the registration deadline', (eventDate, eventLabel, arrivalLabel) => {
		const saved = eventFields(eventForm({ legalSource: 'standard', eventDate, startTime: '00:30', endTime: '08:00' }));
		expect(saved.legal.es.agreement).toContain(`Fecha del Evento\n${eventLabel}, en`);
		expect(saved.legal.es.agreement).toContain(`El registro comienza a las 23:30:00 (${arrivalLabel}).`);
		expect(saved.legal.es.agreement).toContain('No se aceptarán estudiantes después de las 00:30:00.');
		expect(saved.legal.es.agreement).not.toContain('12:30:00');
		expect(saved.legal.en).toEqual(saved.legal.es);
	});

	test('standard source ignores tampered submitted clauses rather than validating or storing them', () => {
		const expected = eventFields(eventForm({ legalSource: 'standard' })).legal;
		for (const value of ['', 'Injected English terms', 'No válido\0🖊', 'x'.repeat(30001), new File(['Texto'], 'legal.txt')]) {
			const input = eventForm({ legalSource: 'standard' });
			for (const language of languages) for (const section of sectionKeys) input.set(`legal_${language}_${section}`, value);
			expect(eventFields(input).legal).toEqual(expected);
		}
	});

	test('standard edits regenerate dates, check-in, latest arrival and venue without mutating old text', () => {
		const original = eventFields(eventForm({ legalSource: 'standard' }));
		const before = structuredClone(original);
		const input = eventForm({ legalSource: 'standard', venue: 'Cancha Nueva de Ponce',
			eventDate: '2027-02-12', startTime: '13:15', endTime: '18:00' });
		for (const section of sectionKeys) input.set(`legal_es_${section}`, original.legal.es[section]);
		const saved = eventFields(input);
		expect(saved.legal.en).toEqual(saved.legal.es);
		expect(saved.legal.es.agreement).toContain('Fecha del Evento\n12 de febrero de 2027, en');
		for (const value of ['Cancha Nueva de Ponce', 'El registro comienza a las 12:15:00.',
			'No se aceptarán estudiantes después de las 13:15:00.']) expect(saved.legal.es.agreement).toContain(value);
		for (const section of ['agreement', 'liability'] as const) {
			expect(saved.legal.es[section]).not.toContain('San Juan, Puerto Rico');
			expect(saved.legal.es[section]).not.toContain('10 de octubre de 2026');
		}
		expect(original).toEqual(before);
	});

	test('legacy custom submissions cannot override regenerated standard clauses', () => {
		const input = eventForm({ legalSource: 'custom', venue: 'Cancha Nueva de Ponce',
			eventDate: '2027-02-12', startTime: '13:15', endTime: '18:00',
			legal_es_agreement: 'Acuerdo  especial: 1 de agosto de 2026, {venue}.\nSin sustituciones.' });
		const saved = eventFields(input);
		expect(saved.legal.es.agreement).not.toBe(input.get('legal_es_agreement') as string);
		expect(saved.legal.es.agreement).toContain('Cancha Nueva de Ponce');
		expect(saved.legal.es.agreement).toContain('12 de febrero de 2027');
		expect(saved.legal.es.agreement).not.toContain('{venue}');
		expect(saved.legal.en).toEqual(saved.legal.es);
	});

	test('event fields still enforce chronology, required fields and PDF-safe dynamic venue', () => {
		for (const key of ['title', 'venue', ...scheduleKeys]) {
			const input = eventForm({ legalSource: 'standard' });
			input.delete(key);
			expectInvalid(() => eventFields(input));
		}
		for (const [key, value] of [['endTime', '08:00'], ['endTime', '07:59'], ['startTime', '23:00'],
			['startTime', '08:00:01'], ['endTime', '16:00:00'], ['eventDate', '2026-02-30']]) {
			expectInvalid(() => eventFields(eventForm({ legalSource: 'standard', [key]: value })));
		}
		for (const key of ['title', 'venue']) for (const value of ['Cancha 🖊', 'Cancha\u2011Nueva', 'Cancha\tNueva']) {
			expect(() => eventFields(eventForm({ legalSource: 'standard', [key]: value }))).toThrow('unsupportedText');
		}

	});

	for (const [key, limit] of [['title', 200], ['venue', 300]] as const) {
		test(`${key} is required and bounded, and rejects uploaded files`, () => {
			const missing = eventForm();
			missing.delete(key);
			expectInvalid(() => eventFields(missing));
			expect(eventFields(eventForm({ [key]: 'x'.repeat(limit) }))[key]).toBe('x'.repeat(limit));
			for (const value of ['', ' ', 'x'.repeat(limit + 1), new File(['valid'], 'valid.txt')]) {
				expectInvalid(() => eventFields(eventForm({ [key]: value })));
			}
		});
	}

});

describe('bounded form request parsing', () => {
	const contentType = 'application/x-www-form-urlencoded';

	test('accepts exact actual-byte limits regardless of absent or dishonest Content-Length', async () => {
		const bytes = Buffer.from('name=María&revision=2');
		for (const length of [undefined, '0', '1', String(bytes.length), '999999999']) {
			const input = streamed([bytes.subarray(0, 8), bytes.subarray(8)], contentType, length);
			const parsed = await readForm(input.request, bytes.length);
			expect(parsed.get('name')).toBe('María');
			expect(revisionField(parsed)).toBe(2);
			expect(input.body.locked).toBe(false);
			expect(input.cancelled()).toBe(false);
		}
	});

	test('counts accumulated UTF-8 bytes, cancels overflow, and never reads the remaining body', async () => {
		const bytes = Buffer.from('name=éééé');
		expect(bytes.length).toBeGreaterThan('name=éééé'.length);
		for (const length of [undefined, '0', '1', String(bytes.length - 1)]) {
			const input = streamed([bytes.subarray(0, 5), bytes.subarray(5), Buffer.from('&unread=true')], contentType, length);
			await expect(readForm(input.request, bytes.length - 1)).rejects.toMatchObject({ name: 'BootcampError', code: 'invalid' });
			expect(input.cancelled()).toBe(true);
			expect(input.reads()).toBe(2);
			expect(input.body.locked).toBe(false);
		}
	});

	test('enforces the default 2,300,000-byte bound rather than trusting a small header', async () => {
		const exact = Buffer.from(`name=${'x'.repeat(2_300_000 - 5)}`);
		expect((await readForm(request(exact, contentType, '1'))).get('name')).toBe('x'.repeat(2_300_000 - 5));
		await expect(readForm(request(Buffer.concat([exact, Buffer.from('x')]), contentType, '1'))).rejects.toMatchObject({ code: 'invalid' });
	});

	test('parses real multipart forms, preserves File values, and rejects them in scalar validation', async () => {
		const input = form({ name: 'Mari\u0301a', revision: new File(['1'], '1'), language: new File(['en'], 'en'), eventId: new File([attemptId], 'event.txt') });
		const original = new Request('https://example.test/bootcamps', { method: 'POST', body: input });
		const type = original.headers.get('content-type')!;
		const bytes = new Uint8Array(await original.arrayBuffer());
		const parsed = await readForm(request(bytes, type, '1'), bytes.length);
		expect(field(parsed, 'name')).toBe('María');
		for (const key of ['revision', 'language', 'eventId']) expect(parsed.get(key)).toBeInstanceOf(File);
		expectInvalid(() => field(parsed, 'revision'));
		expectInvalid(() => revisionField(parsed));
		expectInvalid(() => languageField(parsed));
		expectInvalid(() => id(parsed.get('eventId')));
		await expect(readForm(request(bytes, type, '1'), bytes.length - 1)).rejects.toMatchObject({ code: 'invalid' });
	});

	test('accepts supported content types with charset parameters and preserves repeated fields', async () => {
		const parsed = await readForm(request('name=Ana&name=Mar%C3%ADa', `${contentType}; charset=UTF-8`));
		expect(parsed.getAll('name')).toEqual(['Ana', 'María']);
	});

	test('rejects unsupported/missing types, absent bodies, and malformed multipart data with safe errors', async () => {
		for (const type of [null, 'text/plain', 'application/json', 'application/x-www-form-urlencoded-extra']) {
			await expect(readForm(request(Buffer.from('name=Ana'), type))).rejects.toMatchObject({ name: 'BootcampError', code: 'invalid', message: 'invalid' });
		}
		await expect(readForm(request(null, contentType))).rejects.toMatchObject({ code: 'invalid' });
		for (const type of ['multipart/form-data', 'multipart/form-data; boundary=missing']) {
			await expect(readForm(request('not a multipart body', type))).rejects.toMatchObject({ name: 'BootcampError', code: 'invalid', message: 'invalid' });
		}
	});

	test('sanitizes stream failures and releases the reader lock', async () => {
		const body = new ReadableStream<Uint8Array>({ pull(controller) { controller.error(new Error('private transport detail')); } });
		await expect(readForm(request(body, contentType))).rejects.toMatchObject({ name: 'BootcampError', code: 'invalid', message: 'invalid' });
		expect(body.locked).toBe(false);
	});

	test('keeps form/webhook failure policies and unlocks readers when overflow cancellation rejects', async () => {
		for (const type of [contentType, 'application/json']) {
			let cancelled = false;
			const body = new ReadableStream<Uint8Array>({
				pull(controller) { controller.enqueue(new Uint8Array(32_769)); },
				cancel() { cancelled = true; throw new Error('private cancellation detail'); }
			}, { highWaterMark: 0 });
			const input = request(body, type);
			if (type === contentType) await expect(readForm(input, 32_768)).rejects.toMatchObject({ name: 'BootcampError', code: 'invalid', message: 'invalid' });
			else expect(await webhookBody(input)).toBeNull();
			expect(cancelled).toBe(true);
			expect(body.locked).toBe(false);
		}
	});
});

describe('untrusted webhook lookup hints', () => {
	test('returns only valid attempt/reference UUIDs, independently and together', () => {
		expect(webhookHints({ transactionType: 'ECOMMERCE', metadata1: attemptId })).toEqual({ attemptId, reference: undefined });
		expect(webhookHints({ transactionType: 'ECOMMERCE', ecommerceId: reference })).toEqual({ attemptId: undefined, reference });
		expect(webhookHints({ transactionType: 'ecommerce', metadata1: attemptId, ecommerceId: reference })).toEqual({ attemptId, reference });
		expect(webhookHints({ transactionType: 'Ecommerce', metadata1: attemptId.toUpperCase() })).toEqual({ attemptId: attemptId.toUpperCase(), reference: undefined });
	});

	test('ignores simulated, refund, and other transaction types even with completed status and valid IDs', () => {
		for (const transactionType of [undefined, null, true, 1, {}, [], '', 'SIMULATED', 'ECOMMERCE_SIMULATED', 'REFUND', 'ECOMMERCE_REFUND', 'PAYMENT', ' ECOMMERCE', 'ECOMMERCE\n']) {
			expect(webhookHints({ transactionType, metadata1: attemptId, ecommerceId: reference, status: 'COMPLETED', total: 30 })).toBeNull();
		}
	});

	test.each(invalidUuidValues.map((value) => [value]))('never returns a malformed UUID hint %j', (value) => {
		expect(webhookHints({ transactionType: 'ECOMMERCE', metadata1: value, ecommerceId: value })).toBeNull();
		expect(webhookHints({ transactionType: 'ECOMMERCE', metadata1: value, ecommerceId: reference })).toEqual({ attemptId: undefined, reference });
		expect(webhookHints({ transactionType: 'ECOMMERCE', metadata1: attemptId, ecommerceId: value })).toEqual({ attemptId, reference: undefined });
	});

	test('does not trust, return, or mutate claimed status, amounts, payer identity, or other metadata', () => {
		for (const status of [undefined, 'COMPLETED', 'CONFIRM', 'CANCEL', 'REFUNDED', true, { completed: true }]) {
			const input = Object.freeze({
				transactionType: 'ECOMMERCE', metadata1: attemptId, ecommerceId: reference,
				status, ecommerceStatus: status, paid: true, total: 30, totalRefundedAmount: 30,
				metadata2: 'untrusted-registration', referenceNumber: 'untrusted-receipt',
				name: 'Untrusted payer', phoneNumber: '7875550100', auth_token: 'untrusted-token'
			});
			expect(webhookHints(input)).toEqual({ attemptId, reference });
			expect(input.status).toEqual(status);
		}
	});

	test('rejects nonobjects, nested wrappers, and alternate IDs rather than treating them as receipts', () => {
		for (const value of [null, undefined, false, 30, 'COMPLETED', [], [{ transactionType: 'ECOMMERCE', metadata1: attemptId }],
			{ data: { transactionType: 'ECOMMERCE', metadata1: attemptId } },
			{ transactionType: 'ECOMMERCE', attemptId, reference, metadata2: attemptId, referenceNumber: reference, status: 'COMPLETED' }]) {
			expect(webhookHints(value)).toBeNull();
		}
	});
});

describe('bounded webhook JSON parsing', () => {
	const contentType = 'application/json';

	test('parses streamed JSON including split UTF-8 characters; the result still yields only lookup hints', async () => {
		const value = { transactionType: 'ECOMMERCE', metadata1: attemptId, ecommerceId: reference, status: 'COMPLETED', name: 'María' };
		const bytes = Buffer.from(JSON.stringify(value));
		const split = bytes.indexOf(Buffer.from('í')) + 1;
		const input = streamed([bytes.subarray(0, split), bytes.subarray(split)], 'Application/JSON; charset=utf-8', '1');
		const parsed = await webhookBody(input.request);
		expect(parsed).toEqual(value);
		expect(webhookHints(parsed)).toEqual({ attemptId, reference });
		expect(input.body.locked).toBe(false);
	});

	test('accepts exactly 32,768 actual bytes regardless of the declared length', async () => {
		const json = JSON.stringify({ padding: 'x'.repeat(32_768 - Buffer.byteLength(JSON.stringify({ padding: '' }))) });
		expect(Buffer.byteLength(json)).toBe(32_768);
		for (const length of [undefined, '0', '1', '32768', '999999999']) {
			expect(await webhookBody(request(json, contentType, length))).toEqual(JSON.parse(json));
		}
	});

	test('rejects 32,769 actual bytes despite short or missing Content-Length, cancelling unread chunks', async () => {
		const bytes = Buffer.from(JSON.stringify({ padding: 'x'.repeat(32_769 - Buffer.byteLength(JSON.stringify({ padding: '' }))) }));
		for (const length of [undefined, '0', '1', '32768']) {
			const input = streamed([bytes.subarray(0, 16_384), bytes.subarray(16_384), Buffer.from('unread')], contentType, length);
			expect(await webhookBody(input.request)).toBeNull();
			expect(input.cancelled()).toBe(true);
			expect(input.reads()).toBe(2);
			expect(input.body.locked).toBe(false);
		}
	});

	test('counts UTF-8 bytes, not JavaScript character count', async () => {
		const json = JSON.stringify({ padding: 'é'.repeat(16_384) });
		expect(json.length).toBeLessThan(32_768);
		expect(Buffer.byteLength(json)).toBeGreaterThan(32_768);
		expect(await webhookBody(request(json, contentType, String(json.length)))).toBeNull();
	});

	test('ignores missing/wrong content types, missing bodies, and malformed JSON', async () => {
		for (const type of [null, 'text/plain', 'application/x-www-form-urlencoded', 'application/jsonp', 'application/json-extra']) {
			expect(await webhookBody(request(Buffer.from('{"transactionType":"ECOMMERCE"}'), type))).toBeNull();
		}
		expect(await webhookBody(request(null, contentType))).toBeNull();
		for (const json of ['', ' ', '{', '{"status":"COMPLETED",}', '{"metadata1":', 'undefined', '{"a":1}{"b":2}', '{"a":NaN}']) {
			expect(await webhookBody(request(json, contentType))).toBeNull();
		}
	});

	test('valid JSON primitives/arrays are parsed but cannot turn into actionable hints', async () => {
		for (const value of [null, true, 123, 'COMPLETED', [], [{ transactionType: 'ECOMMERCE', metadata1: attemptId }]]) {
			const parsed = await webhookBody(request(JSON.stringify(value), contentType));
			expect(parsed).toEqual(value);
			expect(webhookHints(parsed)).toBeNull();
		}
	});

	test('ignores stream errors and releases the reader without exposing transport details', async () => {
		const body = new ReadableStream<Uint8Array>({ pull(controller) { controller.error(new Error('private transport detail')); } });
		expect(await webhookBody(request(body, contentType))).toBeNull();
		expect(body.locked).toBe(false);
	});
});
