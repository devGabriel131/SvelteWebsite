import { Buffer } from 'node:buffer';
import PDFDocument from 'pdfkit';

export async function renderPdf(
	options: PDFKit.PDFDocumentOptions, draw: (doc: PDFKit.PDFDocument) => void
): Promise<Buffer> {
	const doc = new PDFDocument(options);
	const { promise, resolve, reject } = Promise.withResolvers<Buffer>();
	const chunks: Buffer[] = [];
	const fail = (error: unknown) => {
		// Destruction must never replace the original rendering/source error.
		reject(error);
		try { doc.destroy(); } catch { /* Preserve the original failure. */ }
	};
	doc.on('data', (chunk: Buffer) => chunks.push(chunk));
	doc.once('end', () => resolve(Buffer.concat(chunks)));
	doc.once('error', fail);
	try {
		draw(doc);
		doc.end();
	} catch (error) {
		fail(error);
	}
	return promise;
}

export function wrapWords<S extends { font: string; size: number }>(
	doc: PDFKit.PDFDocument, text: string, width: number, style: S
): Array<S & { text: string }> {
	doc.font(style.font).fontSize(style.size);
	const lines: Array<S & { text: string }> = [];
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
			// Split oversized words without hyphens, truncation, or altered spelling.
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
