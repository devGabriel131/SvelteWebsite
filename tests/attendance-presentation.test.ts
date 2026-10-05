import { describe, expect, test } from 'bun:test';
import {
	attendanceNameSlug,
	attendanceSchedule,
	presentAttendanceCertificate,
	shortAttendanceName,
	titleAttendanceName,
	type AttendanceDocument
} from '../src/lib/attendance/presentation';
import {
	attendanceNameSlug as sharedAttendanceNameSlug,
	shortAttendanceName as sharedShortAttendanceName,
	titleAttendanceName as sharedTitleAttendanceName
} from '../src/lib/attendance/names';
import { attendanceFields, type AttendanceCertificate, type AttendanceInput } from '../src/lib/attendance/types';
import { validateAttendanceInput } from '../src/lib/attendance/validation';
import { formatMessage, translations, type Language } from '../src/lib/i18n/translations';

const issuedAt = '2026-10-03T12:34:00.000Z';
const spanishSchedules = {
	basic: 'los lunes y viernes en horario de 8:00 p.m. a 10:00 p.m., y los miércoles en horario de 10:00 a.m. a 12:00 p.m.',
	regular: 'los lunes, martes, jueves y viernes en horario de 8:00 p.m. a 10:00 p.m.'
} as const;

function makeCertificate(overrides: Partial<AttendanceInput> = {}, clock = issuedAt): AttendanceCertificate {
	return {
		input: {
			studentName: 'MARÍA SOFÍA PAGÁN CRUZ', studentSex: 'female',
			programStartDate: '2026-04-15', cohort: 'regular', employerName: 'ROBERTO QUIÑONES',
			employerPosition: 'SUPERVISOR de turno', employerWorkplace: 'Walgreens, Plaza del Sol',
			...overrides
		},
		issuedAt: clock
	};
}

function makeDocument(language: Language, overrides: Partial<AttendanceInput> = {}): AttendanceDocument {
	return presentAttendanceCertificate(makeCertificate(overrides), language);
}

describe('legacy attendance name presentation', () => {
	test('re-exports the shared name helpers without changing the presentation API', () => {
		expect(titleAttendanceName).toBe(sharedTitleAttendanceName);
		expect(shortAttendanceName).toBe(sharedShortAttendanceName);
		expect(attendanceNameSlug).toBe(sharedAttendanceNameSlug);
	});

	for (const [raw, expected] of [
		['  MARÍA SOFÍA PAGÁN CRUZ  ', 'María Sofía Pagán Cruz'],
		["ANA-MARÍA O'NEILL DEL RÍO", "Ana-María O'Neill Del Río"],
		["JEAN-LUC D'ÁVILA", "Jean-Luc D'Ávila"],
		['JOSÉ DE LA CRUZ', 'José De La Cruz'],
		['ÉLODIE MUÑOZ ÜBER', 'Élodie Muñoz Über'],
		['李 小龍', '李 小龍'],
		['İPEK ΟΣ', 'Ipek Οσ'],
		['ßETA', 'ßeta'],
		['O’NEILL', 'O’neill'],
		['µ', 'Μ'],
		['ƒ', 'Ƒ'],
		['AµNA', 'Aµna'],
		['AƒNA', 'Aƒna']
	] as const) {
		test(`title-cases ${JSON.stringify(raw)} with the legacy per-character rules`, () => {
			expect(titleAttendanceName(raw)).toBe(expected);
		});
	}

	for (const [fullName, shortName] of [
		['María Sofía Pagán Cruz', 'María Sofía'],
		["Ana-María O'Neill Del Río", "Ana-María O'Neill"],
		['José De La Cruz', 'José De'],
		['María', 'María'],
		['李 小龍', '李 小龍'],
		['  María\u00a0Sofía   Pagán Cruz  ', 'María Sofía']
	] as const) {
		test(`uses the first two whitespace-separated tokens of ${JSON.stringify(fullName)}`, () => {
			expect(shortAttendanceName(fullName)).toBe(shortName);
		});
	}
});

describe('attendance filename slugs', () => {
	for (const [name, slug] of [
		['MARÍA SOFÍA PAGÁN CRUZ', 'maria-sofia-pagan-cruz'],
		["Ana-María O'Neill", 'ana-maria-o-neill'],
		['ÁÀÄÂÃ ÉÈËÊ ÍÌÏÎ ÓÒÖÔÕ ÚÙÜÛ Ñ Ç', 'aaaaa-eeee-iiii-ooooo-uuuu-n-c'],
		['  --José___Rivera... / 42--  ', 'jose-rivera-42'],
		['Zoë García', 'zoe-garcia'],
		['李 小龍', 'student'],
		['ΑΝΝΑ', 'student'],
		['---', 'student'],
		['', 'student']
	] as const) {
		test(`makes ${JSON.stringify(name)} an ASCII-only safe slug`, () => {
			expect(attendanceNameSlug(name)).toBe(slug);
			expect(attendanceNameSlug(name)).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
		});
	}
});

describe('bilingual attendance schedules', () => {
	for (const cohort of ['basic', 'regular'] as const) {
		test(`preserves the exact legacy Spanish ${cohort} schedule`, () => {
			expect(attendanceSchedule(cohort, 'es')).toBe(spanishSchedules[cohort]);
		});

		for (const language of ['en', 'es'] as const) {
			test(`${language}/${cohort} uses the shared translated schedule verbatim`, () => {
				const schedule = attendanceSchedule(cohort, language);
				expect(schedule).toBe(translations[language].attendance.schedules[cohort]);
				expect(makeDocument(language, { cohort }).paragraphs[1]).toContain(schedule);
			});
		}
	}

	test('English basic retains Monday/Friday evenings and Wednesday late morning only', () => {
		const schedule = attendanceSchedule('basic', 'en');
		expect(schedule).toMatch(/Mondays/i);
		expect(schedule).toMatch(/Fridays/i);
		expect(schedule).toMatch(/Wednesdays/i);
		expect(schedule).not.toMatch(/Tuesdays|Thursdays|Saturdays|Sundays/i);
		for (const time of ['8:00 p.m.', '10:00 p.m.', '10:00 a.m.', '12:00 p.m.']) {
			expect(schedule).toContain(time);
		}
	});

	test('English regular retains Monday/Tuesday/Thursday/Friday evenings only', () => {
		const schedule = attendanceSchedule('regular', 'en');
		for (const day of ['Mondays', 'Tuesdays', 'Thursdays', 'Fridays']) expect(schedule).toContain(day);
		expect(schedule).not.toMatch(/Wednesdays|Saturdays|Sundays/i);
		expect(schedule).toContain('8:00 p.m.');
		expect(schedule).toContain('10:00 p.m.');
		expect(schedule).not.toContain('a.m.');
	});
});

describe('attendance document presentation', () => {
	for (const language of ['en', 'es'] as const) {
		const issueDate = language === 'es' ? '3 de octubre de 2026' : 'October 3, 2026';
		const startDate = language === 'es' ? '15 de abril de 2026' : 'April 15, 2026';

		test(`${language} assembles only the document contract from shared messages and the snapshot`, () => {
			const document = makeDocument(language);
			const messages = translations[language].attendance.document;
			expect(document).toEqual({
				language,
				title: messages.title,
				issuedDate: issueDate,
				recipient: ['Roberto Quiñones', 'SUPERVISOR de turno', 'Walgreens, Plaza del Sol'],
				paragraphs: [
					formatMessage(messages.openingFemale, { studentName: 'María Sofía Pagán Cruz' }),
					formatMessage(messages.participation, {
						startDate, shortName: 'María Sofía', schedule: translations[language].attendance.schedules.regular
					}),
					formatMessage(messages.accommodation, { shortName: 'María Sofía' }),
					formatMessage(messages.gratitude, { shortName: 'María Sofía' }),
					formatMessage(messages.issuance, { city: messages.city, issueDate, phone: messages.phone })
				],
				signature: { name: messages.signatory, role: messages.role, phone: messages.phone, email: messages.email },
				pageLabel: messages.page,
				filename: `2026-10-03_regular_maria-sofia-pagan-cruz_${language}.pdf`
			});
			expect(JSON.stringify(document)).not.toMatch(/\{\w+\}/);
		});

		test(`${language} uses the full title-cased name once and the first two tokens for repeated references`, () => {
			const document = makeDocument(language, { studentName: "ANA-MARÍA O'NEILL DEL RÍO" });
			expect(document.paragraphs[0]).toContain("Ana-María O'Neill Del Río");
			for (const paragraph of document.paragraphs.slice(1, 4)) {
				expect(paragraph).toContain("Ana-María O'Neill");
				expect(paragraph).not.toContain('Del Río');
			}
		});

		test(`${language} retains a single-token name in every student reference`, () => {
			for (const paragraph of makeDocument(language, { studentName: 'MARÍA' }).paragraphs.slice(0, 4)) {
				expect(paragraph).toContain('María');
				expect(paragraph).not.toContain('undefined');
			}
		});

		for (const studentSex of ['male', 'female'] as const) {
			test(`${language}/${studentSex} selects the matching translated opening`, () => {
				const messages = translations[language].attendance.document;
				const template = studentSex === 'male' ? messages.openingMale : messages.openingFemale;
				expect(makeDocument(language, { studentSex }).paragraphs[0])
					.toBe(formatMessage(template, { studentName: 'María Sofía Pagán Cruz' }));
			});
		}

		test(`${language} issues from San Juan and uses issuer contact configuration only`, () => {
			const document = makeDocument(language, { employerWorkplace: 'Ponce, Puerto Rico' });
			const messages = translations[language].attendance.document;
			expect(messages.city).toBe('San Juan');
			expect(document.paragraphs[4]).toContain('San Juan');
			expect(document.paragraphs[4]).not.toContain('Ponce');
			expect(document.paragraphs[4]).toContain(messages.phone);
			expect(document.signature.phone).toBe(messages.phone);
			expect(document.signature.email).toBe(messages.email);
			expect(document.signature.phone).not.toBe('');
			expect(document.signature.email).not.toBe('');
		});

		test(`${language} preserves the canonical input and is repeatable for a deeply frozen snapshot`, () => {
			const snapshot = makeCertificate();
			const original = structuredClone(snapshot);
			Object.freeze(snapshot.input);
			Object.freeze(snapshot);
			const document = presentAttendanceCertificate(snapshot, language);
			expect(presentAttendanceCertificate(snapshot, language)).toEqual(document);
			expect(snapshot).toEqual(original);
			expect(snapshot.input.studentName).toBe('MARÍA SOFÍA PAGÁN CRUZ');
			expect(snapshot.input.employerName).toBe('ROBERTO QUIÑONES');
		});

		test(`${language} returns detached arrays and signature data on every call`, () => {
			const snapshot = makeCertificate();
			const first = presentAttendanceCertificate(snapshot, language);
			const expected = structuredClone(first);
			first.recipient[0] = 'Changed recipient';
			first.paragraphs[0] = 'Changed paragraph';
			first.signature.name = 'Changed signatory';
			const second = presentAttendanceCertificate(snapshot, language);
			expect(second).toEqual(expected);
			expect(second.recipient).not.toBe(first.recipient);
			expect(second.paragraphs).not.toBe(first.paragraphs);
			expect(second.signature).not.toBe(first.signature);
		});

		test(`${language} retains µ/ƒ in body fields and supported internal positions in rendered names`, () => {
			const raw = {
				...makeCertificate().input,
				studentName: 'alµa riƒera',
				employerName: 'roµerto quiƒones',
				employerPosition: 'µg ƒ supervisor',
				employerWorkplace: 'ƒ laboratory, µg division'
			};
			const result = validateAttendanceInput(raw);
			expect(result.valid).toBe(true);
			if (!result.valid) throw new Error('Expected supported rendered text');
			const document = presentAttendanceCertificate({ input: result.input, issuedAt }, language);
			expect(result.input).toEqual(raw);
			expect(document.paragraphs[0]).toContain('Alµa Riƒera');
			expect(document.recipient).toEqual(['Roµerto Quiƒones', 'µg ƒ supervisor', 'ƒ laboratory, µg division']);
		});

		test(`${language} never exports unrelated runtime personal data`, () => {
			const input = { ...makeCertificate().input, contact: 'private-contact', identifier: 'private-identifier' };
			const document = presentAttendanceCertificate({ input, issuedAt }, language);
			expect(Object.keys(makeCertificate().input)).toEqual([...attendanceFields]);
			expect(Object.keys(document)).toEqual([
				'language', 'title', 'issuedDate', 'recipient', 'paragraphs', 'signature', 'pageLabel', 'filename'
			]);
			expect(Object.keys(document.signature)).toEqual(['name', 'role', 'phone', 'email']);
			expect(JSON.stringify(document)).not.toContain('private-');
		});
	}

	test('Spanish openings preserve aceptado/aceptada agreement', () => {
		const male = makeDocument('es', { studentSex: 'male' }).paragraphs[0];
		const female = makeDocument('es', { studentSex: 'female' }).paragraphs[0];
		expect(male).toMatch(/\baceptado\b/);
		expect(male).not.toMatch(/\baceptada\b/);
		expect(female).toMatch(/\baceptada\b/);
		expect(female).not.toMatch(/\baceptado\b/);
	});

	test('validation NFC normalization flows through to accented presentation and the ASCII filename', () => {
		const result = validateAttendanceInput({
			...makeCertificate().input,
			studentName: "  ANA-MARI\u0301A   O'NEILL DEL RI\u0301O  ",
			employerName: '  ROBERTO   QUIN\u0303ONES  '
		});
		expect(result.valid).toBe(true);
		if (!result.valid) throw new Error('Expected a valid normalized input');
		const document = presentAttendanceCertificate({ input: result.input, issuedAt }, 'es');
		expect(result.input.studentName).toBe("ANA-MARÍA O'NEILL DEL RÍO");
		expect(document.paragraphs[0]).toContain("Ana-María O'Neill Del Río");
		expect(document.recipient[0]).toBe('Roberto Quiñones');
		expect(document.filename).toBe('2026-10-03_regular_ana-maria-o-neill-del-rio_es.pdf');
	});
});

describe('attendance UTC and calendar-date presentation', () => {
	for (const [clock, datePrefix, spanishDate, englishDate] of [
		['2026-10-03T23:30:00-04:00', '2026-10-04', '4 de octubre de 2026', 'October 4, 2026'],
		['2026-10-03T00:30:00+14:00', '2026-10-02', '2 de octubre de 2026', 'October 2, 2026'],
		['2026-01-01T00:00:00.000Z', '2026-01-01', '1 de enero de 2026', 'January 1, 2026']
	] as const) {
		for (const language of ['en', 'es'] as const) {
			test(`${language} formats ${clock} and its filename using the UTC issuance day`, () => {
				const document = presentAttendanceCertificate(makeCertificate({}, clock), language);
				expect(document.issuedDate).toBe(language === 'es' ? spanishDate : englishDate);
				expect(document.paragraphs[4]).toContain(document.issuedDate);
				expect(document.filename).toBe(`${datePrefix}_regular_maria-sofia-pagan-cruz_${language}.pdf`);
			});
		}
	}

	for (const [programStartDate, spanishDate, englishDate] of [
		['0001-01-01', '1 de enero de 1', 'January 1, 1'],
		['0099-12-31', '31 de diciembre de 99', 'December 31, 99'],
		['2000-02-29', '29 de febrero de 2000', 'February 29, 2000'],
		['2026-01-01', '1 de enero de 2026', 'January 1, 2026'],
		['9999-12-31', '31 de diciembre de 9999', 'December 31, 9999']
	] as const) {
		for (const language of ['en', 'es'] as const) {
			test(`${language} renders calendar date ${programStartDate} without a timezone or early-year shift`, () => {
				const document = makeDocument(language, { programStartDate });
				expect(document.paragraphs[1]).toContain(language === 'es' ? spanishDate : englishDate);
			});
		}
	}

	test('Spanish long dates use all twelve month names without weekdays or clock times', () => {
		const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
			'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
		for (const [index, month] of months.entries()) {
			const calendarDate = `2026-${String(index + 1).padStart(2, '0')}-12`;
			const document = presentAttendanceCertificate(makeCertificate({ programStartDate: calendarDate },
				`${calendarDate}T00:00:00.000Z`), 'es');
			expect(document.issuedDate).toBe(`12 de ${month} de 2026`);
			expect(document.paragraphs[1]).toContain(`12 de ${month} de 2026`);
		}
	});
});

describe('bilingual attendance download filenames', () => {
	for (const language of ['en', 'es'] as const) {
		for (const cohort of ['basic', 'regular'] as const) {
			test(`${language}/${cohort} gets a language-specific date/cohort/name filename`, () => {
				expect(makeDocument(language, { cohort }).filename)
					.toBe(`2026-10-03_${cohort}_maria-sofia-pagan-cruz_${language}.pdf`);
			});
		}

		test(`${language} uses student for an entirely non-ASCII name while preserving it in the document`, () => {
			const document = makeDocument(language, { studentName: '李 小龍' });
			expect(document.filename).toBe(`2026-10-03_regular_student_${language}.pdf`);
			expect(document.paragraphs[0]).toContain('李 小龍');
		});

		test(`${language} prevents name punctuation from creating paths or changing the PDF extension`, () => {
			const document = makeDocument(language, { studentName: "../ JOSÉ / RIVERA_..\\ O'NEILL .pdf" });
			expect(document.filename).toBe(`2026-10-03_regular_jose-rivera-o-neill-pdf_${language}.pdf`);
			expect(document.filename).toMatch(/^\d{4}-\d{2}-\d{2}_(basic|regular)_[a-z0-9]+(?:-[a-z0-9]+)*_(en|es)\.pdf$/);
		});
	}

	test('English and Spanish downloads retain the same snapshot data but distinct filenames', () => {
		const snapshot = makeCertificate();
		const english = presentAttendanceCertificate(snapshot, 'en');
		const spanish = presentAttendanceCertificate(snapshot, 'es');
		expect(english.filename.replace('_en.pdf', '')).toBe(spanish.filename.replace('_es.pdf', ''));
		expect(english.filename).not.toBe(spanish.filename);
		expect(english.recipient).toEqual(spanish.recipient);
		expect(english.signature.phone).toBe(spanish.signature.phone);
		expect(english.signature.email).toBe(spanish.signature.email);
		expect(snapshot).toEqual(makeCertificate());
	});
});
