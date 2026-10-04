import { Buffer } from 'node:buffer';
import PDFDocument from 'pdfkit';
import type { IstReport } from '../ist/presentation';
import type { Grade } from '../ist/types';

const margin = 42;
const pageWidth = 612;
const pageHeight = 792;
const contentWidth = pageWidth - margin * 2;
const contentBottom = pageHeight - 56;
const columnWidths = [99, 90, 186, 77, 76];
const ink = '#172D3B';
const muted = '#52616B';
const gradeColors: Record<Grade, string> = {
	green: '#17633D', yellow: '#795600', red: '#A32932'
};

type TextStyle = { font: 'Helvetica' | 'Helvetica-Bold'; size: number; color: string };
type TextLine = TextStyle & { text: string };
type Cell = { width: number; lines: TextLine[] };
const body: TextStyle = { font: 'Helvetica', size: 10, color: ink };
const tableBody: TextStyle = { ...body, size: 9 };

function renderReport(doc: PDFKit.PDFDocument, report: IstReport): void {
	let y = margin;
	let pageNumber = 0;
	const padding = 6;
	const tableLineHeight = 12;

	function wrap(text: string, width: number, style: TextStyle): TextLine[] {
		doc.font(style.font).fontSize(style.size);
		const lines: TextLine[] = [];
		const push = (text: string) => lines.push({ ...style, text });
		// Measure with the same font used to draw. Long words are split, never truncated.
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
		// Explicit single lines prevent PDFKit's automatic flow from moving a cell or footer.
		doc.font(line.font).fontSize(line.size).fillColor(line.color)
			.text(line.text, x, top, { lineBreak: false });
	}

	function newPage(table = false): void {
		doc.addPage();
		pageNumber++;
		y = margin;
		const footer = `${report.pageLabel} ${pageNumber}`;
		doc.strokeColor('#D9E1E5').lineWidth(0.5)
			.moveTo(margin, 748).lineTo(pageWidth - margin, 748).stroke();
		doc.font('Helvetica').fontSize(8.5);
		drawLine({ ...body, size: 8.5, color: muted, text: footer },
			pageWidth - margin - doc.widthOfString(footer), 756);
		if (pageNumber > 1) {
			const title = wrap(report.title, contentWidth, { ...body, font: 'Helvetica-Bold', size: 14 });
			writeBlock([{ width: contentWidth, lines: title }], 18, 0);
			y += 12;
		}
		if (table) drawTableHeader();
	}

	function blockHeight(cells: Cell[], lineHeight: number, inset: number): number {
		return Math.max(1, ...cells.map((cell) => cell.lines.length)) * lineHeight + inset * 2;
	}

	function drawFragment(cells: Cell[], offset: number, count: number, lineHeight: number,
		inset: number, table: boolean, shaded: boolean): void {
		const height = count * lineHeight + inset * 2;
		if (table) {
			doc.rect(margin, y, contentWidth, height).fill(shaded ? '#F3F6F8' : '#FFFFFF');
			doc.strokeColor('#D9E1E5').lineWidth(0.5)
				.moveTo(margin, y + height).lineTo(pageWidth - margin, y + height).stroke();
		}
		let x = margin;
		for (const cell of cells) {
			for (let index = 0; index < count; index++) {
				const line = cell.lines[offset + index];
				if (line) drawLine(line, x + inset, y + inset + index * lineHeight);
			}
			x += cell.width;
		}
		y += height;
	}

	function writeBlock(cells: Cell[], lineHeight: number, inset: number,
		table = false, shaded = false): void {
		const totalLines = Math.max(1, ...cells.map((cell) => cell.lines.length));
		const height = blockHeight(cells, lineHeight, inset);
		// Keep a normal detail/row/summary together; an oversized block flows in aligned fragments.
		if (height > contentBottom - y && height <= contentBottom - freshContentTop(table)
			&& y > freshContentTop(table)) newPage(table);
		let offset = 0;
		while (offset < totalLines) {
			const capacity = Math.floor((contentBottom - y - inset * 2) / lineHeight);
			if (capacity < 1) {
				newPage(table);
				continue;
			}
			const count = Math.min(totalLines - offset, capacity);
			drawFragment(cells, offset, count, lineHeight, inset, table, shaded);
			offset += count;
			if (offset < totalLines) newPage(table);
		}
	}

	const headers = [report.columns.category, report.columns.result, report.columns.thresholds,
		report.columns.grade, report.columns.outcome].map((label, index) => ({
		width: columnWidths[index],
		lines: wrap(label, columnWidths[index] - padding * 2,
			{ ...tableBody, font: 'Helvetica-Bold', color: '#FFFFFF' })
	}));
	const headerHeight = blockHeight(headers, tableLineHeight, padding);
	const continuationTitleHeight = wrap(report.title, contentWidth,
		{ ...body, font: 'Helvetica-Bold', size: 14 }).length * 18 + 12;

	function freshContentTop(table: boolean): number {
		return margin + continuationTitleHeight + (table ? headerHeight : 0);
	}

	function drawTableHeader(): void {
		doc.rect(margin, y, contentWidth, headerHeight).fill(ink);
		drawFragment(headers, 0, Math.max(...headers.map((cell) => cell.lines.length)),
			tableLineHeight, padding, false, false);
	}

	newPage();
	writeBlock([{ width: contentWidth, lines: wrap(report.title, contentWidth,
		{ ...body, font: 'Helvetica-Bold', size: 22 }) }], 27, 0);
	y += 5;
	writeBlock([{ width: contentWidth, lines: wrap(report.subtitle, contentWidth,
		{ ...body, color: muted }) }], 14, 0);
	y += 14;

	for (const detail of report.details) {
		writeBlock([
			{ width: 180, lines: wrap(detail.label, 174, { ...body, font: 'Helvetica-Bold', size: 9 }) },
			{ width: contentWidth - 180, lines: wrap(detail.value, contentWidth - 186, body) }
		], 14, 3);
	}
	y += 14;

	const rows = report.rows.map((row) => {
		const values = [row.label, row.result, row.thresholds.join('\n'), row.gradeLabel, row.outcome];
		return values.map((value, index) => ({
			width: columnWidths[index],
			lines: wrap(value, columnWidths[index] - padding * 2, index >= 3
				? { ...tableBody, font: 'Helvetica-Bold', color: gradeColors[row.grade] }
				: tableBody)
		}));
	});
	const summary: Cell[] = [{
		width: contentWidth,
		lines: [
			...wrap(report.overallLabel, contentWidth, { ...body, font: 'Helvetica-Bold' }),
			...wrap(report.overall, contentWidth,
				{ ...body, font: 'Helvetica-Bold', size: 12, color: gradeColors[report.passed ? 'green' : 'red'] }),
			{ ...body, text: '' },
			...wrap(report.belowBaselineLabel, contentWidth, { ...body, font: 'Helvetica-Bold' }),
			...wrap(report.belowBaseline, contentWidth, body),
			{ ...body, text: '' },
			...wrap(report.disclaimer, contentWidth, { ...body, size: 9, color: muted })
		]
	}];
	const summaryGap = 16;
	const summaryHeight = blockHeight(summary, 14, 0);
	const firstRowHeight = rows.length ? blockHeight(rows[0], tableLineHeight, padding) : 0;
	const singleRowWithSummary = firstRowHeight + summaryGap + summaryHeight;
	const firstRowSpace = rows.length === 1 && singleRowWithSummary <= contentBottom - freshContentTop(true)
		? singleRowWithSummary
		: firstRowHeight <= contentBottom - freshContentTop(true) ? firstRowHeight : tableLineHeight + padding * 2;
	if (headerHeight + firstRowSpace > contentBottom - y) newPage();
	drawTableHeader();
	for (const [index, cells] of rows.entries()) {
		const height = blockHeight(cells, tableLineHeight, padding);
		const withSummary = height + summaryGap + summaryHeight;
		// Carry the last row with the summary when both fit on a fresh table page.
		if (index === rows.length - 1 && withSummary > contentBottom - y
			&& withSummary <= contentBottom - freshContentTop(true)) newPage(true);
		writeBlock(cells, tableLineHeight, padding, true, index % 2 === 0);
	}
	y += summaryGap;
	writeBlock(summary, 14, 0);
}

/** Render the same already-presented snapshot used by the report view, without reassessing it. */
export function generateIstPdf(report: IstReport): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const doc = new PDFDocument({
			size: 'LETTER', autoFirstPage: false,
			margins: { top: margin, left: margin, right: margin, bottom: pageHeight - contentBottom },
			info: { Title: report.title, Subject: report.subtitle }
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
