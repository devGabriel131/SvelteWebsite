import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Student } from '../db/schema';
import type { WaiverSnapshot } from '../../bootcamp/types';
import { BootcampError } from './validation';

export function studentIdentityVersion(student: Student): string {
	return createHash('sha256').update(JSON.stringify([
		student.id, student.firstName, student.lastName, student.email, student.dateOfBirth, student.updatedAt.toISOString()
	])).digest('hex');
}

// A preview is optional and is not a submission. The proof lets a later submission
// reproduce precisely the bytes reviewed, without saving unfinished signatures in the DB.
export function createPreviewProof(secret: string | undefined) {
	function mac(payload: string): Buffer {
		if (!secret || secret.length < 32) throw new BootcampError('unavailable');
		return createHmac('sha256', secret).update(`bootcamp-preview-v1:${payload}`).digest();
	}
	function digest(userId: string, snapshot: WaiverSnapshot, identityVersion: string) {
		return createHash('sha256').update(JSON.stringify({ userId, snapshot, identityVersion })).digest('hex');
	}
	function decode(token: string): { signedAt: string; digest: string } {
		try {
			if (token.length > 1024) throw new Error();
			const [encoded, signature, extra] = token.split('.');
			if (extra !== undefined || !encoded || !signature || !/^[\w-]+$/.test(encoded) || !/^[\w-]+$/.test(signature)) throw new Error();
			const actual = Buffer.from(signature, 'base64url');
			const expected = mac(encoded);
			if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
			const value = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
			if (!value || typeof value.signedAt !== 'string' || !/^[a-f0-9]{64}$/.test(value.digest)) throw new Error();
			const age = Date.now() - Date.parse(value.signedAt);
			if (!Number.isFinite(age) || age < 0 || age > 24 * 60 * 60 * 1000) throw new Error();
			return value;
		} catch { throw new BootcampError('stale'); }
	}
	return {
		sign(userId: string, snapshot: WaiverSnapshot, identityVersion: string) {
			const encoded = Buffer.from(JSON.stringify({ signedAt: snapshot.signedAt, digest: digest(userId, snapshot, identityVersion) })).toString('base64url');
			return `${encoded}.${mac(encoded).toString('base64url')}`;
		},
		signedAt(token: string) { return decode(token).signedAt; },
		verify(token: string, userId: string, snapshot: WaiverSnapshot, identityVersion: string) {
			if (decode(token).digest !== digest(userId, snapshot, identityVersion)) throw new BootcampError('stale');
		}
	};
}
