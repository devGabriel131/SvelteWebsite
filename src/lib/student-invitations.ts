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
	language: 'en' | 'es';
	expiresAt: string;
	acceptedAt: string | null;
	sentAt: string | null;
	deliveryState: 'pending' | 'sending' | 'sent' | 'failed';
	testMode: boolean;
	status: 'active' | 'inactive' | 'invited';
}

export interface StudentImportResult {
	phase: 'preview' | 'import';
	success: boolean;
	reviewToken?: string;
	options?: { classType: 'basic' | 'regular'; emailLanguage: 'en' | 'es' };
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
	gender: 'male' | 'female';
}

export interface EnrollmentData {
	state: 'signIn' | 'ready' | 'invalid' | 'complete';
	returnTo: string;
	student: {
		firstName: string;
		lastName: string;
		email: string;
		classType: 'basic' | 'regular';
		dateOfBirth: string | null;
		gender: 'male' | 'female' | null;
	} | null;
}

export interface EnrollmentActionData {
	enrollment?: { success: true } | { success: false; error: 'invalid' | 'invitation' | 'storage' };
}
