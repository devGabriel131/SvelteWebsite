import { describe, expect, test } from 'bun:test';
import { crc32, deflateSync, inflateSync } from 'node:zlib';
import { validateSignature } from '../src/lib/server/bootcamp/signatures';

const magic = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const prefix = 'data:image/png;base64,';
const url = (png: Buffer) => prefix + png.toString('base64');
function chunk(type: string, data = Buffer.alloc(0)): Buffer {
	const size = Buffer.alloc(4);
	size.writeUInt32BE(data.length);
	const body = Buffer.concat([Buffer.from(type), data]);
	const checksum = Buffer.alloc(4);
	checksum.writeUInt32BE(crc32(body));
	return Buffer.concat([size, body, checksum]);
}
function header(width = 600, height = 180, color = 6, depth = 8, interlace = 0): Buffer {
	const data = Buffer.alloc(13);
	data.writeUInt32BE(width, 0);
	data.writeUInt32BE(height, 4);
	data[8] = depth;
	data[9] = color;
	data[12] = interlace;
	return chunk('IHDR', data);
}
function assemble(...chunks: Buffer[]): Buffer {
	return Buffer.concat([magic, ...chunks]);
}
function paeth(a: number, b: number, c: number): number {
	const distances = [a, b, c].map((value) => Math.abs(a + b - c - value));
	return [a, b, c][distances.indexOf(Math.min(...distances))];
}
function canvas(options: { width?: number; height?: number; channels?: 3 | 4; filter?: number; background?: number; alpha?: number; marks?: number } = {}) {
	const { width = 600, height = 180, channels = 4, filter = 0, background = 255, alpha = 255, marks = 180 } = options;
	const pixels = Buffer.alloc(width * height * channels, background);
	for (let pixel = 0; pixel < width * height; pixel++) {
		if (channels === 4) pixels[pixel * channels + 3] = alpha;
		if (pixel >= width * 10 + 10 && pixel < width * 10 + 10 + marks) pixels.fill(0, pixel * channels, pixel * channels + 3);
	}
	const stride = width * channels;
	const raw = Buffer.alloc((stride + 1) * height);
	for (let y = 0; y < height; y++) {
		raw[y * (stride + 1)] = filter;
		for (let x = 0; x < stride; x++) {
			const index = y * stride + x;
			const a = x < channels ? 0 : pixels[index - channels];
			const b = y === 0 ? 0 : pixels[index - stride];
			const c = y === 0 || x < channels ? 0 : pixels[index - stride - channels];
			const prediction = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter] ?? 0;
			raw[y * (stride + 1) + x + 1] = (pixels[index] - prediction + 256) % 256;
		}
	}
	const ihdr = header(width, height, channels === 3 ? 2 : 6);
	const compressed = deflateSync(raw);
	return { raw, pixels, ihdr, compressed, png: assemble(ihdr, chunk('IDAT', compressed), chunk('IEND')) };
}
function decodedNormalized(value: string): Buffer {
	const png = Buffer.from(value.slice(prefix.length), 'base64');
	expect(png[25]).toBe(2);
	const compressed: Buffer[] = [];
	const types: string[] = [];
	for (let offset = 8; offset < png.length;) {
		const size = png.readUInt32BE(offset);
		const type = png.toString('ascii', offset + 4, offset + 8);
		types.push(type);
		expect(png.readUInt32BE(offset + size + 8)).toBe(crc32(png.subarray(offset + 4, offset + size + 8)));
		if (type === 'IDAT') compressed.push(png.subarray(offset + 8, offset + 8 + size));
		offset += size + 12;
	}
	expect(types).toEqual(['IHDR', 'IDAT', 'IEND']);
	return inflateSync(Buffer.concat(compressed));
}

describe('bounded bootcamp signature PNG validation', () => {
	for (const channels of [3, 4] as const) {
		for (const filter of [0, 1, 2, 3, 4]) {
			test(`decodes ${channels === 3 ? 'RGB' : 'RGBA'} canvas PNG filter ${filter}, preserving every pixel`, () => {
				const fixture = canvas({ channels, filter });
				const result = validateSignature(url(fixture.png));
				const expected = canvas({ channels: 3 }).raw;
				expect(decodedNormalized(result)).toEqual(expected);
				expect(validateSignature(result)).toBe(result);
			});
		}
	}

	test('accepts bounded smaller canvases, consecutive IDAT chunks, and strips ancillary metadata', () => {
		const { ihdr, compressed } = canvas({ width: 120, height: 40 });
		const split = Math.floor(compressed.length / 2);
		const png = assemble(ihdr, chunk('tEXt', Buffer.from('Comment\0not copied to documents')),
			chunk('IDAT', compressed.subarray(0, split)), chunk('IDAT', compressed.subarray(split)), chunk('IEND'));
		const result = validateSignature(url(png));
		expect(decodedNormalized(result)).toEqual(canvas({ width: 120, height: 40, channels: 3 }).raw);
		expect(Buffer.from(result.slice(prefix.length), 'base64').includes(Buffer.from('not copied'))).toBe(false);
	});

	test('composites partially transparent black ink against white', () => {
		const result = decodedNormalized(validateSignature(url(canvas({ alpha: 128 }).png)));
		expect(result[10 * 1801 + 1 + 10 * 3]).toBe(127);
		expect(result[1]).toBe(255);
	});

	for (const [label, options] of [
		['white', { marks: 0 }], ['black', { background: 0 }], ['gray', { background: 100, marks: 0 }],
		['transparent black', { background: 0, alpha: 0 }], ['invisible ink', { alpha: 0 }],
		['nearly invisible ink', { alpha: 10 }], ['a single pixel', { marks: 1 }], ['too few marks', { marks: 15 }]
	] as const) {
		test(`rejects blank or effectively blank image: ${label}`, () => {
			expect(() => validateSignature(url(canvas(options).png))).toThrow(TypeError);
		});
	}

	test('rejects non-string values and malformed/noncanonical/oversized data URLs before decoding', () => {
		const valid = url(canvas().png);
		for (const value of [undefined, null, 1, {}, [], Buffer.from('png'), '', prefix,
			valid.replace('image/png', 'image/jpeg'), valid.replace(';base64', ''), valid.replace('data:', 'DATA:'),
			' ' + valid, valid + '\n', prefix + '!!!!', prefix + 'abcd=', prefix + 'ab=c', prefix + 'A'.repeat(700_000),
			url(Buffer.alloc(512 * 1024 + 1)), url(Buffer.from('not a PNG'))]) {
			expect(() => validateSignature(value)).toThrow(TypeError);
		}
	});

	test('rejects invalid dimensions and unsupported sample formats before inflation', () => {
		for (const ihdr of [header(0), header(601), header(600, 181), header(0xffffffff, 0xffffffff),
			header(600, 180, 6, 16), header(600, 180, 3), header(600, 180, 0), header(600, 180, 6, 8, 1)]) {
			expect(() => validateSignature(url(assemble(ihdr, chunk('IDAT', deflateSync(Buffer.alloc(1))), chunk('IEND'))))).toThrow(TypeError);
		}
	});

	test('rejects corruption, illegal chunk structure, animation, and color-key transparency', () => {
		const { png, ihdr, compressed } = canvas();
		const idat = chunk('IDAT', compressed);
		const iend = chunk('IEND');
		const badChecksum = Buffer.from(png);
		badChecksum[badChecksum.length - 1] ^= 1;
		const badMagic = Buffer.from(png);
		badMagic[0] = 0;
		const excessiveLength = Buffer.from(png);
		excessiveLength.writeUInt32BE(0xffffffff, 33);
		const invalidCompression = Buffer.from(ihdr.subarray(8, -4));
		invalidCompression[10] = 1;
		for (const malformed of [badChecksum, badMagic, excessiveLength, png.subarray(0, -1), png.subarray(0, -12),
			Buffer.concat([png, Buffer.from([0])]), assemble(idat, ihdr, iend), assemble(ihdr, ihdr, idat, iend),
			assemble(chunk('IHDR', Buffer.alloc(12)), idat, iend), assemble(chunk('IHDR', invalidCompression), idat, iend),
			assemble(ihdr, iend), assemble(ihdr, idat, chunk('IEND', Buffer.from([0]))), assemble(ihdr, idat, iend, iend),
			assemble(ihdr, chunk('ABCD'), idat, iend), assemble(ihdr, chunk('abca'), idat, iend),
			assemble(ihdr, chunk('acTL', Buffer.alloc(8)), idat, iend), assemble(ihdr, chunk('tRNS', Buffer.alloc(6)), idat, iend),
			assemble(ihdr, chunk('PLTE', Buffer.alloc(4)), idat, iend), assemble(ihdr, idat, chunk('PLTE', Buffer.alloc(3)), iend),
			assemble(ihdr, chunk('IDAT', compressed.subarray(0, 10)), chunk('tEXt'), chunk('IDAT', compressed.subarray(10)), iend),
			assemble(ihdr, ...Array.from({ length: 130 }, () => chunk('tEXt')), idat, iend)]) {
			expect(() => validateSignature(url(malformed))).toThrow(TypeError);
		}
	});

	test('rejects corrupt, incomplete, excessive, or trailing decompressed data and invalid PNG filters', () => {
		const { ihdr, raw, compressed } = canvas();
		const invalidFilter = Buffer.from(raw);
		invalidFilter[0] = 5;
		for (const data of [Buffer.from('not zlib'), compressed.subarray(0, -1),
			deflateSync(raw.subarray(0, -1)), deflateSync(Buffer.concat([raw, Buffer.from([0])])),
			Buffer.concat([compressed, Buffer.from('trailing')]), Buffer.concat([compressed, compressed]), deflateSync(invalidFilter)]) {
			expect(() => validateSignature(url(assemble(ihdr, chunk('IDAT', data), chunk('IEND'))))).toThrow(TypeError);
		}
	});

	test('caps inflation even when a tiny compressed payload claims a small valid canvas', () => {
		const bomb = deflateSync(Buffer.alloc(8 * 1024 * 1024));
		expect(bomb.length).toBeLessThan(10_000);
		expect(() => validateSignature(url(assemble(header(20, 20), chunk('IDAT', bomb), chunk('IEND'))))).toThrow(TypeError);
	});
});
