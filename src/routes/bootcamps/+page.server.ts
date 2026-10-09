import { bootcampServices } from '#lib/server/bootcamp/runtime.ts';
import { studentPage } from '#lib/server/bootcamp/registration.ts';
import { bootcampAction, requireViewer } from '#lib/server/bootcamp/http.ts';
import { BootcampError, field, id } from '#lib/server/bootcamp/validation.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const viewer = requireViewer(locals, 'student', true);
	const { db, paymentEnabled } = bootcampServices();
	return studentPage(db, viewer.id, paymentEnabled);
};

export const actions: Actions = {
	start: bootcampAction('student', ({ services: s, viewerId, form }) => s.registration.start(viewerId, id(form.get('eventId')))),
	waiver: bootcampAction('student', ({ services: s, viewerId, form }) => s.registration.submitWaiver(viewerId, form)),
	letter: bootcampAction('student', ({ services: s, viewerId, form }) => s.registration.submitLetter(viewerId, form)),
	payment: bootcampAction('student', async ({ services: s, viewerId, form }) => {
		if (!s.payment) throw new BootcampError('unavailable');
		const registration = await s.registration.ownedRegistration(viewerId, id(form.get('eventId')));
		return s.payment.start(registration.id, Number(form.get('amountCents')), field(form, 'phone', 40));
	}),
	checkPayment: bootcampAction('student', async ({ services: s, viewerId, form }) => {
		if (!s.payment) throw new BootcampError('unavailable');
		const registration = await s.registration.ownedRegistration(viewerId, id(form.get('eventId')), false);
		await s.payment.reconcileLatest(registration.id);
	})
};
