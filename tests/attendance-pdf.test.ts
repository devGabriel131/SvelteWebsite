import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import PDFDocument from 'pdfkit';
import type { AttendanceDocument } from '../src/lib/attendance/presentation';
import { generateAttendancePdf } from '../src/lib/server/attendance-pdf';

// Explicit presentation fixtures: these tests must not get their expected copy from the renderer's callers.
function makeDocument(language: AttendanceDocument['language']): AttendanceDocument {
	if (language === 'es') {
		return {
			language, title: 'Certificación de asistencia — Programa ASVAB', issuedDate: '4 de octubre de 2026',
			recipient: ['José Ramón Muñoz', 'Gerente de Recursos Humanos', 'Compañía Médica del Caribe, San Juan'],
			paragraphs: [
				'Por medio de la presente, Claudy Menéndez, en representación de Masterminds Programa ASVAB, certifica que María Isabel Rodríguez Peña ha sido aceptada en nuestro programa integral de preparación para ingresar a las Fuerzas Armadas de los Estados Unidos.',
				'Desde el 15 de septiembre de 2026, María Isabel forma parte de nuestro programa. Asistirá a los cursos de lunes a jueves, de 5:00 p. m. a 8:00 p. m., como parte de su proceso de preparación.',
				'Le solicitamos amablemente tomar en cuenta el compromiso adquirido por María Isabel y ajustar, en la medida de lo posible, su disponibilidad laboral. Esto le permitirá cumplir con sus responsabilidades de trabajo y sus metas personales y profesionales.',
				'Agradecemos de antemano su comprensión y apoyo en este esfuerzo conjunto por fomentar el desarrollo integral y profesional de María Isabel.',
				'Para los fines pertinentes, esta certificación se expide en Bayamón, Puerto Rico, hoy, 4 de octubre de 2026. Para cualquier consulta, puede comunicarse al (939) 408-0440.'
			],
			signature: {
				name: 'Claudy Menéndez, Representante', role: 'Masterminds Repaso ASVAB',
				phone: '(939) 408-0440', email: 'mastermindsprogramaasvab@gmail.com'
			},
			pageLabel: 'Página', filename: '2026-10-04_asvab_maria-isabel-rodriguez-pena_es.pdf'
		};
	}
	return {
		language, title: 'Attendance certification — ASVAB Program', issuedDate: 'October 4, 2026',
		recipient: ['José Ramón Muñoz', 'Human Resources Manager', 'Caribbean Medical Company, San Juan'],
		paragraphs: [
			'This letter certifies that Claudy Menéndez, representing the Masterminds ASVAB Program, confirms that María Isabel Rodríguez Peña has been accepted into our comprehensive preparation program to enter the United States Armed Forces.',
			'Since September 15, 2026, María Isabel has participated in our program. She will attend classes Monday through Thursday, from 5:00 p.m. to 8:00 p.m., as part of her preparation.',
			'We kindly ask you to consider María Isabel’s commitment and accommodate her work availability whenever possible. This will allow her to fulfill her current workplace responsibilities while pursuing her personal and professional goals.',
			'Thank you for your understanding and support in this shared effort to foster María Isabel’s personal and professional development.',
			'This certification is issued in Bayamón, Puerto Rico, on October 4, 2026. For questions, please contact us at (939) 408-0440.'
		],
		signature: {
			name: 'Claudy Menéndez, Representative', role: 'Masterminds ASVAB Review',
			phone: '(939) 408-0440', email: 'mastermindsprogramaasvab@gmail.com'
		},
		pageLabel: 'Page', filename: '2026-10-04_asvab_maria-isabel-rodriguez-pena_en.pdf'
	};
}

const compact = (text: string) => text.replace(/\s/g, '');
type Bounds = { left: number; right: number; top: number; bottom: number };
type PdfText = { text: string; x: number; baseline: number; size: number; font: string };
type PdfImage = { name: string; width: number; height: number; data: Buffer };
type PdfPage = {
	headerBottom: number;
	footerTop: number;
	texts: PdfText[];
	images: PdfImage[];
	imageDraws: (Bounds & { name: string })[];
};
type LocatedText = PdfText & { page: number; order: number };
type Matrix = [number, number, number, number, number, number];

function multiply(a: Matrix, b: Matrix): Matrix {
	return [
		a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
		a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
		a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]
	];
}

function streamData(object: string): Buffer {
	const data = object.match(/stream\n([\s\S]*?)\nendstream/);
	expect(data).not.toBeNull();
	return Buffer.from(data![1], 'latin1');
}

// Adapted from the IST inspector: only PDFKit's standard-font text, image XObjects,
// and positioned drawing commands, not a general PDF parser or an external PDF utility.
function readPdf(pdf: Buffer): PdfPage[] {
	const source = pdf.toString('latin1');
	expect(source.startsWith('%PDF-1.3\n')).toBe(true);
	expect(source.trimEnd().endsWith('%%EOF')).toBe(true);
	const xrefOffset = Number(source.match(/startxref\n(\d+)\n/)?.[1]);
	expect(source.slice(xrefOffset, xrefOffset + 4)).toBe('xref');
	const objects = new Map([...source.matchAll(/(\d+) 0 obj\n([\s\S]*?)\nendobj/g)]
		.map((match) => [Number(match[1]), match[2]]));
	const decoder = new TextDecoder('windows-1252');
	const pages: PdfPage[] = [];
	for (const object of objects.values()) {
		if (!/\/Type \/Page\b/.test(object)) continue;
		expect(object).toContain('/MediaBox [0 0 612 792]');
		const resources = objects.get(Number(object.match(/\/Resources (\d+) 0 R/)?.[1]))!;
		const fonts = new Map([...resources.matchAll(/\/(F\d+) (\d+) 0 R/g)].map((match) => [
			match[1], objects.get(Number(match[2]))!.match(/\/BaseFont \/([^\s]+)/)![1]
		]));
		for (const font of fonts.values()) {
			expect(['Times-Roman', 'Times-Bold', 'Times-Italic', 'Helvetica', 'Helvetica-Bold']).toContain(font);
		}
		const xObjects = resources.match(/\/XObject\s*<<([\s\S]*?)>>/)?.[1] ?? '';
		const images = [...xObjects.matchAll(/\/(\S+) (\d+) 0 R/g)].map((match) => {
			const image = objects.get(Number(match[2]))!;
			expect(image).toContain('/Subtype /Image');
			expect(image).toContain('/Filter /FlateDecode');
			const data = streamData(image);
			expect(inflateSync(data).byteLength).toBeGreaterThan(0);
			return { name: match[1], width: Number(image.match(/\/Width (\d+)/)?.[1]),
				height: Number(image.match(/\/Height (\d+)/)?.[1]), data };
		});
		const content = objects.get(Number(object.match(/\/Contents (\d+) 0 R/)?.[1]))!;
		expect(content).toContain('/Filter /FlateDecode');
		const commands = inflateSync(streamData(content)).toString('latin1');
		const texts: PdfText[] = [];
		const imageDraws: PdfPage['imageDraws'] = [];
		const rules: number[] = [];
		const savedMatrices: Matrix[] = [];
		let matrix: Matrix = [1, 0, 0, 1, 0, 0];
		let points: number[][] = [];
		for (const match of commands.matchAll(/BT\n([\s\S]*?)\nET|([^\n]+)/g)) {
			if (match[1] !== undefined) {
				const position = match[1].match(/1 0 0 1 ([\d.-]+) ([\d.-]+) Tm/)!;
				const font = match[1].match(/\/(F\d+) ([\d.]+) Tf/)!;
				const bytes = Buffer.concat([...match[1].matchAll(/<([\da-f]+)>/gi)]
					.map((hex) => Buffer.from(hex[1], 'hex')));
				texts.push({ text: decoder.decode(bytes), x: Number(position[1]),
					baseline: 792 - Number(position[2]), size: Number(font[2]), font: fonts.get(font[1])! });
				continue;
			}
			const command = match[2].trim();
			if (command === 'q') savedMatrices.push([...matrix]);
			if (command === 'Q') matrix = savedMatrices.pop()!;
			const tokens = command.split(/\s+/);
			const operator = tokens.at(-1);
			const numbers = tokens.slice(0, -1).map(Number);
			if (operator === 'cm') matrix = multiply(matrix, numbers as Matrix);
			const draw = command.match(/^\/(\S+) Do$/);
			if (draw) {
				const corners = [[0, 0], [0, 1], [1, 0], [1, 1]].map(([x, y]) => [
					matrix[0] * x + matrix[2] * y + matrix[4],
					792 - (matrix[1] * x + matrix[3] * y + matrix[5])
				]);
				imageDraws.push({ name: draw[1], left: Math.min(...corners.map(([x]) => x)),
					right: Math.max(...corners.map(([x]) => x)), top: Math.min(...corners.map(([, y]) => y)),
					bottom: Math.max(...corners.map(([, y]) => y)) });
			}
			if (operator === 'm' || operator === 'l') points.push(numbers);
			if (operator === 'S') {
				if (points.length === 2 && points[0][1] === points[1][1]) rules.push(points[0][1]);
				points = [];
			}
		}
		expect(rules).toHaveLength(2);
		pages.push({ headerBottom: rules[0], footerTop: rules[1], texts, images, imageDraws });
	}
	const pageTree = [...objects.values()].find((object) => /\/Type \/Pages\b/.test(object))!;
	expect(Number(pageTree.match(/\/Count (\d+)/)?.[1])).toBe(pages.length);
	expect(pages.length).toBeGreaterThan(0);
	return pages;
}

function textRegion(page: PdfPage, text: PdfText): 'header' | 'body' | 'footer' {
	return text.baseline < page.headerBottom ? 'header' : text.baseline > page.footerTop ? 'footer' : 'body';
}

function renderedBlock(pages: PdfPage[], value: string): LocatedText[] {
	const groups = new Map<string, LocatedText[]>();
	let order = 0;
	for (const [pageIndex, page] of pages.entries()) {
		for (const text of page.texts) {
			const key = JSON.stringify([text.font, text.size, textRegion(page, text)]);
			const group = groups.get(key) ?? [];
			group.push({ ...text, page: pageIndex, order: order++ });
			groups.set(key, group);
		}
	}
	const expected = compact(value);
	for (const group of groups.values()) {
		const text = compact(group.map(({ text }) => text).join(''));
		let start = text.indexOf(expected);
		while (start >= 0) {
			let offset = 0;
			const lines = group.filter(({ text }) => {
				const end = offset + compact(text).length;
				const overlaps = end > start && offset < start + expected.length;
				offset = end;
				return overlaps;
			});
			// A phone/date mentioned inside a paragraph is not its separately drawn field.
			if (compact(lines.map(({ text }) => text).join('')) === expected) return lines;
			start = text.indexOf(expected, start + 1);
		}
	}
	throw new Error(`Missing document text: ${value.slice(0, 100)}`);
}

function expectLetterText(pages: PdfPage[], document: AttendanceDocument): void {
	const bodyStrings = [document.title, ...document.recipient, ...document.paragraphs,
		document.signature.name, document.signature.role, document.signature.phone, document.signature.email];
	for (const value of [document.issuedDate, ...bodyStrings]) renderedBlock(pages, value);
	const firstHeader = pages[0].texts.filter((text) => textRegion(pages[0], text) === 'header');
	const dateInHeader = firstHeader.length > 0;
	const content = pages.flatMap((page) => page.texts.filter((text) => textRegion(page, text) === 'body'));
	// Exact body comparison also catches unexpected copy and changed/reordered snapshot values.
	expect(compact(content.map(({ text }) => text).join('')))
		.toBe(compact([...(dateInHeader ? [] : [document.issuedDate]), ...bodyStrings].join('')));
	for (const [index, page] of pages.entries()) {
		const header = page.texts.filter((text) => textRegion(page, text) === 'header');
		expect(compact(header.map(({ text }) => text).join('')))
			.toBe(dateInHeader ? compact(document.issuedDate) : '');
		const footer = page.texts.filter((text) => textRegion(page, text) === 'footer');
		expect(compact(footer.map(({ text }) => text).join(''))).toBe(compact(`${document.pageLabel} ${index + 1}`));
	}
}

function pngData(url: URL): { width: number; height: number; data: Buffer } {
	const png = readFileSync(url);
	const chunks: Buffer[] = [];
	for (let offset = 8; offset < png.length;) {
		const length = png.readUInt32BE(offset);
		if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length));
		offset += length + 12;
	}
	return { width: png.readUInt32BE(16), height: png.readUInt32BE(20), data: Buffer.concat(chunks) };
}
const logo = pngData(new URL('../static/logo.png', import.meta.url));
const signature = pngData(new URL('../src/lib/server/assets/attendance-signature.png', import.meta.url));

function expectAssets(pages: PdfPage[]): void {
	for (const page of pages) {
		const logos = page.images.filter((image) => image.width === logo.width && image.height === logo.height);
		expect(logos).toHaveLength(1);
		const draws = page.imageDraws.filter(({ name }) => name === logos[0].name);
		expect(draws).toHaveLength(1);
		expect(draws[0].right - draws[0].left).toBeGreaterThan(0);
		expect(draws[0].bottom - draws[0].top).toBeGreaterThan(0);
		expect(draws[0].bottom).toBeLessThan(page.headerBottom);
	}
	const signatures = pages.flatMap((page, index) => page.images
		.filter((image) => image.width === signature.width && image.height === signature.height)
		.map((image) => ({ image, page: index, draws: page.imageDraws.filter(({ name }) => name === image.name) })));
	expect(signatures).toHaveLength(1);
	// The RGB signature's original compressed PNG pixels, not merely an image of matching dimensions.
	expect(signatures[0].image.data).toEqual(signature.data);
	expect(signatures[0].draws).toHaveLength(1);
	expect(signatures[0].page).toBe(pages.length - 1);
	const draw = signatures[0].draws[0];
	expect((draw.right - draw.left) / (draw.bottom - draw.top)).toBeCloseTo(signature.width / signature.height, 4);
}

function textBounds(line: PdfText, metrics: PDFKit.PDFDocument): Bounds {
	metrics.font(line.font).fontSize(line.size);
	// PDFKit's built-in AFMs use these ascent/descent metrics for the chosen serif and sans-serif fonts.
	const ascent = line.font.startsWith('Times') ? 0.683 : 0.718;
	const descent = line.font.startsWith('Times') ? 0.217 : 0.207;
	return { left: line.x, right: line.x + metrics.widthOfString(line.text),
		top: line.baseline - line.size * ascent, bottom: line.baseline + line.size * descent };
}

function expectReadable(pages: PdfPage[]): void {
	const metrics = new PDFDocument({ autoFirstPage: false });
	try {
		for (const [index, page] of pages.entries()) {
			const boxes = page.texts.map((line) => ({ ...textBounds(line, metrics), description: line.text, line }));
			for (const box of boxes) {
				expect(box.left).toBeGreaterThanOrEqual(53.99);
				expect(box.right).toBeLessThanOrEqual(558.01);
				expect(box.top).toBeGreaterThanOrEqual(53.99);
				expect(box.bottom).toBeLessThanOrEqual(760.01);
				if (textRegion(page, box.line) === 'body') {
					expect(box.top).toBeGreaterThanOrEqual(page.headerBottom + 10);
					expect(box.bottom).toBeLessThanOrEqual(page.footerTop - 8);
				}
			}
			for (const image of page.imageDraws) {
				expect(image.left).toBeGreaterThanOrEqual(53.99);
				expect(image.right).toBeLessThanOrEqual(558.01);
				expect(image.top).toBeGreaterThanOrEqual(53.99);
				expect(image.bottom).toBeLessThanOrEqual(page.footerTop - 8);
			}
			const elements = [...boxes, ...page.imageDraws.map((image) => ({ ...image, description: image.name }))];
			for (let first = 0; first < elements.length; first++) {
				for (let second = first + 1; second < elements.length; second++) {
					const a = elements[first];
					const b = elements[second];
					const horizontalOverlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
					const verticalOverlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
					expect(horizontalOverlap > 0.01 && verticalOverlap > 0.01,
						`Page ${index + 1} overlap: ${a.description} / ${b.description}`).toBe(false);
				}
			}
		}
	} finally {
		metrics.resume();
		metrics.end();
	}
}

function expectIntactSignature(pages: PdfPage[], document: AttendanceDocument): void {
	const fields = [document.signature.name, document.signature.role, document.signature.phone, document.signature.email];
	const lines = fields.flatMap((field) => renderedBlock(pages, field));
	expect(new Set(lines.map(({ page }) => page))).toEqual(new Set([pages.length - 1]));
	const page = pages.at(-1)!;
	const image = page.images.find((image) => image.width === signature.width && image.height === signature.height)!;
	const draw = page.imageDraws.find(({ name }) => name === image.name)!;
	expect(draw.bottom).toBeLessThan(lines[0].baseline - lines[0].size * 0.683);
	for (const line of lines) expect(line.baseline).toBeGreaterThan(draw.bottom);
}

function freezeDocument(document: AttendanceDocument): AttendanceDocument {
	Object.freeze(document.recipient);
	Object.freeze(document.paragraphs);
	Object.freeze(document.signature);
	return Object.freeze(document);
}

function expectComplete(pages: PdfPage[], document: AttendanceDocument): void {
	expectLetterText(pages, document);
	expectAssets(pages);
	expectReadable(pages);
	expectIntactSignature(pages, document);
}

describe('attendance PDF generation', () => {
	for (const language of ['en', 'es'] as const) {
		test(`${language} renders a one-page Letter PDF with all supplied copy, accents, and both embedded images`, async () => {
			const document = makeDocument(language);
			const original = structuredClone(document);
			freezeDocument(document);
			const bytes = await generateAttendancePdf(document);
			expect(Buffer.isBuffer(bytes)).toBe(true);
			expect(bytes.toString('latin1')).toContain(`/Lang (${language})`);
			const pages = readPdf(bytes);
			expect(pages).toHaveLength(1);
			expectComplete(pages, document);
			expect(document).toEqual(original);
			const recipient = document.recipient.map((value) => renderedBlock(pages, value)[0]);
			expect(recipient[0].font).toBe('Times-Bold');
			expect(recipient[0].baseline).toBeLessThan(recipient[1].baseline);
			expect(recipient[1].baseline).toBeLessThan(recipient[2].baseline);
			expect(recipient[2].baseline).toBeLessThan(renderedBlock(pages, document.paragraphs[0])[0].baseline);
		});

		test(`${language} preserves long accented recipient names and unbroken surnames across branded numbered pages`, async () => {
			const document = makeDocument(language);
			document.recipient[0] = 'Úrsula José María Muñoz '.repeat(300) + 'ÁlvarezÑandú'.repeat(250) + ' ÚltimoApellidoÓ';
			const original = structuredClone(document);
			freezeDocument(document);
			const pages = readPdf(await generateAttendancePdf(document));
			expect(pages.length).toBeGreaterThan(3);
			expect(new Set(renderedBlock(pages, document.recipient[0]).map(({ page }) => page)).size).toBeGreaterThan(2);
			expectComplete(pages, document);
			expect(document).toEqual(original);
		});

		test(`${language} splits an oversized body paragraph without clipping, overlapping, or dropping characters`, async () => {
			const document = makeDocument(language);
			document.paragraphs[2] = Array.from({ length: 300 }, (_, index) =>
				`Sección ${String(index).padStart(3, '0')}: José Muñoz confirmó su participación, preparación y compromiso.`).join(' ')
				+ ' InicioNombreÑ' + 'ÁÉÍÓÚÜÑ'.repeat(320) + 'FinNombreÑ. Última oración íntegra.';
			const pages = readPdf(await generateAttendancePdf(freezeDocument(document)));
			expect(pages.length).toBeGreaterThan(5);
			expect(new Set(renderedBlock(pages, document.paragraphs[2]).map(({ page }) => page)).size).toBeGreaterThan(5);
			expectComplete(pages, document);
		});
	}

	test('uses the supplied snapshot verbatim rather than inferring dates, issuer, language-specific copy, or other content', async () => {
		const document = makeDocument('en');
		document.title = 'Título recibido — versión extraordinaria';
		document.issuedDate = 'Fecha recibida: 31 de diciembre de 2041';
		document.recipient = ['Destinataria Ñandú', 'Puesto recibido', 'Institución recibida'];
		document.paragraphs = [
			'Primera cláusula recibida: ÁÉÍÓÚÜÑ áéíóúüñ ¿Aceptación? ¡Sí!',
			'Segunda cláusula: horario excepcional conservado.',
			'Tercera cláusula: ninguna fecha ni decisión calculada.',
			'Cuarta cláusula recibida: número 987654321.',
			'Quinta cláusula recibida: contenido final íntegro.'
		];
		document.signature = { name: 'Érika Peña, Emisora', role: 'Entidad recibida', phone: '+1 (787) 555-0199', email: 'issuer@example.org' };
		document.pageLabel = 'Hoja recibida';
		document.filename = 'snapshot-preserved.pdf';
		const original = structuredClone(document);
		const pages = readPdf(await generateAttendancePdf(freezeDocument(document)));
		expectComplete(pages, document);
		expect(document).toEqual(original);
	});

	test('moves the image and entire multi-line issuer block to a fresh page when the body leaves too little space', async () => {
		const document = makeDocument('es');
		document.paragraphs = Array.from({ length: 5 }, (_, index) => `Párrafo ${index}: ` + 'Participación confirmada. '.repeat(12));
		document.signature.name = 'ClaudyMenéndezÑ'.repeat(14);
		document.signature.role = 'Representación institucional y coordinación académica '.repeat(3);
		const pages = readPdf(await generateAttendancePdf(document));
		expect(pages).toHaveLength(2);
		const lastParagraph = renderedBlock(pages, document.paragraphs.at(-1)!);
		expect(new Set(lastParagraph.map(({ page }) => page))).toEqual(new Set([0]));
		expect(new Set(renderedBlock(pages, document.signature.name).map(({ page }) => page))).toEqual(new Set([1]));
		expectComplete(pages, document);
	});

	test('widens an unusually long issuer to keep the entire signature block intact at readable size', async () => {
		const document = makeDocument('es');
		document.signature.name = 'EmisoraÑ'.repeat(75);
		document.signature.role = 'CoordinaciónAcadémicaÉ'.repeat(60);
		document.signature.phone = 'Teléfono confirmado: (939) 408-0440';
		document.signature.email = 'issuer-with-a-long-address@example.org';
		const pages = readPdf(await generateAttendancePdf(document));
		expect(pages.length).toBeGreaterThan(1);
		const name = renderedBlock(pages, document.signature.name);
		expect(Math.min(...name.map(({ x }) => x))).toBeLessThan(288);
		for (const line of name) expect(line.size).toBe(11.5);
		expectComplete(pages, document);
	});

	test('flows an oversized date and heading as content while preserving long translated footer labels', async () => {
		const document = makeDocument('es');
		document.issuedDate = 'Fecha de emisión Ñ: ' + 'áéíóúüñ'.repeat(500);
		document.title = 'Título de certificación: ' + 'AsistenciaAcadémicaÉ'.repeat(250);
		document.pageLabel = 'Página del documento de certificación de asistencia académica '.repeat(3);
		const pages = readPdf(await generateAttendancePdf(document));
		expect(pages.length).toBeGreaterThan(3);
		expect(new Set(renderedBlock(pages, document.issuedDate).map(({ page }) => page)).size).toBeGreaterThan(1);
		expectComplete(pages, document);
	});

	test('keeps ordinary paragraphs whole when they fit on a fresh page', async () => {
		const document = makeDocument('en');
		document.paragraphs = Array.from({ length: 22 }, (_, index) =>
			`Paragraph ${String(index).padStart(2, '0')}: ` + 'Confirmed attendance and professional preparation. '.repeat(6));
		const pages = readPdf(await generateAttendancePdf(document));
		expect(pages.length).toBeGreaterThan(3);
		for (const paragraph of document.paragraphs) {
			expect(new Set(renderedBlock(pages, paragraph).map(({ page }) => page)).size).toBe(1);
		}
		expectComplete(pages, document);
	});

	test('does not strand the first line of an oversized paragraph at the bottom of an earlier page', async () => {
		const document = makeDocument('es');
		document.title = '';
		document.recipient = [];
		document.paragraphs = [
			Array.from({ length: 37 }, (_, index) => `Línea inicial ${index}: asistencia confirmada.`).join('\n'),
			Array.from({ length: 80 }, (_, index) => `Línea extensa ${index}: preparación íntegra.`).join('\n')
		];
		const pages = readPdf(await generateAttendancePdf(document));
		expect(renderedBlock(pages, document.paragraphs[1])[0].page).toBe(1);
		expectComplete(pages, document);
	});

	test('rejects a physically impossible intact signature instead of clipping it or silently dropping text', async () => {
		const document = makeDocument('es');
		document.signature.name = 'EmisoraÑ'.repeat(1200);
		await expect(generateAttendancePdf(freezeDocument(document)))
			.rejects.toThrow('signature block is too tall to fit intact');
	});

	test('rejects a footer label that leaves no usable content area instead of looping or clipping', async () => {
		const document = makeDocument('es');
		document.pageLabel = 'PáginaÑ'.repeat(1600);
		await expect(generateAttendancePdf(freezeDocument(document)))
			.rejects.toThrow('page label leaves no space');
	});
});
