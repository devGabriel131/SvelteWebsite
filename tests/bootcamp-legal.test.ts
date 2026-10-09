import { describe, expect, test } from 'bun:test';
import { defaultLegalText } from '../src/lib/bootcamp/legal';
import { spanishBootcampLegal } from '../src/lib/bootcamp/legal-templates';
import { isSupportedPdfText } from '../src/lib/bootcamp/pdf-text';
import { sectionKeys } from '../src/lib/bootcamp/types';

const details = {
	venue: 'Cancha de Añasco', startsAt: '2027-03-06T11:30:01.000Z',
	endsAt: '2027-03-07T01:45:00.000Z', arrivalAt: '2027-03-06T10:45:02.000Z'
};

// Independent substitution oracle: preserve every supplied clause, space and paragraph.
function resolvedTemplate(section: typeof sectionKeys[number], values: Record<string, string>): string {
	return spanishBootcampLegal[section].replace(/\{(\w+)\}/g, (_, token: string) => {
		expect(values).toHaveProperty(token);
		return values[token];
	});
}

describe('canonical Spanish bootcamp legal text', () => {

	test('resolves every real token to Puerto Rico dates, second-precision 24-hour times, venue and fixed amounts', () => {
		const before = structuredClone(spanishBootcampLegal);
		const generated = defaultLegalText(details);
		const values = { eventDate: '6 de marzo de 2027', venue: details.venue,
			arrivalTime: '06:45:02', startTime: '07:30:01', price: '$30.00', deposit: '$15.00', balance: '$15.00' };
		for (const section of sectionKeys) {
			expect(generated.es[section]).toBe(resolvedTemplate(section, values));
			expect(generated.en[section]).toBe(generated.es[section]);
			expect(generated.es[section]).not.toMatch(/\{\w+\}/);
			expect(isSupportedPdfText(generated.es[section])).toBe(true);
		}
		expect(spanishBootcampLegal).toEqual(before);
	});

	test('Date objects and offset-bearing strings resolve to the same text without mutating inputs', () => {
		const dates = { venue: details.venue, startsAt: new Date(details.startsAt),
			endsAt: new Date(details.endsAt), arrivalAt: new Date(details.arrivalAt) };
		const before = structuredClone(dates);
		expect(defaultLegalText(dates)).toEqual(defaultLegalText(details));
		expect(defaultLegalText({ ...details, startsAt: '2027-03-06T07:30:01-04:00',
			endsAt: '2027-03-06T21:45:00-04:00', arrivalAt: '2027-03-06T06:45:02-04:00' })).toEqual(defaultLegalText(details));
		expect(dates).toEqual(before);
	});

	test('a single Puerto Rico day remains one date even when UTC crosses midnight', () => {
		const generated = defaultLegalText({ ...details, startsAt: '2028-01-01T02:03:04Z',
			endsAt: '2028-01-01T03:59:59Z', arrivalAt: '2028-01-01T01:30:05Z' });
		for (const section of sectionKeys) {
			expect(generated.es[section]).toBe(resolvedTemplate(section, { eventDate: '31 de diciembre de 2027',
				venue: details.venue, arrivalTime: '21:30:05', startTime: '22:03:04',
				price: '$30.00', deposit: '$15.00', balance: '$15.00' }));
		}
	});

	test('a multi-day event resolves the same complete Puerto Rico date range in agreement and liability', () => {
		const generated = defaultLegalText({ ...details, startsAt: '2028-01-01T02:03:04Z',
			endsAt: '2028-01-02T02:00:00Z', arrivalAt: '2028-01-01T01:30:05Z' });
		// The separator may be localized; both endpoints and their years must survive.
		const range = generated.es.agreement.match(/Fecha del Evento\n(.+), en Cancha de Añasco\./)?.[1];
		expect(range).toBeDefined();
		expect(range!).toMatch(/31 de diciembre de 2027.+1 de enero de 2028/);
		for (const section of sectionKeys) {
			expect(generated.es[section]).toBe(resolvedTemplate(section, { eventDate: range!, venue: details.venue,
				arrivalTime: '21:30:05', startTime: '22:03:04', price: '$30.00', deposit: '$15.00', balance: '$15.00' }));
		}
	});

	test('midnight check-in uses 00 rather than 24 and distinguishes check-in opening from latest arrival', () => {
		const generated = defaultLegalText({ ...details, startsAt: '2027-07-10T17:15:16Z',
			endsAt: '2027-07-10T22:00:00Z', arrivalAt: '2027-07-10T04:00:00Z' });
		expect(generated.es.agreement).toContain('El registro comienza a las 00:00:00.');
		expect(generated.es.agreement).toContain('No se aceptarán estudiantes después de las 13:15:16.');
		expect(generated.es.agreement).not.toContain('24:00:00');
	});

	test('overnight check-in includes its preceding Puerto Rico calendar date', () => {
		const generated = defaultLegalText({ ...details, startsAt: '2027-03-07T04:30:00Z',
			endsAt: '2027-03-07T12:00:00Z', arrivalAt: '2027-03-07T03:30:00Z' });
		expect(generated.es.agreement).toContain('Fecha del Evento\n7 de marzo de 2027, en');
		expect(generated.es.agreement).toContain('El registro comienza a las 23:30:00 (6 de marzo de 2027).');
		expect(generated.es.agreement).toContain('No se aceptarán estudiantes después de las 00:30:00.');
		expect(generated.en).toEqual(generated.es);
	});

	test('keeps the reviewed adult clauses and named releases, not fixed legacy dates, park or paper/minor instructions', () => {
		const generated = defaultLegalText(details).es;
		for (const clause of ['Armas: NO SE PERMITEN', 'FRENTE A CASAS', 'ÁREA DESTINADA DENTRO DEL BOOTCAMP PARA ACOMPAÑANTES',
			'No somos responsables por la pérdida de artículos personales.', 'TODO ESTUDIANTE FIRMARÁ UN RELEVO DE RESPONSABILIDAD.',
			'no será reembolsada bajo ninguna circunstancia si el estudiante no asiste', 'Sra. Menéndez']) {
			expect(generated.agreement).toContain(clause);
		}
		for (const entity of ['Masterminds Programa ASVAB', 'United States Army (US Army)', 'Oficina de Reclutamiento de Río Piedras',
			'Municipio de Bayamón', `${details.venue}, sus administradores y personal encargado`]) expect(generated.liability).toContain(entity);
		const text = Object.values(generated).join('\n');
		expect(text).not.toMatch(/2026-08-01|1 de agosto de 2026|August 1, 2026|\bparque\b|\b1600\b|\b0745\b/i);
		expect(text).not.toMatch(/copia impresa|entregad[oa] a mano|llevar una copia|traer una copia|\bmenores? de edad\b|\bpadres?\b|\bmadres?\b|\btutores?\b/i);
	});

	test('intentionally retains both contradictory media provisions rather than silently interpreting legal intent', () => {
		const { media } = defaultLegalText(details).es;
		expect(media).toContain('libre, voluntaria e irrevocable');
		expect(media).toContain('salvo revocación expresa por escrito');
		expect(media).toContain('la cual no afectará el uso de material previamente publicado');
	});
});
