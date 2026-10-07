import { Buffer } from 'node:buffer';
import { crc32, deflateSync, inflateSync } from 'node:zlib';

const prefix = 'data:image/png;base64,';
const magic = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const maxBytes = 512 * 1024;
const maxWidth = 600;
const maxHeight = 180;
const maxPixels = maxWidth * maxHeight;
const maxChunks = 128;

function invalid(): never {
	throw new TypeError('Invalid bootcamp signature PNG.');
}

function chunk(type: string, data: Buffer): Buffer {
	const result = Buffer.alloc(data.length + 12);
	result.writeUInt32BE(data.length, 0);
	result.write(type, 4, 4, 'ascii');
	data.copy(result, 8);
	result.writeUInt32BE(crc32(result.subarray(4, -4)), result.length - 4);
	return result;
}

function paeth(a: number, b: number, c: number): number {
	const p = a + b - c;
	const pa = Math.abs(p - a);
	const pb = Math.abs(p - b);
	const pc = Math.abs(p - c);
	return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/**
 * Accept canvas-style, non-interlaced 8-bit RGB/RGBA PNGs, at most 600 × 180
 * and 512 KiB. Decode before checking visible ink; never trust a data-URL prefix.
 * Return an opaque, metadata-free PNG so PDFKit only sees our bounded encoding.
 * This checks that a mark exists, not a person's identity or signature authenticity.
 */
export function validateSignature(value: unknown): string {
	if (typeof value !== 'string' || value.length > prefix.length + 4 * Math.ceil(maxBytes / 3) || !value.startsWith(prefix)) invalid();
	const encoded = value.slice(prefix.length);
	if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) invalid();
	const png = Buffer.from(encoded, 'base64');
	if (png.length > maxBytes || png.toString('base64') !== encoded || !png.subarray(0, 8).equals(magic)) invalid();

	let width = 0;
	let height = 0;
	let channels = 0;
	let ended = false;
	let dataEnded = false;
	let palette = false;
	let count = 0;
	const compressed: Buffer[] = [];
	for (let offset = 8; offset < png.length;) {
		if (++count > maxChunks || offset + 12 > png.length) invalid();
		const length = png.readUInt32BE(offset);
		const end = offset + 12 + length;
		if (end > png.length) invalid();
		const type = png.toString('ascii', offset + 4, offset + 8);
		// ASCII conversion masks high bits, so validate the original chunk-name bytes too.
		const name = png.subarray(offset + 4, offset + 8);
		if ([...name].some((byte) => !(byte >= 65 && byte <= 90) && !(byte >= 97 && byte <= 122)) || (name[2] & 32)) invalid();
		if (crc32(png.subarray(offset + 4, end - 4)) !== png.readUInt32BE(end - 4)) invalid();
		const data = png.subarray(offset + 8, end - 4);
		if (count === 1 && type !== 'IHDR') invalid();
		if (compressed.length && type !== 'IDAT') dataEnded = true;
		switch (type) {
			case 'IHDR':
				if (count !== 1 || length !== 13) invalid();
				width = data.readUInt32BE(0);
				height = data.readUInt32BE(4);
				if (!width || !height || width > maxWidth || height > maxHeight || width * height > maxPixels) invalid();
				if (data[8] !== 8 || (data[9] !== 2 && data[9] !== 6) || data[10] !== 0 || data[11] !== 0 || data[12] !== 0) invalid();
				channels = data[9] === 2 ? 3 : 4;
				break;
			case 'PLTE':
				if (palette || compressed.length || !length || length > 768 || length % 3 !== 0) invalid();
				palette = true;
				break;
			case 'IDAT':
				if (dataEnded) invalid();
				compressed.push(data);
				break;
			case 'IEND':
				if (length || !compressed.length || end !== png.length) invalid();
				ended = true;
				break;
			default:
				// No APNG or color-key transparency: neither belongs to the canvas contract.
				if (!(name[0] & 32) || ['acTL', 'fcTL', 'fdAT', 'tRNS'].includes(type)) invalid();
				// Other ancillary metadata is checksum-checked, never interpreted or inflated.
		}
		offset = end;
	}
	if (!ended) invalid();
	const stride = width * channels;
	const expectedBytes = (stride + 1) * height;
	let raw: Buffer;
	try {
		const input = Buffer.concat(compressed);
		// Node's types omit the documented { info: true } result overload.
				const result = inflateSync(input, { maxOutputLength: expectedBytes, info: true }) as unknown as {
					buffer: Buffer; engine: { bytesWritten: number };
				};
		// zlib permits trailing bytes by default; a PNG has exactly one complete zlib stream.
		if (result.buffer.length !== expectedBytes || result.engine.bytesWritten !== input.length) invalid();
		raw = result.buffer;
	} catch {
		invalid();
	}

	const pixels = Buffer.alloc(stride * height);
	const rgbStride = width * 3;
	const normalized = Buffer.alloc((rgbStride + 1) * height);
	let inkPixels = 0;
	let lightPixels = 0;
	for (let y = 0; y < height; y++) {
		const filter = raw[y * (stride + 1)];
		if (filter > 4) invalid();
		for (let x = 0; x < stride; x++) {
			const index = y * stride + x;
			const left = x >= channels ? pixels[index - channels] : 0;
			const up = y ? pixels[index - stride] : 0;
			const upperLeft = y && x >= channels ? pixels[index - stride - channels] : 0;
			const prediction = [0, left, up, Math.floor((left + up) / 2), paeth(left, up, upperLeft)][filter];
			pixels[index] = (raw[y * (stride + 1) + x + 1] + prediction) & 255;
		}
		for (let x = 0; x < width; x++) {
			const source = y * stride + x * channels;
			const target = y * (rgbStride + 1) + 1 + x * 3;
			const alpha = channels === 4 ? pixels[source + 3] : 255;
			for (let color = 0; color < 3; color++) {
				normalized[target + color] = Math.round((pixels[source + color] * alpha + 255 * (255 - alpha)) / 255);
			}
			const r = normalized[target];
			const g = normalized[target + 1];
			const b = normalized[target + 2];
			if (r <= 160 && g <= 160 && b <= 160) inkPixels++;
			if (r >= 240 && g >= 240 && b >= 240) lightPixels++;
		}
	}
	// Ignore single-pixel accidents and fully uniform fills, including invisible black in transparent PNGs.
	if (inkPixels < 16 || lightPixels < 16) invalid();
	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header[8] = 8;
	header[9] = 2;
	return prefix + Buffer.concat([magic, chunk('IHDR', header), chunk('IDAT', deflateSync(normalized)), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}
