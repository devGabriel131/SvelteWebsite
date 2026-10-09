import type { Language } from './i18n/translations';
import type { StudentClassType, StudentGender, StudentStatus } from './student';

export type StudentImportOptions = { classType: StudentClassType; emailLanguage: Language };

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 100;
export const INVITATIONS_PAGE_SIZE = 200;
// Strip token-bearing paths without giving native form POSTs a null Origin.
export const INVITATION_REFERRER_POLICY = 'strict-origin';

export interface StudentInvitation {
	studentId: string;
	firstName: string;
	lastName: string;
	email: string;
	language: Language;
	expiresAt: string;
	acceptedAt: string | null;
	sentAt: string | null;
	deliveryState: 'pending' | 'sending' | 'sent' | 'failed';
	testMode: boolean;
	status: StudentStatus;
}

export interface StudentImportResult {
	phase: 'preview' | 'import';
	success: boolean;
	reviewToken?: string;
	options?: StudentImportOptions;
	rows?: { row: number; firstName: string; lastName: string; email: string }[];
	issues?: { row: number; code: 'name' | 'email' | 'pin' | 'duplicate' | 'cell' | 'exists' }[];
	error?: 'file' | 'headers' | 'empty' | 'limit' | 'invalid' | 'conflict' | 'review' | 'unavailable' | 'storage';
	created?: number;
	sent?: number;
	failed?: number;
	testMode?: boolean;
}

export interface InvitationResendResult {
	studentId: string | null;
	success: boolean;
	testMode?: boolean;
	error?: 'invalid' | 'unavailable' | 'storage';
}

export interface InvitationActionData {
	studentImport?: StudentImportResult;
	invitationResend?: InvitationResendResult;
}

export interface EnrollmentProfile {
	firstName: string;
	lastName: string;
	dateOfBirth: string;
	gender: StudentGender;
}

export interface EnrollmentData {
	state: 'signIn' | 'ready' | 'invalid' | 'complete';
	student: {
		firstName: string;
		lastName: string;
		email: string;
		classType: StudentClassType;
		dateOfBirth: string | null;
		gender: StudentGender | null;
	} | null;
}

export interface EnrollmentActionData {
	enrollment?: { success: true } | { success: false; error: 'invalid' | 'invitation' | 'storage' };
}
