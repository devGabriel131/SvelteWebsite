import type { Language } from '../i18n/translations';
import type { StudentClassType } from '../student';

export const sectionKeys = ['agreement', 'liability', 'media'] as const;
export type SectionKey = typeof sectionKeys[number];
export type LegalText = Record<Language, Record<SectionKey, string>>;
export type EventSnapshot = {
	id: string;
	revision: number;
	title: string;
	venue: string;
	startsAt: string;
	endsAt: string;
	arrivalAt: string;
	registrationClosesAt: string;
	legal: LegalText;
};
export type StudentSnapshot = {
	name: string;
	email: string;
	dateOfBirth: string;
	phone: string;
	municipality: string;
	signingCity: string;
};
export type WaiverSnapshot = {
	event: EventSnapshot;
	student: StudentSnapshot;
	language: Language;
	signedAt: string;
	signatures: Record<SectionKey, string>;
};
export type EmployerDetails = { employer: string; contact: string; position: string; workplace: string };
export type LetterSnapshot = {
	event: EventSnapshot;
	student: StudentSnapshot;
	language: Language;
	issuedAt: string;
	employer: EmployerDetails;
};
export type DocumentKind = 'waiver' | 'letter';
export type RegistrationStatus = 'not_started' | 'waiver' | 'letter' | 'payment' | 'confirmed';
export type BootcampEvent = EventSnapshot & { registrationOpen: boolean };
export type StudentRegistration = {
	id: string;
	eventId: string;
	waiver: WaiverSnapshot | null;
	letterChoice: boolean | null;
	paidCents: number;
	payment?: { id: string; status: 'creating' | 'pending' | 'uncertain' | 'completed' | 'cancelled' | 'refunded'; uncertain?: boolean };
	documents: { id: string; kind: DocumentKind; language: Language }[];
};
export type StudentBootcampPage = {
	events: BootcampEvent[];
	registrations: StudentRegistration[];
	student: { id: string; name: string; email: string; dateOfBirth: string | null; identityVersion: string } | null;
	paymentEnabled: boolean;
};
export type ReportRow = {
	studentId: string;
	classType: StudentClassType;
	name: string;
	email: string;
	eligibility: 'eligible' | 'underage' | 'unknown' | 'inactive';
	status: RegistrationStatus;
	paidCents: number;
	remainingCents: number;
	paymentStatus?: string;
	paymentUncertain?: boolean;
	documents: { id: string; kind: DocumentKind; backupStatus: string }[];
};

export const priceCents = 3000;
export const depositCents = 1500;
export const eventTimeZone = 'America/Puerto_Rico';
