import { describe, expect, test } from 'bun:test';
import { requireDatabaseUrl } from '../src/lib/server/db/connection';
import { assertLocalDatabaseUrl } from '../scripts/db/local-target';
import { fictitiousStudents, seedStudents } from '../scripts/db/seed';

const developmentUrl = 'postgresql://sveltewebsite:local@127.0.0.1:5433/sveltewebsite';
const testUrl = 'postgresql://sveltewebsite_test:sveltewebsite_test@127.0.0.1:5434/sveltewebsite_test';

describe('database URL validation', () => {
	test('accepts standard PostgreSQL URLs without connecting', () => {
		expect(requireDatabaseUrl(developmentUrl)).toBe(developmentUrl);
		expect(requireDatabaseUrl('postgres://app:secret@db.example.test:5432/app')).toContain('postgres:');
	});

	for (const value of [undefined, '', ' ', 'not-a-url', 'https://db.example.test/app', 'postgres://host/']) {
		test(`rejects an absent or invalid URL: ${String(value)}`, () => {
			expect(() => requireDatabaseUrl(value)).toThrow(/DATABASE_URL/);
		});
	}

	test('invalid-URL errors do not echo credentials', () => {
		expect(() => requireDatabaseUrl('https://user:secret-value@db.example.test/app')).toThrow(
			'DATABASE_URL must be a PostgreSQL connection URL with a database name.'
		);
	});
});

describe('local database safety guards', () => {
	test('permits seeds only on the known development and test targets', () => {
		expect(assertLocalDatabaseUrl(developmentUrl, 'seed').database).toBe('sveltewebsite');
		expect(assertLocalDatabaseUrl(testUrl, 'seed').database).toBe('sveltewebsite_test');
	});

	test('tests cannot use the persistent development database', () => {
		expect(() => assertLocalDatabaseUrl(developmentUrl, 'test')).toThrow(/Refusing/);
		expect(assertLocalDatabaseUrl(testUrl, 'test').database).toBe('sveltewebsite_test');
	});

	for (const url of [
		'postgresql://sveltewebsite_test:secret@db.example.test:5434/sveltewebsite_test',
		'postgresql://sveltewebsite_test:secret@127.0.0.1:5432/sveltewebsite_test',
		'postgresql://sveltewebsite_test:secret@127.0.0.1:5434/production',
		'postgresql://other:secret@127.0.0.1:5434/sveltewebsite_test',
		`${testUrl}?host=db.example.test`,
		`${testUrl}?port=5432`,
		`${testUrl}#unexpected`
	]) {
		test(`rejects an unknown target or connection override: ${url.replace('secret', 'redacted')}`, () => {
			expect(() => assertLocalDatabaseUrl(url, 'seed')).toThrow(/Refusing/);
			expect(() => assertLocalDatabaseUrl(url, 'test')).toThrow(/Refusing/);
		});
	}

	for (const key of ['NODE_ENV', 'RAILWAY_PROJECT_ID', 'RAILWAY_ENVIRONMENT_ID']) {
		test(`refuses production/hosted execution through ${key}`, () => {
			const previous = process.env[key];
			process.env[key] = key === 'NODE_ENV' ? 'production' : 'test-project';
			try {
				expect(() => assertLocalDatabaseUrl(testUrl, 'seed')).toThrow(/production or Railway/);
				expect(() => assertLocalDatabaseUrl(testUrl, 'test')).toThrow(/production or Railway/);
			} finally {
				if (previous === undefined) delete process.env[key];
				else process.env[key] = previous;
			}
		});
	}

	test('the seed rejects remote targets before opening a connection', async () => {
		await expect(seedStudents('postgresql://app:secret@db.example.test:5432/app')).rejects.toThrow(
			/Refusing/
		);
	});
});

describe('fictitious roster fixtures', () => {
	test('has stable unique IDs, reserved addresses, and no authentication credentials', () => {
		expect(new Set(fictitiousStudents.map((student) => student.id)).size).toBe(fictitiousStudents.length);
		expect(new Set(fictitiousStudents.map((student) => student.email)).size).toBe(fictitiousStudents.length);
		for (const student of fictitiousStudents) {
			expect(student.email).toEndWith('@example.test');
			expect(student).not.toHaveProperty('pin');
			expect(student).not.toHaveProperty('pin_hash');
			expect(student).not.toHaveProperty('auth_user_id');
		}
	});
});
