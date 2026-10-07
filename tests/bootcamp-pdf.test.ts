import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { crc32, deflateSync, inflateSync } from 'node:zlib';
import PDFDocument from 'pdfkit';
import { bootcampDocumentMessages } from '../src/lib/bootcamp/document-messages';
import { assertBootcampPdfText, isSupportedPdfText } from '../src/lib/bootcamp/pdf-text';
import { sectionKeys, type LetterSnapshot, type WaiverSnapshot } from '../src/lib/bootcamp/types';
import { renderLetterPdf, renderWaiverPdf } from '../src/lib/server/bootcamp/pdf';
import { validateSignature } from '../src/lib/server/bootcamp/signatures';

function chunk(type: string, data: Buffer): Buffer {
	const result = Buffer.alloc(data.length + 12);
	result.writeUInt32BE(data.length);
	result.write(type, 4);
	data.copy(result, 8);
	result.writeUInt32BE(crc32(result.subarray(4, -4)), result.length - 4);
	return result;
}
function signature(seed: number): string {
	const header = Buffer.alloc(13);
	header.writeUInt32BE(600);
	header.writeUInt32BE(180, 4);
	header[8] = 8;
	header[9] = 2;
	const raw = Buffer.alloc(1801 * 180, 255);
	for (let y = 0; y < 180; y++) {
		raw[y * 1801] = 0;
		for (let x = 40; x < 180; x++) {
			if (Math.abs(y - (40 + seed * 10 + Math.floor(x / 6) % 20)) < 2) raw.fill(0, y * 1801 + 1 + x * 3, y * 1801 + 4 + x * 3);
		}
	}
	return 'data:image/png;base64,' + Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}
const signatures = { agreement: signature(1), liability: signature(2), media: signature(3) };
function waiver(language: 'en' | 'es'): WaiverSnapshot {
	return {
		language, signedAt: '2027-02-11T02:03:04Z',
		student: { name: 'Alex María Rodríguez', email: 'alex@example.test', dateOfBirth: '1994-12-31',
			phone: '787-555-0123', municipality: 'Mayagüez', signingCity: 'Añasco' },
		event: {
			id: 'event-canonical-42', revision: 7, title: 'Bootcamp Horizonte', venue: 'Cancha Norte, Caguas, Puerto Rico',
			startsAt: '2027-03-06T11:30:00Z', endsAt: '2027-03-07T01:45:00Z', arrivalAt: '2027-03-06T10:45:00Z',
			registrationClosesAt: '2027-03-01T12:00:00Z',
			legal: {
				en: { agreement: 'APPROVED AGREEMENT  §1: Preserve  these exact words.\nSecond paragraph: café; £25 — “approved”.',
					liability: 'APPROVED LIABILITY: this is the canonical liability test fixture.', media: 'APPROVED MEDIA: this is the canonical media test fixture.' },
				es: { agreement: 'ACUERDO APROBADO  §1: Conservar  estas palabras exactas.\nSegundo párrafo: café; £25 — “aprobado”.',
					liability: 'RELEVO APROBADO: este es el texto canónico de la prueba.', media: 'IMAGEN APROBADA: este es el texto canónico de imagen de la prueba.' }
			}
		}, signatures: { ...signatures }
	};
}
function letter(language: 'en' | 'es'): LetterSnapshot {
	const snapshot = waiver(language);
	return { event: snapshot.event, student: snapshot.student, language, issuedAt: snapshot.signedAt,
		employer: { employer: 'Empresa del Caribe', contact: 'Jordan Pérez', position: 'Gerencia de personal', workplace: 'Oficina de Ponce' } };
}

type Text = { text: string; x: number; baseline: number; font: string; size: number };
type Bounds = { left: number; right: number; top: number; bottom: number };
type Image = { name: string; width: number; height: number; data: Buffer };
type Page = { texts: Text[]; images: Image[]; draws: (Bounds & { name: string })[] };
type Matrix = [number, number, number, number, number, number];
function multiply(a: Matrix, b: Matrix): Matrix {
	return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
		a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
		a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
}
function stream(object: string): Buffer {
	return Buffer.from(object.match(/stream\n([\s\S]*?)\nendstream/)![1], 'latin1');
}
// PDFKit-specific inspector, following the existing attendance PDF tests. These tests
// inspect real PDF streams, text positions and embedded pixels, not renderer mocks.
function readPdf(pdf: Buffer): Page[] {
	const source = pdf.toString('latin1');
	expect(source.startsWith('%PDF-1.3\n')).toBe(true);
	expect(source.trimEnd().endsWith('%%EOF')).toBe(true);
	const xref = Number(source.match(/startxref\n(\d+)\n/)?.[1]);
	expect(source.slice(xref, xref + 4)).toBe('xref');
	const objects = new Map([...source.matchAll(/(\d+) 0 obj\n([\s\S]*?)\nendobj/g)].map((match) => [Number(match[1]), match[2]]));
	const decoder = new TextDecoder('windows-1252');
	const pages: Page[] = [];
	for (const object of objects.values()) {
		if (!/\/Type \/Page\b/.test(object)) continue;
		expect(object).toContain('/MediaBox [0 0 612 792]');
		const resources = objects.get(Number(object.match(/\/Resources (\d+) 0 R/)?.[1]))!;
		const fonts = new Map([...resources.matchAll(/\/(F\d+) (\d+) 0 R/g)].map((match) => [
			match[1], objects.get(Number(match[2]))!.match(/\/BaseFont \/([^\s]+)/)![1]
		]));
		const images = [...(resources.match(/\/XObject\s*<<([\s\S]*?)>>/)?.[1] ?? '').matchAll(/\/(\S+) (\d+) 0 R/g)].map((match) => {
			const image = objects.get(Number(match[2]))!;
			expect(image).toContain('/Subtype /Image');
			const data = stream(image);
			expect(inflateSync(data).length).toBeGreaterThan(0);
			return { name: match[1], width: Number(image.match(/\/Width (\d+)/)?.[1]), height: Number(image.match(/\/Height (\d+)/)?.[1]), data };
		});
		const content = objects.get(Number(object.match(/\/Contents (\d+) 0 R/)?.[1]))!;
		const commands = inflateSync(stream(content)).toString('latin1');
		const texts: Text[] = [];
		const draws: Page['draws'] = [];
		const matrices: Matrix[] = [];
		let matrix: Matrix = [1, 0, 0, 1, 0, 0];
		for (const match of commands.matchAll(/BT\n([\s\S]*?)\nET|([^\n]+)/g)) {
			if (match[1] !== undefined) {
				const position = match[1].match(/1 0 0 1 ([\d.-]+) ([\d.-]+) Tm/)!;
				const font = match[1].match(/\/(F\d+) ([\d.]+) Tf/)!;
				const bytes = Buffer.concat([...match[1].matchAll(/<([\da-f]+)>/gi)].map((hex) => Buffer.from(hex[1], 'hex')));
				texts.push({ text: decoder.decode(bytes), x: Number(position[1]), baseline: 792 - Number(position[2]),
					font: fonts.get(font[1])!, size: Number(font[2]) });
				continue;
			}
			const command = match[2].trim();
			if (command === 'q') matrices.push([...matrix]);
			if (command === 'Q') matrix = matrices.pop()!;
			const tokens = command.split(/\s+/);
			if (tokens.at(-1) === 'cm') matrix = multiply(matrix, tokens.slice(0, -1).map(Number) as Matrix);
			const image = command.match(/^\/(\S+) Do$/);
			if (image) {
				const corners = [[0, 0], [0, 1], [1, 0], [1, 1]].map(([x, y]) => [
					matrix[0] * x + matrix[2] * y + matrix[4], 792 - (matrix[1] * x + matrix[3] * y + matrix[5])
				]);
				draws.push({ name: image[1], left: Math.min(...corners.map(([x]) => x)), right: Math.max(...corners.map(([x]) => x)),
					top: Math.min(...corners.map(([, y]) => y)), bottom: Math.max(...corners.map(([, y]) => y)) });
			}
		}
		pages.push({ texts, images, draws });
	}
	const pageTree = [...objects.values()].find((object) => /\/Type \/Pages\b/.test(object))!;
	expect(Number(pageTree.match(/\/Count (\d+)/)?.[1])).toBe(pages.length);
	expect(pages.length).toBeGreaterThan(0);
	return pages;
}
function pngData(png: Buffer): Buffer {
	const data: Buffer[] = [];
	for (let offset = 8; offset < png.length;) {
		const length = png.readUInt32BE(offset);
		if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') data.push(png.subarray(offset + 8, offset + 8 + length));
		offset += length + 12;
	}
	return Buffer.concat(data);
}
const organizerPixels = pngData(readFileSync(new URL('../src/lib/server/assets/attendance-signature.png', import.meta.url)));
const logo = readFileSync(new URL('../static/logo.png', import.meta.url));
const bodyText = (pages: Page[]) => pages.flatMap((page) => page.texts.filter((text) => text.baseline > 130)).map((text) => text.text).join('');
const legalText = (pages: Page[]) => pages.flatMap((page) => page.texts.filter((text) => text.font === 'Times-Roman')).map((text) => text.text).join('');
const withoutLineEndings = (text: string) => text.replace(/\r\n|\r|\n/g, '');
const compact = (text: string) => text.replace(/\s/g, '');

function expectReadable(pages: Page[]): void {
	const metrics = new PDFDocument({ autoFirstPage: false });
	try {
		for (const page of pages) {
			const boxes: Bounds[] = page.texts.map((line) => {
				metrics.font(line.font).fontSize(line.size);
				const serif = line.font.startsWith('Times');
				return { left: line.x, right: line.x + metrics.widthOfString(line.text),
					top: line.baseline - line.size * (serif ? 0.683 : 0.718), bottom: line.baseline + line.size * (serif ? 0.217 : 0.207) };
			});
			boxes.push(...page.draws);
			for (const box of boxes) {
				expect(box.left).toBeGreaterThanOrEqual(53.99);
				expect(box.right).toBeLessThanOrEqual(558.01);
				expect(box.top).toBeGreaterThanOrEqual(53.99);
				expect(box.bottom).toBeLessThanOrEqual(738.01);
			}
			for (let i = 0; i < boxes.length; i++) {
				for (let j = i + 1; j < boxes.length; j++) {
					const a = boxes[i];
					const b = boxes[j];
					const overlaps = Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.1;
					expect(overlaps).toBe(false);
				}
			}
			// PDFKit separates the logo's alpha channel, so its compressed bytes change.
			const logos = page.images.filter((image) => image.width === logo.readUInt32BE(16) && image.height === logo.readUInt32BE(20));
			expect(logos).toHaveLength(1);
			expect(page.draws.filter((draw) => draw.name === logos[0].name)).toEqual([
				{ name: logos[0].name, left: 494, right: 558, top: 54, bottom: 118 }
			]);
		}
	} finally {
		metrics.destroy();
	}
}

function expectWaiver(pages: Page[], snapshot: WaiverSnapshot): void {
	const messages = bootcampDocumentMessages[snapshot.language];
	// Exact comparison retains duplicate spaces, punctuation and accents, ignoring only
	// paragraph breaks that PDF text represents with positioning rather than characters.
	expect(legalText(pages)).toBe(sectionKeys.map((key) => withoutLineEndings(snapshot.event.legal[snapshot.language][key])).join(''));
	const text = bodyText(pages);
	for (const value of [snapshot.student.name, snapshot.student.email, snapshot.student.phone, snapshot.student.municipality,
		snapshot.student.signingCity, snapshot.event.id, snapshot.event.title, snapshot.event.venue, messages.organizer.name,
		messages.organizer.phone, messages.organizer.email]) expect(text).toContain(value);
	let previousPage = 0;
	for (const key of sectionKeys) {
		const expected = pngData(Buffer.from(validateSignature(snapshot.signatures[key]).split(',')[1], 'base64'));
		const matched = pages.flatMap((page, index) => page.images.filter((image) => image.data.equals(expected)).map((image) => ({ page, index, image })));
		expect(matched).toHaveLength(1);
		expect(matched[0].index).toBeGreaterThan(previousPage);
		previousPage = matched[0].index;
		expect(matched[0].page.draws.filter((draw) => draw.name === matched[0].image.name)).toHaveLength(1);
		expect(matched[0].page.texts.some(({ text }) => text === `${messages.labels.participantSignature} — ${messages.sections[key]}`)).toBe(true);
	}
	const organizerDraws = pages.flatMap((page) => page.images.filter((image) => image.data.equals(organizerPixels))
		.flatMap((image) => page.draws.filter((draw) => draw.name === image.name)));
	expect(organizerDraws).toHaveLength(3);
	expectReadable(pages);
}

describe('shared bootcamp PDF character validation', () => {
	test('accepts the existing WinAnsi repertoire and line endings without changing text', () => {
		const ascii = Array.from({ length: 95 }, (_, index) => String.fromCharCode(0x20 + index)).join('');
		const latin = Array.from({ length: 96 }, (_, index) => String.fromCharCode(0xa0 + index)).join('');
		for (const text of [ascii, latin, '€ŒœŠšŸŽžƒˆ˜‘’‚“”„–—…†‡•‰‹›™', '  María  Muñoz\r\n\n§1: café.  ', '']) {
			expect(isSupportedPdfText(text)).toBe(true);
			expect(() => assertBootcampPdfText(text)).not.toThrow();
		}
	});

	test('rejects nonbreaking hyphens, tabs, decomposed accents, controls and unsupported Unicode', () => {
		for (const text of ['Bootcamp\u2011Militarizado', 'Rule\t1', 'Mari\u0301a', '🚫', '姓名', '\u2028', '\u2029', '\u200b', '\u2060', '\u0000', '\u007f', '\u0085']) {
			expect(isSupportedPdfText(text)).toBe(false);
			expect(() => assertBootcampPdfText(text)).toThrow('unsupported characters');
		}
	});

	test('rejects non-string input without coercion', () => {
		for (const value of [undefined, null, 0, false, [], {}, new String('Name')]) {
			expect(isSupportedPdfText(value)).toBe(false);
			expect(() => assertBootcampPdfText(value)).toThrow(TypeError);
		}
	});
});

describe('real bootcamp PDFs', () => {
	for (const language of ['en', 'es'] as const) {
		test(`${language}: exact canonical legal text, all student information, signatures and Puerto Rico times`, async () => {
			const snapshot = waiver(language);
			const before = JSON.stringify(snapshot);
			const pdf = await renderWaiverPdf(snapshot);
			const pages = readPdf(pdf);
			expectWaiver(pages, snapshot);
			expect(JSON.stringify(snapshot)).toBe(before);
			const text = bodyText(pages);
			for (const value of language === 'en'
				? ['December 31, 1994', 'February 10, 2027 at 22:03:04', 'March 6, 2027 at 07:30:00', 'March 6, 2027 at 21:45:00', 'March 6, 2027 at 06:45:00', 'Event revision: 7']
				: ['31 de diciembre de 1994', '10 de febrero de 2027 a las 22:03:04', '6 de marzo de 2027 a las 07:30:00', '6 de marzo de 2027 a las 21:45:00', '6 de marzo de 2027 a las 06:45:00', 'Revisión del evento: 7']) expect(text).toContain(value);
			expect(pdf.toString('latin1')).toContain(`/Lang (${language})`);
			expect(text).not.toMatch(/SSN|XXX-XX|printed copy|copia impresa|entregado a mano|0745/);
		});

		test(`${language}: long legal text and unbroken tokens paginate without losing a single legal word or space`, async () => {
			const snapshot = waiver(language);
			for (const key of sectionKeys) {
				snapshot.event.legal[language][key] = Array.from({ length: 100 }, (_, index) =>
					`${key}-${index}:  ${snapshot.event.legal[language][key]} FINAL-${index}.`).join('\n\n') + '\n' + 'LongToken'.repeat(200) + ' FINAL-SECTION.';
			}
			const pages = readPdf(await renderWaiverPdf(snapshot));
			expect(pages.length).toBeGreaterThan(12);
			expectWaiver(pages, snapshot);
		}, 15000);

		test(`${language}: employer letter is bilingual, gender neutral and specific to planned bootcamp participation`, async () => {
			const snapshot = letter(language);
			const before = JSON.stringify(snapshot);
			const pages = readPdf(await renderLetterPdf(snapshot));
			expect(pages).toHaveLength(1);
			const text = bodyText(pages);
			for (const value of [snapshot.student.name, snapshot.event.title, snapshot.event.venue, ...Object.values(snapshot.employer),
				'939-408-0440', 'mastermindsprogramaasvab@gmail.com', 'Claudy Menéndez']) expect(text).toContain(value);
			for (const value of language === 'en'
				? ['planned participation', 'not a certification of completed attendance', 'March 6, 2027 at 07:30:00', 'March 6, 2027 at 21:45:00', 'March 6, 2027 at 06:45:00']
				: ['participación prevista', 'no una certificación de asistencia completada', '6 de marzo de 2027 a las 07:30:00', '6 de marzo de 2027 a las 21:45:00', '6 de marzo de 2027 a las 06:45:00']) expect(compact(text)).toContain(compact(value));
			expect(text).not.toMatch(/SSN|XXX-XX|Monday|Thursday|lunes|jueves|\b[Ss]he\b|\b[Hh]e\b|La participante|El participante|accepted into|ha sido aceptad/);
			expect(text).not.toContain(snapshot.student.dateOfBirth);
			expect(text).not.toContain(snapshot.student.email);
			expect(pages[0].images.filter((image) => image.data.equals(organizerPixels))).toHaveLength(1);
			expectReadable(pages);
			expect(JSON.stringify(snapshot)).toBe(before);
		});

		test(`${language}: long employer details and names paginate with the complete letter and final signature`, async () => {
			const snapshot = letter(language);
			snapshot.employer.workplace = 'Workplace '.repeat(900) + 'WORKPLACE-END';
			snapshot.student.name = 'Alex'.repeat(100) + 'NAME-END';
			const pages = readPdf(await renderLetterPdf(snapshot));
			expect(pages.length).toBeGreaterThanOrEqual(3);
			expect(compact(bodyText(pages))).toContain(compact(snapshot.employer.workplace));
			expect(compact(bodyText(pages))).toContain(compact(snapshot.student.name));
			expect(legalText(pages)).toContain(bootcampDocumentMessages[language].letter.thanks);
			expect(pages.at(-1)!.images.some((image) => image.data.equals(organizerPixels))).toBe(true);
			expectReadable(pages);
		});
	}

	test('identical serialized snapshots produce identical PDF bytes across wall-clock changes and concurrent renders', async () => {
		const cases = (['en', 'es'] as const).flatMap((language) => {
			const waiverSnapshot = JSON.stringify(waiver(language));
			const letterSnapshot = JSON.stringify(letter(language));
			return [
				() => renderWaiverPdf(JSON.parse(waiverSnapshot)),
				() => renderLetterPdf(JSON.parse(letterSnapshot))
			];
		});
		const before = await Promise.all(cases.map((render) => render()));
		// PDF date metadata has second precision; cross that boundary without changing
		// the global clock or mocking PDFKit, signatures, images, or compression.
		await Bun.sleep(1100);
		const after = await Promise.all(cases.map((render) => render()));
		for (const [index, pdf] of after.entries()) expect(pdf.equals(before[index])).toBe(true);
	}, 15000);

	test('changing the bound signing or issue time changes the PDF bytes', async () => {
		const waiverSnapshot = waiver('en');
		const originalWaiver = await renderWaiverPdf(waiverSnapshot);
		waiverSnapshot.signedAt = '2027-02-11T02:03:05Z';
		expect((await renderWaiverPdf(waiverSnapshot)).equals(originalWaiver)).toBe(false);
		const letterSnapshot = letter('es');
		const originalLetter = await renderLetterPdf(letterSnapshot);
		letterSnapshot.issuedAt = '2027-02-11T02:03:05Z';
		expect((await renderLetterPdf(letterSnapshot)).equals(originalLetter)).toBe(false);
	});

	test('changed event configuration is rendered from the snapshot, not legacy dates or venue', async () => {
		const snapshot = waiver('en');
		snapshot.event.startsAt = '2028-01-01T02:00:00Z';
		snapshot.event.endsAt = '2028-01-01T06:00:00Z';
		snapshot.event.arrivalAt = '2028-01-01T01:30:00Z';
		snapshot.event.venue = 'New configured venue';
		const text = bodyText(readPdf(await renderWaiverPdf(snapshot)));
		for (const value of ['December 31, 2027 at 22:00:00', 'January 1, 2028 at 02:00:00', 'December 31, 2027 at 21:30:00', 'New configured venue']) expect(text).toContain(value);
		expect(text).not.toContain('Cancha Norte');
		expect(text).not.toContain('August 1, 2026');
	});

	test('rejects missing or invalid signatures and missing approved legal text rather than generating an incomplete waiver', async () => {
		for (const key of sectionKeys) {
			const snapshot = waiver('en');
			snapshot.signatures[key] = 'data:image/png;base64,AAAA';
			await expect(renderWaiverPdf(snapshot)).rejects.toThrow(TypeError);
			const missing = waiver('es');
			missing.event.legal.es[key] = ' \n';
			await expect(renderWaiverPdf(missing)).rejects.toThrow('Missing bootcamp legal section');
		}
	});

	test('rejects unrenderable legal characters instead of silently losing them', async () => {
		const snapshot = waiver('en');
		snapshot.event.legal.en.agreement += ' 🚫';
		await expect(renderWaiverPdf(snapshot)).rejects.toThrow('unsupported characters');
	});

	test('renderer and shared predicate reject tabs and nonbreaking hyphens in every supplied text category', async () => {
		for (const text of ['Bootcamp\u2011Militarizado', 'Rule\t1']) {
			expect(isSupportedPdfText(text)).toBe(false);
			for (const key of ['title', 'venue'] as const) {
				const snapshot = waiver('en');
				snapshot.event[key] = text;
				await expect(renderWaiverPdf(snapshot)).rejects.toThrow('unsupported characters');
				const letterSnapshot = letter('es');
				letterSnapshot.event[key] = text;
				await expect(renderLetterPdf(letterSnapshot)).rejects.toThrow('unsupported characters');
			}
			for (const key of sectionKeys) {
				const snapshot = waiver('es');
				snapshot.event.legal.es[key] = text;
				await expect(renderWaiverPdf(snapshot)).rejects.toThrow('unsupported characters');
			}
			for (const key of ['name', 'email', 'phone', 'municipality', 'signingCity'] as const) {
				const snapshot = waiver('en');
				snapshot.student[key] = text;
				await expect(renderWaiverPdf(snapshot)).rejects.toThrow('unsupported characters');
			}
			for (const key of ['employer', 'contact', 'position', 'workplace'] as const) {
				const snapshot = letter('es');
				snapshot.employer[key] = text;
				await expect(renderLetterPdf(snapshot)).rejects.toThrow('unsupported characters');
			}
		}
	});

	test('rejects ambiguous timestamps and impossible date-only births', async () => {
		const ambiguous = letter('en');
		ambiguous.event.startsAt = '2027-03-06T07:30:00';
		await expect(renderLetterPdf(ambiguous)).rejects.toThrow('time-zone offset');
		const invalidBirth = waiver('en');
		invalidBirth.student.dateOfBirth = '1994-02-30';
		await expect(renderWaiverPdf(invalidBirth)).rejects.toThrow('date of birth');
	});
});
