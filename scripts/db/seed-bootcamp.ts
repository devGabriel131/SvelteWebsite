import { asc, eq } from 'drizzle-orm';
import { students } from '../../src/lib/server/db/schema';
import { user } from '../../src/lib/server/db/auth-schema';
import { bootcampEvents, bootcampRegistrations } from '../../src/lib/server/db/bootcamp-schema';
import { defaultLegalText } from '../../src/lib/bootcamp/legal';
import { LOCAL_ADMIN_EMAIL } from '../../src/lib/server/auth/config';
import { openLocalDatabase } from './local-target';

const demoBootcampId = '00000000-0000-4000-8000-00000000bc01';
const title = '[DEMO] ASVAB intensive · November';

export async function seedBootcamp(databaseUrl: string | undefined) {
	const connection = await openLocalDatabase(databaseUrl, 'seed');
	try {
		return await connection.db.transaction(async (tx) => {
			const [admin] = await tx.select().from(user).where(eq(user.email, LOCAL_ADMIN_EMAIL));
			if (admin?.role !== 'admin') throw new Error('Run db:seed:admin first. No bootcamp data inserted.');
			const roster = await tx.select().from(students).orderBy(asc(students.lastName), asc(students.firstName), asc(students.id));
			if (roster.length < 2 || roster.some((student) => !student.email.endsWith('@example.test'))) {
				throw new Error('Expected at least two fictional @example.test roster records only. No bootcamp data inserted.');
			}
			const schedule = {
				venue: 'Centro de Convenciones, San Juan',
				startsAt: new Date('2026-11-14T09:00:00-04:00'),
				endsAt: new Date('2026-11-14T16:00:00-04:00'),
				arrivalAt: new Date('2026-11-14T08:00:00-04:00'),
				registrationClosesAt: new Date('2026-11-13T21:00:00-04:00')
			};
			const [existing] = await tx.select().from(bootcampEvents).where(eq(bootcampEvents.id, demoBootcampId));
			if (existing && (existing.title !== title || existing.createdBy !== admin.id || existing.registrationOpen)) {
				throw new Error('Demo event has been changed; refusing to add registrations or overwrite it.');
			}
			await tx.insert(bootcampEvents).values({
				id: demoBootcampId, title, ...schedule, legal: defaultLegalText(schedule),
				createdBy: admin.id, registrationOpen: false
			}).onConflictDoNothing({ target: bootcampEvents.id });
			const selected = roster.slice(0, Math.floor(roster.length / 2));
			// Only started registrations: never manufacture signatures, documents, or verified transactions.
			const inserted = await tx.insert(bootcampRegistrations).values(selected.map((student) => ({
				eventId: demoBootcampId, studentId: student.id
			}))).onConflictDoNothing({ target: [bootcampRegistrations.eventId, bootcampRegistrations.studentId] })
				.returning({ id: bootcampRegistrations.id });
			return { eventId: demoBootcampId, roster: roster.length, selected: selected.length, inserted: inserted.length };
		});
	} finally {
		await connection.client.end();
	}
}

if (import.meta.main) {
	const result = await seedBootcamp(process.env.DATABASE_URL);
	console.info(`Local DEMO bootcamp: ${result.selected}/${result.roster} students selected; ${result.inserted} registrations inserted. Registration is closed; no signatures, documents, or payments were created.`);
	console.info(`/admin/bootcamps/${result.eventId}/report`);
}
