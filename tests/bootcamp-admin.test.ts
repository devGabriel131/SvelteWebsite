import { describe, expect, test } from 'bun:test';
import { getTableColumns } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pg-proxy';
import { defaultLegalText } from '../src/lib/bootcamp/legal';
import { activateEvent, eventReport, getEvent, listEvents, updateEvent } from '../src/lib/server/bootcamp/admin';
import { eventView } from '../src/lib/server/bootcamp/registration';
import { bootcampEvents as events } from '../src/lib/server/db/bootcamp-schema';
import type { Database } from '../src/lib/server/db/connection';

const eventId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const adminId = 'test-admin';
const schedule = {
	startsAt: new Date('2030-06-15T12:00:00Z'), endsAt: new Date('2030-06-15T20:00:00Z'),
	arrivalAt: new Date('2030-06-15T11:00:00Z'), registrationClosesAt: new Date('2030-06-15T00:00:00Z')
};
const event: typeof events.$inferSelect = {
	id: eventId, revision: 1, title: 'Evento de prueba', venue: 'Cancha de prueba', ...schedule,
	legal: defaultLegalText({ venue: 'Cancha de prueba', ...schedule }),
	registrationOpen: false, createdBy: adminId, createdAt: new Date('2030-01-01'), updatedAt: new Date('2030-01-01')
};
const eventRow = Object.keys(getTableColumns(events)).map((key) => {
	const value = event[key as keyof typeof event];
	return value instanceof Date ? value.toISOString() : value;
});

function form(overrides: Record<string, string> = {}) {
	const result = new FormData();
	for (const [key, value] of Object.entries({ title: event.title, venue: event.venue,
		eventDate: '2030-06-15', startTime: '08:00', endTime: '16:00', ...overrides })) result.set(key, value);
	return result;
}

type Query = { sql: string; params: unknown[] };
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
// Compile real Drizzle SQL without connecting to PostgreSQL. The integration suite covers persistence/locking.
function database(respond: (query: Query) => unknown[][] = () => []) {
	const queries: Query[] = [];
	const db = drizzle(async (sql, params) => {
		const query = { sql, params };
		queries.push(query);
		return { rows: respond(query) };
	}) as unknown as Database & Transaction;
	// Proxy does not implement transactions; persistence/rollback are tested against PostgreSQL.
	db.transaction = <T>(work: (tx: Transaction) => Promise<T>) => work(db);
	return { db, queries };
}

describe('bootcamp admin route data and mutations', () => {
	test('activation generates standard legal on the server and opens registration immediately', async () => {
		const { db, queries } = database(() => [[eventId]]);
		expect(await activateEvent(db, adminId, form(), true)).toBe(eventId);
		expect(queries).toHaveLength(2);
		expect(queries[0].sql).toContain('clock_timestamp()');
		expect(queries[1].sql).toStartWith('insert into "bootcamp_events"');
		expect(queries[1].params).toEqual([
			event.title, event.venue, schedule.startsAt.toISOString(), schedule.endsAt.toISOString(),
			schedule.arrivalAt.toISOString(), schedule.registrationClosesAt.toISOString(), JSON.stringify(event.legal), true, adminId
		]);
	});

	test('activation ignores forged IDs, revisions, approval, raw timestamps and custom legal without changing the form', async () => {
		const input = form({ id: otherId, revision: '99', legalSource: 'custom', legalApproved: 'true', approvedBy: adminId,
			registrationOpen: 'true', startsAt: 'invalid', arrivalAt: 'invalid', registrationClosesAt: 'invalid',
			legal_es_agreement: 'Forged', legal_es_liability: 'Forged', legal_es_media: 'Forged', legal_en_media: 'Forged' });
		const before = [...input.entries()];
		const { db, queries } = database(() => [[eventId]]);
		expect(await activateEvent(db, adminId, input, true)).toBe(eventId);
		expect(queries).toHaveLength(2);
		expect(queries[1].sql).toStartWith('insert into "bootcamp_events"');
		expect(queries[1].params).toContain(JSON.stringify(event.legal));
		expect(queries[1].params).not.toContain(otherId);
		expect(queries[1].params).toContain(true);
		expect(queries[1].params).not.toContain('Forged');
		expect([...input.entries()]).toEqual(before);
	});

	test('activation still validates event details before any write', async () => {
		const { db, queries } = database();
		for (const [key, value] of [['title', ''], ['venue', ''], ['eventDate', 'invalid'], ['endTime', '07:00']]) {
			await expect(activateEvent(db, adminId, form({ [key]: value }), true)).rejects.toMatchObject({ code: 'invalid' });
		}
		expect(queries).toHaveLength(0);
	});

	test('activation rejects missing readiness and an elapsed 12-hour cutoff without writing', async () => {
		const { db, queries } = database();
		await expect(activateEvent(db, adminId, form(), false)).rejects.toMatchObject({ code: 'unavailable' });
		await expect(activateEvent(db, adminId, form({ eventDate: '2000-01-01' }), true)).rejects.toMatchObject({ code: 'unavailable' });
		expect(queries).toHaveLength(0);
	});

	test('activation maps only the named unique constraint, including wrapped errors, to activeEvent', async () => {
		const conflict = database(({ sql }) => {
			if (sql.startsWith('insert')) throw { code: '23505', constraint_name: 'bootcamp_event_single_open' };
			return [];
		});
		await expect(activateEvent(conflict.db, adminId, form(), true)).rejects.toMatchObject({ code: 'activeEvent' });
		const unrelated = database(() => { throw { code: '23505', constraint_name: 'another_constraint' }; });
		await expect(activateEvent(unrelated.db, adminId, form(), true)).rejects.not.toMatchObject({ code: 'activeEvent' });
	});

	test('scoped edits reject missing, malformed, or different submitted IDs before any SQL', async () => {
		const { db, queries } = database();
		for (const submittedId of [undefined, '', 'invalid', otherId]) {
			const input = form({ revision: '1', legalSource: 'standard', legalApproved: 'true' });
			if (submittedId !== undefined) input.set('id', submittedId);
			await expect(updateEvent(db, eventId, input)).rejects.toMatchObject({ code: 'invalid' });
		}
		await expect(updateEvent(db, 'invalid', form({ id: eventId }))).rejects.toMatchObject({ code: 'invalid' });
		expect(queries).toHaveLength(0);
	});

	test('scoped edits keep the revision predicate and preserve open registration only before both cutoffs', async () => {
		const { db, queries } = database(() => [[eventId]]);
		const input = form({ id: eventId, revision: '1', legalSource: 'standard', legalApproved: 'true' });
		expect(await updateEvent(db, eventId, input)).toBe(eventId);
		expect(queries).toHaveLength(1);
		expect(queries[0].sql).toStartWith('update "bootcamp_events"');
		expect(queries[0].sql).toContain('"revision" = "bootcamp_events"."revision" + 1');
		expect(queries[0].sql).toMatch(/where \("bootcamp_events"\."id" = \$\d+ and "bootcamp_events"\."revision" = \$\d+\)/);
		expect(queries[0].params.slice(-2)).toEqual([eventId, 1]);
		expect(queries[0].sql).toContain('"registration_open" = "bootcamp_events"."registration_open" AND "bootcamp_events"."registration_closes_at" > clock_timestamp()');
		expect(queries[0].sql).toContain('::timestamptz > clock_timestamp()');
		expect(queries[0].sql).not.toContain('legal_approved');
		expect(queries[0].sql).not.toContain('approved_by');
		const stale = database();
		await expect(updateEvent(stale.db, eventId, input)).rejects.toMatchObject({ code: 'stale' });
		expect(stale.queries).toHaveLength(1);
	});

	test('list loads events only, and lookup never falls back to another event', async () => {
		const listed = database(() => [eventRow]);
		expect(await listEvents(listed.db)).toEqual([eventView(event)]);
		expect(listed.queries).toHaveLength(1);
		expect(listed.queries[0].sql).toContain('from "bootcamp_events" order by "bootcamp_events"."starts_at" desc');
		const lookup = database(() => [eventRow]);
		expect(await getEvent(lookup.db, eventId)).toEqual(eventView(event));
		expect(lookup.queries).toHaveLength(1);
		expect(lookup.queries[0].sql).toContain('where "bootcamp_events"."id" = $1');
		expect(lookup.queries[0].params).toEqual([eventId]);
		const missing = database();
		for (const value of [null, undefined, '', 'invalid', `${eventId}\n`, ` ${eventId}`]) expect(await getEvent(missing.db, value)).toBeNull();
		expect(missing.queries).toHaveLength(0);
		expect(await getEvent(missing.db, otherId)).toBeNull();
		expect(missing.queries).toHaveLength(1);
	});

	test('report validates a single event and scopes registrations without loading the event list', async () => {
		const { db, queries } = database(({ sql }) => sql.includes('from "bootcamp_events"') ? [eventRow] : []);
		expect(await eventReport(db, eventId)).toEqual([]);
		expect(queries).toHaveLength(3);
		expect(queries[0].sql).toContain('where "bootcamp_events"."id" = $1');
		expect(queries[0].params).toEqual([eventId]);
		expect(queries[1].sql).toContain('from "students"');
		expect(queries[2].sql).toContain('where "bootcamp_registrations"."event_id" = $1');
		expect(queries[2].params).toEqual([eventId]);
		const missing = database();
		await expect(eventReport(missing.db, 'invalid')).rejects.toMatchObject({ code: 'invalid' });
		expect(missing.queries).toHaveLength(0);
		await expect(eventReport(missing.db, otherId)).rejects.toMatchObject({ code: 'invalid' });
		expect(missing.queries).toHaveLength(1);
	});
});
