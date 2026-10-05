import { Buffer } from 'node:buffer';
import PDFDocument from 'pdfkit';
import logo from '../../../static/logo.png?inline';
import type { IstReport } from '../ist/presentation';
import type { Grade } from '../ist/types';

const margin = 42;
const pageWidth = 612;
const pageHeight = 792;
const contentWidth = pageWidth - margin * 2;
const contentBottom = pageHeight - 56;
const cardWidths = [164, 230, 134];
const ink = '#252C30';
const muted = '#60716F';
const brandColor = '#70959D';
const border = '#DDE5E2';
const gradeColors: Record<Grade, string> = {
	green: '#17633D', yellow: '#795600', red: '#A32932'
};
const gradeBackgrounds: Record<Grade, string> = {
	green: '#EAF4ED', yellow: '#FCF3DC', red: '#FBEDEE'
};

type TextStyle = { font: 'Helvetica' | 'Helvetica-Bold'; size: number; color: string };
type TextLine = TextStyle & { text: string };
type Cell = { width: number; lines: TextLine[] };
type BlockStyle = {
	kind: 'detail' | 'summary' | 'card' | 'header' | 'disclaimer';
	grade?: Grade;
	badgeLines?: number;
};
const body: TextStyle = { font: 'Helvetica', size: 10, color: ink };
const label: TextStyle = { ...body, font: 'Helvetica-Bold', size: 8, color: muted };
const cardBody: TextStyle = { ...body, size: 9 };

function renderReport(doc: PDFKit.PDFDocument, report: IstReport): void {
	let y = margin;

	const horizontalInset = 12;
	const cardLineHeight = 12.5;

	function wrap(text: string, width: number, style: TextStyle): TextLine[] {
		doc.font(style.font).fontSize(style.size);
		const lines: TextLine[] = [];
		const push = (text: string) => lines.push({ ...style, text });
		// Measure with the drawing font; even unbroken names flow without truncation.
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

	function drawLine(line: TextLine, x: number, top: number): void {
		// Explicit single lines keep PDFKit's automatic flow out of positioned content.
		doc.font(line.font).fontSize(line.size).fillColor(line.color)
			.text(line.text, x, top, { lineBreak: false });
	}

	const headerX = margin;
	const headerWidth = contentWidth - 80;
	const masthead = [
		{ lines: wrap(report.brand, headerWidth, { ...body, font: 'Helvetica-Bold', size: 11 }), leading: 14 },
		{ lines: wrap(report.brandDescription, headerWidth, { ...body, size: 8.5, color: muted }), leading: 15 },
		{ lines: wrap(report.title, headerWidth, { ...body, font: 'Helvetica-Bold', size: 20 }), leading: 26 },
		{ lines: wrap(report.subtitle, headerWidth, { ...body, size: 8.5, color: muted }), leading: 11 }
	];
	const contentTop = margin + Math.max(64, masthead.reduce((height, block) =>
		height + block.lines.length * block.leading, 0)) + 30;
	const headers: Cell[] = [
		`${report.columns.category} · ${report.columns.result}`,
		report.columns.thresholds,
		`${report.columns.grade} · ${report.columns.outcome}`
	].map((text, index) => ({
		width: cardWidths[index],
		lines: wrap(text, cardWidths[index] - horizontalInset * 2, label)
	}));
	const headerHeight = blockHeight(headers, 11, 5);

	function newPage(cards = false): void {
		doc.addPage();
		// Vite embeds this static asset as a data URI; Bun resolves the same import to a file.
		doc.image(logo, pageWidth - margin - 64, margin, { width: 64, height: 64 });
		let top = margin;
		for (const block of masthead) {
			for (const line of block.lines) {
				drawLine(line, headerX, top);
				top += block.leading;
			}
		}
		doc.strokeColor(brandColor).lineWidth(1)
			.moveTo(margin, contentTop - 12).lineTo(pageWidth - margin, contentTop - 12).stroke();

		y = contentTop;
		if (cards) drawCardHeader();
	}

	function blockHeight(cells: Cell[], lineHeight: number, inset: number): number {
		return Math.max(1, ...cells.map((cell) => cell.lines.length)) * lineHeight + inset * 2;
	}

	function drawFragment(cells: Cell[], offset: number, count: number, lineHeight: number,
		inset: number, style: BlockStyle): void {
		const height = count * lineHeight + inset * 2;
		const xInset = style.kind === 'disclaimer' ? 0 : horizontalInset;
		if (style.kind === 'detail' || style.kind === 'summary') {
			doc.roundedRect(margin, y, contentWidth, height, 6)
				.fill(style.kind === 'summary' ? gradeBackgrounds[style.grade!] : '#F3F6F5');
		}
		if (style.kind === 'card') {
			doc.roundedRect(margin, y, contentWidth, height, 6)
				.lineWidth(0.5).fillAndStroke('#FFFFFF', border);
			doc.roundedRect(margin, y + 6, 3, height - 12, 1.5).fill(gradeColors[style.grade!]);
			const visibleBadgeLines = Math.max(0, Math.min(count, (style.badgeLines ?? 0) - offset));
			if (visibleBadgeLines) {
				const badgeX = margin + cardWidths[0] + cardWidths[1] + xInset;
				doc.roundedRect(badgeX - 5, y + inset - 3,
					cardWidths[2] - xInset * 2 + 10, visibleBadgeLines * lineHeight + 6, 4)
					.fill(gradeBackgrounds[style.grade!]);
			}
		}
		if (style.kind === 'header' || style.kind === 'disclaimer') {
			const ruleY = style.kind === 'header' ? y + height - 1 : y;
			doc.strokeColor(border).lineWidth(0.5)
				.moveTo(margin, ruleY).lineTo(pageWidth - margin, ruleY).stroke();
		}
		let x = margin;
		for (const cell of cells) {
			for (let index = 0; index < count; index++) {
				const line = cell.lines[offset + index];
				if (line) drawLine(line, x + xInset, y + inset + index * lineHeight);
			}
			x += cell.width;
		}
		y += height;
	}

	function writeBlock(cells: Cell[], lineHeight: number, inset: number, style: BlockStyle): void {
		const cards = style.kind === 'card';
		const freshTop = contentTop + (cards ? headerHeight : 0);
		const totalLines = Math.max(1, ...cells.map((cell) => cell.lines.length));
		const height = blockHeight(cells, lineHeight, inset);
		// Keep ordinary panels/cards intact. Only genuinely oversized content splits into fragments.
		if (height > contentBottom - y && height <= contentBottom - freshTop && y > freshTop) {
			newPage(cards);
		}
		let offset = 0;
		while (offset < totalLines) {
			const capacity = Math.floor((contentBottom - y - inset * 2) / lineHeight);
			if (capacity < 1) {
				newPage(cards);
				continue;
			}
			const count = Math.min(totalLines - offset, capacity);
			drawFragment(cells, offset, count, lineHeight, inset, style);
			offset += count;
			if (offset < totalLines) newPage(cards);
		}
	}

	function drawCardHeader(): void {
		drawFragment(headers, 0, Math.max(...headers.map((cell) => cell.lines.length)),
			11, 5, { kind: 'header' });
	}

	newPage();
	const detailGroups = [report.details.slice(0, 2), report.details.slice(2, 5), report.details.slice(5, 7)];
	for (let index = 7; index < report.details.length; index += 2) {
		detailGroups.push(report.details.slice(index, index + 2));
	}
	for (const [index, details] of detailGroups.entries()) {
		if (!details.length) continue;
		const width = contentWidth / details.length;
		const cells = details.map((detail, column) => ({
			width,
			lines: [
				...wrap(detail.label, width - horizontalInset * 2, label),
				...wrap(detail.value, width - horizontalInset * 2,
					index === 0 ? { ...body, size: column === 0 ? 16 : 9, font: column === 0 ? 'Helvetica-Bold' : 'Helvetica' } : body)
			]
		}));
		writeBlock(cells, index === 0 ? 19 : 12, 6, { kind: 'detail' });
		y += 4;
	}
	y += 8;
	const overallGrade = report.passed ? 'green' : 'red';
	writeBlock([{
		width: contentWidth,
		lines: [
			...wrap(report.overallLabel, contentWidth - horizontalInset * 2, label),
			...wrap(report.overall, contentWidth - horizontalInset * 2,
				{ ...body, font: 'Helvetica-Bold', size: 13, color: gradeColors[overallGrade] }),
			...wrap(report.belowBaselineLabel, contentWidth - horizontalInset * 2, label),
			...wrap(report.belowBaseline, contentWidth - horizontalInset * 2, { ...body, size: 9 })
		]
	}], 13, 8, { kind: 'summary', grade: overallGrade });
	y += 12;

	const cards = report.rows.map((row) => {
		const gradeLines = wrap(row.gradeLabel, cardWidths[2] - horizontalInset * 2,
			{ ...cardBody, font: 'Helvetica-Bold', size: 10, color: gradeColors[row.grade] });
		return {
			grade: row.grade,
			badgeLines: gradeLines.length,
			cells: [
				{ width: cardWidths[0], lines: [
					...wrap(row.label, cardWidths[0] - horizontalInset * 2, { ...cardBody, font: 'Helvetica-Bold', size: 10 }),
					...wrap(row.result, cardWidths[0] - horizontalInset * 2, { ...body, font: 'Helvetica-Bold', size: 12 })
				] },
				{ width: cardWidths[1], lines: wrap(row.thresholds.join('\n'), cardWidths[1] - horizontalInset * 2, cardBody) },
				{ width: cardWidths[2], lines: [
					...gradeLines,
					{ ...cardBody, text: '' },
					...wrap(row.outcome, cardWidths[2] - horizontalInset * 2, { ...cardBody, color: muted })
				] }
			]
		};
	});
	if (cards.length) {
		const firstHeight = blockHeight(cards[0].cells, cardLineHeight, 8);
		// Never leave a header alone at the bottom of a page.
		if (headerHeight + Math.min(firstHeight, cardLineHeight + 16) > contentBottom - y) newPage();
		else if (firstHeight <= contentBottom - contentTop - headerHeight
			&& headerHeight + firstHeight > contentBottom - y) newPage();
		drawCardHeader();
		for (const [index, card] of cards.entries()) {
			if (index) y += 6;
			writeBlock(card.cells, cardLineHeight, 8, { kind: 'card', grade: card.grade, badgeLines: card.badgeLines });
		}
	}
	y += 10;
	writeBlock([{ width: contentWidth, lines: wrap(report.disclaimer, contentWidth,
		{ ...body, size: 8.5, color: muted }) }], 11, 8, { kind: 'disclaimer' });
}

/** Render the same already-presented snapshot used by the report view, without reassessing it. */
export function generateIstPdf(report: IstReport): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const doc = new PDFDocument({
			size: 'LETTER', autoFirstPage: false,
			margins: { top: margin, left: margin, right: margin, bottom: pageHeight - contentBottom },
			info: { Title: report.title, Subject: report.subtitle, Author: `${report.brand} ${report.brandDescription}` }
		});
		const chunks: Buffer[] = [];
		doc.on('data', (chunk: Buffer) => chunks.push(chunk));
		doc.once('end', () => resolve(Buffer.concat(chunks)));
		doc.once('error', reject);
		try {
			renderReport(doc, report);
			doc.end();
		} catch (error) {
			doc.destroy();
			reject(error);
		}
	});
}
