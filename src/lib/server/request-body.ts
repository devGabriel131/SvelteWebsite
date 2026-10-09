import { Buffer } from 'node:buffer';

export async function readBoundedBody(reader: ReadableStreamDefaultReader<Uint8Array>, limit: number): Promise<Buffer<ArrayBuffer> | null> {
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) return Buffer.concat(chunks, total);
			total += value.byteLength;
			if (total > limit) {
				await reader.cancel();
				return null;
			}
			chunks.push(value);
		}
	} finally { reader.releaseLock(); }
}
