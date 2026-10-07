import {
	BETTER_AUTH_SECRET, ATH_PUBLIC_TOKEN, ATH_PRIVATE_TOKEN, BOOTCAMP_PAYMENTS_ENABLED, BOOTCAMP_PAYMENT_KEY, BOOTCAMP_WORKER_SECRET,
	GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, DRIVE_OAUTH_REFRESH_TOKEN, DRIVE_REPORTS_FOLDER_ID
} from '$app/env/private';
import { getDatabase } from '../db';
import { readDriveConfig } from '../drive/config';
import { createDriveClient } from '../drive/client';
import { createBootcampBackup } from './backup';
import { createAthClient } from './ath';
import { createPaymentService } from './payments';
import { createRegistrationService } from './registration';

export function bootcampServices() {
	const db = getDatabase();
	let driveConfig;
	try { driveConfig = readDriveConfig({ GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, DRIVE_OAUTH_REFRESH_TOKEN, DRIVE_REPORTS_FOLDER_ID }); }
	catch { driveConfig = null; }
	const backup = createBootcampBackup(db, driveConfig ? createDriveClient(driveConfig) : null, driveConfig?.reportsFolderId);
	const paymentEnabled = BOOTCAMP_PAYMENTS_ENABLED === 'true' && !!ATH_PUBLIC_TOKEN?.trim() && !!ATH_PRIVATE_TOKEN?.trim()
		&& /^[a-f0-9]{64}$/i.test(BOOTCAMP_PAYMENT_KEY ?? '') && (BOOTCAMP_WORKER_SECRET?.length ?? 0) >= 32;
	const payment = paymentEnabled ? createPaymentService(db, createAthClient({ publicToken: ATH_PUBLIC_TOKEN!, privateToken: ATH_PRIVATE_TOKEN! }), BOOTCAMP_PAYMENT_KEY!) : null;
	return { db, backup, payment, paymentEnabled, driveEnabled: !!driveConfig, registration: createRegistrationService(db, backup.backupDocument, BETTER_AUTH_SECRET) };
}
