import { desc, eq } from 'drizzle-orm';
import { bootcampServices } from '#lib/server/bootcamp/runtime.ts';
import { studentPage } from '#lib/server/bootcamp/registration.ts';
import { actionResult, limitRequest, requireOrigin, requireViewer } from '#lib/server/bootcamp/http.ts';
import { BootcampError, field, id, readForm } from '#lib/server/bootcamp/validation.ts';
import { bootcampPayments } from '#lib/server/db/bootcamp-schema.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const viewer = requireViewer(locals, 'student', true);
	const { db, paymentEnabled } = bootcampServices();
	return studentPage(db, viewer.id, paymentEnabled);
};

const action = (work: (services: ReturnType<typeof bootcampServices>, userId: string, form: FormData) => Promise<unknown>): Actions[string] =>
	async ({ locals, request, setHeaders }) => {
		const viewer = requireViewer(locals, 'student');
		setHeaders({ 'cache-control': 'private, no-store' });
		return actionResult(async () => {
			requireOrigin(request);
			const services = bootcampServices();
			await limitRequest(services.db, `student:${viewer.id}`, 20);
			return work(services, viewer.id, await readForm(request));
		});
	};

export const actions: Actions = {
	start: action((s, userId, form) => s.registration.start(userId, id(form.get('eventId')))),
	waiver: action((s, userId, form) => s.registration.submitWaiver(userId, form)),
	letter: action((s, userId, form) => s.registration.submitLetter(userId, form)),
	payment: action(async (s, userId, form) => {
		if (!s.payment) throw new BootcampError('unavailable');
		const registration = await s.registration.ownedRegistration(userId, id(form.get('eventId')));
		return s.payment.start(registration.id, Number(form.get('amountCents')), field(form, 'phone', 40));
	}),
	checkPayment: action(async (s, userId, form) => {
		if (!s.payment) throw new BootcampError('unavailable');
		const registration = await s.registration.ownedRegistration(userId, id(form.get('eventId')), false);
		const [attempt] = await s.db.select({ id: bootcampPayments.id }).from(bootcampPayments).where(eq(bootcampPayments.registrationId, registration.id)).orderBy(desc(bootcampPayments.createdAt)).limit(1);
		if (attempt) await s.payment.reconcile(attempt.id);
	})
};
