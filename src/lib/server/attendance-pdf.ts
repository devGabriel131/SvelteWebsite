import { Buffer } from 'node:buffer';
import PDFDocument from 'pdfkit';
import logo from '../../../static/logo.png?inline';
import signature from './assets/attendance-signature.png?inline';
import type { AttendanceDocument } from '../attendance/presentation';

const pageWidth = 612;
const pageHeight = 792;
const margin = 54;
const contentWidth = pageWidth - margin * 2;
const contentTop = 148;
const contentBottom = pageHeight - margin;
const ink = '#252C30';
const muted = '#60716F';
const brandColor = '#70959D';

type TextStyle = {
	font: 'Times-Roman' | 'Times-Bold' | 'Times-Italic' | 'Helvetica' | 'Helvetica-Bold';
	size: number;
	color: string;
};
type TextLine = TextStyle & { text: string };
const body: TextStyle = { font: 'Times-Roman', size: 11.5, color: ink };
const small: TextStyle = { font: 'Helvetica', size: 10, color: muted };


function renderDocument(doc: PDFKit.PDFDocument, document: AttendanceDocument): void {
	let y = contentTop;


	function wrap(text: string, width: number, style: TextStyle): TextLine[] {
		doc.font(style.font).fontSize(style.size);
		const lines: TextLine[] = [];
		const push = (text: string) => lines.push({ ...style, text });
		for (const paragraph of text.split(/\r\n|\r|\n/)) {
			let line = '';
			for (const word of paragraph.split(/\s+/).filter(Boolean)) {
				const candidate = line ? `${line} ${word}` : word;
				if (doc.widthOfString(candidate) <= width) {
					line = candidate;
					continue;
				}
				if (line) push(line);
				line = '';
				// Break oversized words by character, without inserting hyphens or dropping text.
				for (const character of word) {
					if (line && doc.widthOfString(line + character) > width) {
						push(line);
						line = '';
					}
					line += character;
				}
			}
			push(line);
		}
		return lines;
	}

	function drawLine(line: TextLine, top: number, rightAligned = false): void {
		doc.font(line.font).fontSize(line.size).fillColor(line.color);
		const x = rightAligned ? pageWidth - margin - doc.widthOfString(line.text) : margin;
		// Positioned single lines must not trigger PDFKit's automatic page flow.
		doc.text(line.text, x, top, { lineBreak: false });
	}

	const dateLines = wrap(document.issuedDate, contentWidth - 88, small);
	const dateInHeader = dateLines.length * 13 <= 64;

	function newPage(): void {
		doc.addPage();

		// Vite bundles both assets as data URIs; Bun's test runner resolves them to files.
		doc.image(logo, pageWidth - margin - 64, margin, { width: 64, height: 64 });
		if (dateInHeader) {
			const top = margin + (64 - dateLines.length * 13) / 2;
			dateLines.forEach((line, index) => drawLine(line, top + index * 13));
		}
		doc.strokeColor(brandColor).lineWidth(1)
			.moveTo(margin, 130).lineTo(pageWidth - margin, 130).stroke();

		y = contentTop;
	}

	function writeBlock(lines: TextLine[], leading: number): void {
		const height = lines.length * leading;
		// Keep ordinary blocks together; only a block taller than a fresh page is split.
		if (height > contentBottom - y && height <= contentBottom - contentTop && y > contentTop) {
			newPage();
		}
		let offset = 0;
		while (offset < lines.length) {
			let capacity = Math.floor((contentBottom - y) / leading);
			const remaining = lines.length - offset;
			// Do not strand the first line of an oversized block below earlier content.
			if (capacity < 1 || (capacity === 1 && remaining > 1 && y > contentTop)) {
				newPage();
				continue;
			}
			// Avoid a solitary final line when splitting an oversized paragraph.
			if (remaining > capacity && remaining - capacity === 1 && capacity > 2) capacity--;
			const count = Math.min(remaining, capacity);
			for (let index = 0; index < count; index++) drawLine(lines[offset + index], y + index * leading);
			y += count * leading;
			offset += count;
			if (offset < lines.length) newPage();
		}
	}

	newPage();
	if (!dateInHeader) {
		writeBlock(dateLines, 13);
		y += 16;
	}
	if (document.title) {
		writeBlock(wrap(document.title, contentWidth, { font: 'Helvetica-Bold', size: 13, color: ink }), 18);
		y += 16;
	}
	const recipient = document.recipient.flatMap((text, index) =>
		wrap(text, contentWidth, { ...body, font: index === 0 ? 'Times-Bold' : 'Times-Roman' }));
	if (recipient.length) {
		writeBlock(recipient, 14);
		y += 18;
	}
	for (const [index, paragraph] of document.paragraphs.entries()) {
		if (index) y += 9;
		writeBlock(wrap(paragraph, contentWidth, body), 15);
	}

	const signatureWidth = 270;
	const imageWidth = 156;
	const imageHeight = imageWidth * 154 / 512;
	const imageGap = 4;
	const leading = 14;
	function signatureLines(width: number): TextLine[] {
		return [
			...wrap(document.signature.name, width, { ...body, font: 'Times-Bold' }),
			...wrap(document.signature.role, width, { ...body, font: 'Times-Italic', size: 10.5, color: muted }),
			...wrap(document.signature.phone, width, { ...body, size: 10.5, color: muted }),
			...wrap(document.signature.email, width, { ...body, size: 10.5, color: muted })
		];
	}
	let lines = signatureLines(signatureWidth);
	let height = imageHeight + imageGap + lines.length * leading;
	// An unusually long issuer can use the full letter width, but must remain a single block.
	if (height > contentBottom - contentTop) {
		lines = signatureLines(contentWidth);
		height = imageHeight + imageGap + lines.length * leading;
	}
	y += 18;
	if (height > contentBottom - y) newPage();
	if (height > contentBottom - contentTop) {
		throw new RangeError('Attendance signature block is too tall to fit intact on a Letter page.');
	}
	// Keep the complete signature block low on the final page, within the bottom margin.
	y = contentBottom - height;
	doc.image(signature, pageWidth - margin - imageWidth, y, { width: imageWidth, height: imageHeight });
	y += imageHeight + imageGap;
	for (const line of lines) {
		drawLine(line, y, true);
		y += leading;
	}
}

/** Render an already-presented, immutable attendance snapshot without deriving letter content. */
export function generateAttendancePdf(document: AttendanceDocument): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const doc = new PDFDocument({
			size: 'LETTER', autoFirstPage: false, lang: document.language,
			margins: { top: margin, left: margin, right: margin, bottom: margin },
			info: { Title: document.title, Subject: document.title, Author: document.signature.name,
				Keywords: document.signature.role }
		});
		const chunks: Buffer[] = [];
		doc.on('data', (chunk: Buffer) => chunks.push(chunk));
		doc.once('end', () => resolve(Buffer.concat(chunks)));
		doc.once('error', reject);
		try {
			renderDocument(doc, document);
			doc.end();
		} catch (error) {
			doc.destroy();
			reject(error);
		}
	});
}
