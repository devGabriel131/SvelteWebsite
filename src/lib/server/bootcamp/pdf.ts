import type { Buffer } from 'node:buffer';
import { renderPdf } from '../pdf';
import logo from '../../../../static/logo.png?inline';
import organizerSignature from '../assets/organizer-signature.png?inline';
import { bootcampDocumentMessages } from '../../bootcamp/document-messages';
import { assertBootcampPdfText } from '../../bootcamp/pdf-text';
import { eventTimeZone, sectionKeys, type EventSnapshot, type LetterSnapshot, type WaiverSnapshot } from '../../bootcamp/types';
import { validateSignature } from './signatures';

const margin = 54;
const pageWidth = 612;
const contentWidth = pageWidth - 2 * margin;
const contentTop = 140;
const contentBottom = 738;
const ink = '#252C30';
const muted = '#60716F';
type Messages = typeof bootcampDocumentMessages['en' | 'es'];
type Style = { font: 'Helvetica' | 'Helvetica-Bold' | 'Times-Roman'; size: number; leading: number };
const body: Style = { font: 'Times-Roman', size: 11, leading: 15 };
const small: Style = { font: 'Helvetica', size: 9, leading: 13 };
const heading: Style = { font: 'Helvetica-Bold', size: 12, leading: 17 };


function dateTime(value: string, language: 'en' | 'es'): string {
	if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) throw new TypeError('Bootcamp timestamps must include a time-zone offset.');
	return new Intl.DateTimeFormat(language === 'es' ? 'es-PR' : 'en-US', {
		timeZone: eventTimeZone, dateStyle: 'long', timeStyle: 'medium', hourCycle: 'h23'
	}).format(new Date(value));
}

function birthDate(value: string, language: 'en' | 'es'): string {
	const date = new Date(`${value}T12:00:00Z`);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
		throw new TypeError('Invalid bootcamp date of birth.');
	}
	return new Intl.DateTimeFormat(language === 'es' ? 'es-PR' : 'en-US', {
		timeZone: eventTimeZone, dateStyle: 'long'
	}).format(date);
}

function createLayout(doc: PDFKit.PDFDocument, messages: Messages, title: string) {
	let y = contentTop;
	let section = '';

	function draw(text: string, x: number, top: number, style: Style, color = ink): void {
		doc.font(style.font).fontSize(style.size).fillColor(color)
			.text(text, x, top, { lineBreak: false });
	}

	function newPage(nextSection = section): void {
		section = nextSection;
		doc.addPage();
		// Vite embeds data URLs; Bun resolves these same asset imports to local files.
		doc.image(logo, pageWidth - margin - 64, margin, { width: 64, height: 64 });
		draw(messages.brand, margin, 56, heading);
		draw(title, margin, 79, small);
		draw(messages.timeZone, margin, 96, small, muted);
		if (section) draw(section, margin, 113, small, muted);
		doc.strokeColor('#70959D').lineWidth(1).moveTo(margin, 130).lineTo(pageWidth - margin, 130).stroke();
		y = contentTop;
	}

	function ensure(height: number): void {
		if (y + height > contentBottom) newPage();
	}

	function wrap(text: string, style: Style): string[] {
		assertBootcampPdfText(text);
		doc.font(style.font).fontSize(style.size);
		const lines: string[] = [];
		// Preserve every space and punctuation mark in the snapshot. Only line endings
		// become layout; oversized tokens are split without truncation or added hyphens.
		for (const paragraph of text.split(/\r\n|\r|\n/)) {
			let line = '';
			for (const token of paragraph.match(/ +|[^ ]+/g) ?? []) {
				if (doc.widthOfString(line + token) <= contentWidth) {
					line += token;
					continue;
				}
				if (line) lines.push(line);
				line = '';
				for (const character of token) {
					if (line && doc.widthOfString(line + character) > contentWidth) {
						lines.push(line);
						line = '';
					}
					line += character;
				}
			}
			lines.push(line);
		}
		return lines;
	}

	function write(text: string, style: Style = body, gap = 9): void {
		const lines = wrap(text, style);
		const height = lines.length * style.leading;
		if (height <= contentBottom - contentTop) ensure(height);
		for (const line of lines) {
			ensure(style.leading);
			draw(line, margin, y, style);
			y += style.leading;
		}
		y += gap;
	}

	function field(label: string, value: string): void {
		write(`${label}: ${value}`, small, 3);
	}

	function signature(image: string, label: string, details: string[], bottomAligned = false): void {
		const lines = [label, ...details].flatMap((text) => wrap(text, small));
		const imageHeight = 54;
		const height = imageHeight + 6 + lines.length * small.leading;
		if (height > contentBottom - contentTop) throw new RangeError('Bootcamp signature block is too tall for a page.');
		y += 10;
		ensure(height);
		if (bottomAligned) y = contentBottom - height;
		doc.image(image, margin, y, { fit: [210, imageHeight] });
		y += imageHeight + 6;
		for (const line of lines) {
			draw(line, margin, y, small);
			y += small.leading;
		}
		y += 12;
	}

	function organizer(bottomAligned = false): void {
		signature(organizerSignature, messages.labels.organizerSignature, [
			messages.organizer.name, messages.organizer.role, messages.organizer.phone, messages.organizer.email
		], bottomAligned);
	}

	function event(event: EventSnapshot, language: 'en' | 'es'): void {
		field(messages.labels.event, event.title);
		field(messages.labels.eventId, event.id);
		field(messages.labels.revision, String(event.revision));
		field(messages.labels.venue, event.venue);
		field(messages.labels.startsAt, dateTime(event.startsAt, language));
		field(messages.labels.endsAt, dateTime(event.endsAt, language));
		field(messages.labels.arrivalAt, dateTime(event.arrivalAt, language));
		y += 9;
	}

	return { newPage, ensure, write, field, signature, organizer, event };
}

function render(language: 'en' | 'es', title: string, time: string, draw: (layout: ReturnType<typeof createLayout>) => void): Promise<Buffer> {
	const messages = bootcampDocumentMessages[language];
	return renderPdf({
		size: 'LETTER', autoFirstPage: false, lang: language,
		margins: { top: margin, bottom: margin, left: margin, right: margin },
		info: { Title: title, Author: messages.organizer.name, Subject: title,
			CreationDate: new Date(time), ModDate: new Date(time) }
	}, (doc) => draw(createLayout(doc, messages, title)));
}

/** Render the selected language's canonical legal text and its three matching signatures. */
export async function renderWaiverPdf(snapshot: WaiverSnapshot): Promise<Buffer> {
	const { event, student, language, signedAt } = snapshot;
	const messages = bootcampDocumentMessages[language];
	const signatures = Object.fromEntries(sectionKeys.map((key) => [key, validateSignature(snapshot.signatures[key])]));
	for (const key of sectionKeys) {
		const text = event.legal[language][key];
		if (typeof text !== 'string' || !text.trim()) throw new TypeError(`Missing bootcamp legal section: ${key}.`);
		assertBootcampPdfText(text);
	}
	const signingTime = dateTime(signedAt, language);
	return render(language, messages.waiverTitle, signedAt, (layout) => {
		layout.newPage();
		layout.event(event, language);
		layout.write(messages.labels.student, heading);
		layout.field(messages.labels.name, student.name);
		layout.field(messages.labels.email, student.email);
		layout.field(messages.labels.dateOfBirth, birthDate(student.dateOfBirth, language));
		layout.field(messages.labels.phone, student.phone);
		layout.field(messages.labels.municipality, student.municipality);
		layout.field(messages.labels.signingCity, student.signingCity);
		layout.field(messages.labels.signedAt, signingTime);
		for (const key of sectionKeys) {
			// Starting each section on its own page makes signature association unambiguous,
			// even when the approved text spans several pages. No template substitutions.
			layout.newPage(messages.sections[key]);
			layout.write(messages.sections[key], heading);
			layout.write(event.legal[language][key]);
			layout.signature(signatures[key], `${messages.labels.participantSignature} — ${messages.sections[key]}`, [
				student.name,
				`${messages.labels.signedAt}: ${signingTime}`,
				`${messages.labels.signingCity}: ${student.signingCity}`
			]);
			layout.organizer();
		}
	});
}

/** A bootcamp-specific request to excuse planned participation, not proof of attendance. */
export async function renderLetterPdf(snapshot: LetterSnapshot): Promise<Buffer> {
	const { event, student, employer, language, issuedAt } = snapshot;
	const messages = bootcampDocumentMessages[language];
	const issuedTime = dateTime(issuedAt, language);
	return render(language, messages.letterTitle, issuedAt, (layout) => {
		layout.newPage();
		layout.field(messages.labels.issuedAt, issuedTime);
		for (const key of ['employer', 'contact', 'position', 'workplace'] as const) layout.field(messages.labels[key], employer[key]);
		layout.write(messages.letterTitle, heading);
		layout.write(messages.letter.introduction(student.name));
		layout.write(messages.letter.participation(student.name, event.title,
			dateTime(event.startsAt, language), dateTime(event.endsAt, language), event.venue, dateTime(event.arrivalAt, language)));
		layout.write(messages.letter.request(student.name));
		layout.write(messages.letter.thanks);
		layout.write(messages.letter.contact(messages.organizer.phone, messages.organizer.email));
		layout.organizer(true);
	});
}
