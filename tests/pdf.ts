import { expect } from 'bun:test';
import { inflateSync } from 'node:zlib';

export type PdfBounds = { left: number; right: number; top: number; bottom: number };
export type PdfText = { text: string; x: number; baseline: number; size: number; font: string; color: string };
export type PdfImage = { name: string; width: number; height: number; data: Buffer };
export type PdfPage = {
	headerBottom: number; fonts: string[]; texts: PdfText[];
	fills: Array<PdfBounds & { color: string }>; strokes: PdfBounds[]; rules: number[];
	images: PdfImage[]; imageDraws: Array<PdfBounds & { name: string }>;
};
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

function bounds(points: number[][]): PdfBounds {
	return { left: Math.min(...points.map(([x]) => x)), right: Math.max(...points.map(([x]) => x)),
		top: Math.min(...points.map(([, y]) => y)), bottom: Math.max(...points.map(([, y]) => y)) };
}

// Only forms emitted by these PDFKit renderers: standard-font WinAnsi hex text,
// indirect Flate streams, positioned paths and image XObjects. Not a general PDF parser.
export function readPdf(pdf: Buffer): PdfPage[] {
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
		const images = [...(resources.match(/\/XObject\s*<<([\s\S]*?)>>/)?.[1] ?? '').matchAll(/\/(\S+) (\d+) 0 R/g)]
			.map((match) => {
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
		const fills: PdfPage['fills'] = [];
		const strokes: PdfBounds[] = [];
		const rules: number[] = [];
		const imageDraws: PdfPage['imageDraws'] = [];
		const saved: Array<{ matrix: Matrix; color: string }> = [];
		let matrix: Matrix = [1, 0, 0, 1, 0, 0];
		let color = '#000000';
		let points: number[][] = [];
		const point = (x: number, y: number) => [
			matrix[0] * x + matrix[2] * y + matrix[4],
			792 - (matrix[1] * x + matrix[3] * y + matrix[5])
		];
		for (const match of commands.matchAll(/BT\n([\s\S]*?)\nET|([^\n]+)/g)) {
			if (match[1] !== undefined) {
				const position = match[1].match(/1 0 0 1 ([\d.-]+) ([\d.-]+) Tm/)!;
				const font = match[1].match(/\/(F\d+) ([\d.]+) Tf/)!;
				const bytes = Buffer.concat([...match[1].matchAll(/<([\da-f]+)>/gi)]
					.map((hex) => Buffer.from(hex[1], 'hex')));
				texts.push({ text: decoder.decode(bytes), x: Number(position[1]),
					baseline: 792 - Number(position[2]), size: Number(font[2]), font: fonts.get(font[1])!, color });
				continue;
			}
			const command = match[2].trim();
			if (command === 'q') saved.push({ matrix: [...matrix], color });
			if (command === 'Q') ({ matrix, color } = saved.pop()!);
			const rgb = command.match(/^([\d.]+) ([\d.]+) ([\d.]+) scn$/);
			if (rgb) color = '#' + rgb.slice(1).map((channel) =>
				Math.round(Number(channel) * 255).toString(16).padStart(2, '0')).join('');
			const tokens = command.split(/\s+/);
			const operator = tokens.at(-1)!;
			const numbers = tokens.slice(0, -1).map(Number);
			if (operator === 'cm') matrix = multiply(matrix, numbers as Matrix);
			const draw = command.match(/^\/(\S+) Do$/);
			if (draw) imageDraws.push({ name: draw[1], ...bounds([
				point(0, 0), point(0, 1), point(1, 0), point(1, 1)
			]) });
			if (operator === 're') {
				const [x, y, width, height] = numbers;
				points.push(point(x, y), point(x + width, y + height));
			} else if (operator === 'm' || operator === 'l' || operator === 'c') {
				for (let index = 0; index < numbers.length; index += 2) points.push(point(numbers[index], numbers[index + 1]));
			}
			if (points.length) {
				if (['f', 'f*', 'B', 'B*', 'b', 'b*'].includes(operator)) fills.push({ ...bounds(points), color });
				if (['S', 's', 'B', 'B*', 'b', 'b*'].includes(operator)) {
					strokes.push(bounds(points));
					if (points.length === 2 && points[0][1] === points[1][1]) rules.push(points[0][1]);
				}
			}
			if (['f', 'f*', 'B', 'B*', 'b', 'b*', 'S', 's', 'n'].includes(operator)) points = [];
		}
		pages.push({ headerBottom: rules[0] ?? 0, fonts: [...fonts.values()], texts, fills, strokes, rules, images, imageDraws });
	}
	const pageTree = [...objects.values()].find((object) => /\/Type \/Pages\b/.test(object))!;
	expect(Number(pageTree.match(/\/Count (\d+)/)?.[1])).toBe(pages.length);
	expect(pages.length).toBeGreaterThan(0);
	return pages;
}
