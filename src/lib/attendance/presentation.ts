import { formatMessage, translations, type Language } from '../i18n/translations';
import { attendanceNameSlug, shortAttendanceName, titleAttendanceName } from './names';
import { attendanceClassTimes, type AttendanceCertificate, type ClassTime, type Cohort } from './types';

export { attendanceNameSlug, shortAttendanceName, titleAttendanceName } from './names';

export interface AttendanceDocument {
	language: Language;
	title: string;
	issuedDate: string;
	recipient: string[];
	paragraphs: string[];
	signature: { name: string; role: string; phone: string; email: string };

	filename: string;
}

export function attendanceSchedule(cohort: Cohort, classTime: ClassTime, language: Language): string {
	return formatMessage(translations[language].attendance.schedules[cohort], attendanceClassTimes[classTime]);
}

// Presentation only: use the validated snapshot and its supplied issuance clock, never the current time.
export function presentAttendanceCertificate(certificate: AttendanceCertificate, language: Language): AttendanceDocument {
	const messages = translations[language].attendance.document;
	const { input, issuedAt } = certificate;
	const date = new Intl.DateTimeFormat(language === 'es' ? 'es-PR' : 'en-US', {
		dateStyle: 'long', timeZone: 'UTC'
	});
	const issueInstant = new Date(issuedAt);
	const issuedDate = date.format(issueInstant);
	const studentName = titleAttendanceName(input.studentName);
	const shortName = shortAttendanceName(studentName);
	const startDate = date.format(new Date(`${input.programStartDate}T00:00:00Z`));

	return {
		language,
		title: messages.title,
		issuedDate,
		recipient: [titleAttendanceName(input.employerName), input.employerPosition, input.employerWorkplace],
		paragraphs: [
			formatMessage(input.studentSex === 'female' ? messages.openingFemale : messages.openingMale, {
				studentName
			}),
			formatMessage(messages.participation, { startDate, shortName, schedule: attendanceSchedule(input.cohort, input.classTime, language) }),
			formatMessage(messages.accommodation, { shortName }),
			formatMessage(messages.gratitude, { shortName }),
			formatMessage(messages.issuance, { city: messages.city, issueDate: issuedDate, phone: messages.phone })
		],
		signature: { name: messages.signatory, role: messages.role, phone: messages.phone, email: messages.email },

		filename: `${issueInstant.toISOString().slice(0, 10)}_${input.cohort}_${attendanceNameSlug(studentName)}_${language}.pdf`
	};
}
