import {
	BETTER_AUTH_SECRET, ATH_PUBLIC_TOKEN, ATH_PRIVATE_TOKEN, BOOTCAMP_PAYMENTS_ENABLED, BOOTCAMP_PAYMENT_KEY, BOOTCAMP_WORKER_SECRET
} from '$app/env/private';
import { getDatabase } from '../db';
import type { Database } from '../db/connection';
import { getDrive, type DriveBinding } from '../drive';
import { createBootcampBackup, type BootcampBackup } from './backup';
import { createAthClient } from './ath';
import { createPaymentService, type PaymentService } from './payments';
import { createRegistrationService, type RegistrationService } from './registration';

export type BootcampServices = {
	db: Database;
	backup: BootcampBackup;
	payment: PaymentService | null;
	paymentEnabled: boolean;
	driveEnabled: boolean;
	registration: RegistrationService;
};
let services: BootcampServices | undefined;

function createServices(): BootcampServices {
	const db = getDatabase();
	let drive: DriveBinding | null;
	try { drive = getDrive(); }
	catch { drive = null; }
	const backup = createBootcampBackup(db, drive);
	let payment: PaymentService | null = null;
	if (BOOTCAMP_PAYMENTS_ENABLED === 'true' && (BOOTCAMP_WORKER_SECRET?.length ?? 0) >= 32) {
		try {
			payment = createPaymentService(db, createAthClient({
				publicToken: ATH_PUBLIC_TOKEN ?? '', privateToken: ATH_PRIVATE_TOKEN ?? ''
			}), BOOTCAMP_PAYMENT_KEY ?? '');
		} catch { payment = null; }
	}
	return { db, backup, payment, paymentEnabled: payment !== null, driveEnabled: drive !== null, registration: createRegistrationService(db, backup.backupDocument, BETTER_AUTH_SECRET) };
}

export function bootcampServices(): BootcampServices {
	return services ??= createServices();
}
