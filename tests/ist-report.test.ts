import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { readPdf, type PdfPage, type PdfText } from './pdf';
import PDFDocument from 'pdfkit';
import { translations, type Language } from '../src/lib/i18n/translations';
import { assessIst } from '../src/lib/ist/assessment';
import { formatDuration, presentIstAssessment, type IstReport } from '../src/lib/ist/presentation';
import { exerciseKeys, type IstInput } from '../src/lib/ist/types';
import { generateIstPdf } from '../src/lib/server/ist-pdf';

const assessedAt = '2026-10-03T12:34:00.000Z';
function makeInput(overrides: Partial<IstInput> = {}): IstInput {
	return {
		studentName: 'José María Muñoz', sex: 'female', age: 22,
		weightLb: 130.5, waistIn: 30.25,
		pushUps: { status: 'recorded', value: 17 },
		sitUps: { status: 'unable_to_complete' },
		plank: { status: 'recorded', value: 215 },
		run: { status: 'recorded', value: 630 },
		...overrides
	};
}
function makeReport(language: Language, overrides: Partial<IstInput> = {}): IstReport {
	return presentIstAssessment(assessIst(makeInput(overrides), assessedAt), language);
}
const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();
const compact = (text: string) => text.replace(/\s/g, '');
const gradeColors = { green: '#17633d', yellow: '#795600', red: '#a32932' } as const;

type LocatedText = PdfText & { page: number; order: number };


function pageText(page: PdfPage): string {
	return normalize(page.texts.map(({ text }) => text).join(' '));
}

// Learn each text run's position/style from the PDF. Compact concatenation permits
// soft wraps and split words while still detecting dropped, reordered, or added characters.
function findTextBlock(pages: PdfPage[], value: string): LocatedText[] | undefined {
	const groups = new Map<string, LocatedText[]>();
	let order = 0;
	for (const [page, { texts, headerBottom }] of pages.entries()) {
		for (const text of texts) {
			const located = { ...text, page, order: order++ };
			if (!compact(text.text)) continue;
			// A left-aligned masthead can share the disclaimer's font and x position.
			const key = JSON.stringify([text.x, text.font, text.size, text.baseline < headerBottom]);
			const group = groups.get(key) ?? [];
			group.push(located);
			groups.set(key, group);
		}
	}
	const expected = compact(value);
	const matches: LocatedText[][] = [];
	for (const lines of groups.values()) {
		const start = lines.map(({ text }) => compact(text)).join('').indexOf(expected);
		if (start < 0) continue;
		let offset = 0;
		const matched = lines.filter(({ text }) => {
			const end = offset + compact(text).length;
			const overlaps = end > start && offset < start + expected.length;
			offset = end;
			return overlaps;
		});
		matches.push(matched);
	}
	return matches.sort((a, b) => a[0].order - b[0].order)[0];
}

function renderedBlock(pages: PdfPage[], value: string): LocatedText[] {
	const lines = findTextBlock(pages, value);
	expect(lines, `Missing report text: ${value.slice(0, 100)}`).toBeDefined();
	return lines!;
}

function expectPreservedBlock(pages: PdfPage[], value: string): LocatedText[] {
	const lines = renderedBlock(pages, value);
	expect(compact(lines.map(({ text }) => text).join(''))).toBe(compact(value));
	return lines;
}

function expectReportText(pages: PdfPage[], report: IstReport): void {
	for (const value of [report.brand, report.brandDescription, report.title, report.subtitle,
		...report.details.flatMap(({ label, value }) => [label, value]), ...Object.values(report.columns),
		...report.rows.flatMap((row) => [row.label, row.result, ...row.thresholds, row.gradeLabel, row.outcome]),
		report.overallLabel, report.overall, report.belowBaselineLabel, report.belowBaseline, report.disclaimer]) {
		renderedBlock(pages, value);
	}
}

function cardHeaders(report: IstReport): string[] {
	return [`${report.columns.category} · ${report.columns.result}`, report.columns.thresholds,
		`${report.columns.grade} · ${report.columns.outcome}`];
}

function expectCardHeaders(page: PdfPage, report: IstReport): LocatedText[] {
	const headers = cardHeaders(report).map((header) => renderedBlock([page], header));
	expect(headers[0][0].x).toBeLessThan(headers[1][0].x);
	expect(headers[1][0].x).toBeLessThan(headers[2][0].x);
	for (const header of headers) {
		expect(header[0].baseline).toBeCloseTo(headers[0][0].baseline, 2);
		for (const line of header) expect(line.font).toBe('Helvetica-Bold');
	}
	return headers.flat();
}

function expectSummaryBeforeCards(pages: PdfPage[], report: IstReport): void {
	const header = renderedBlock(pages, cardHeaders(report)[0])[0];
	for (const value of [report.overallLabel, report.overall, report.belowBaselineLabel, report.belowBaseline]) {
		for (const line of renderedBlock(pages, value)) expect(line.order).toBeLessThan(header.order);
	}
}

function expectDetailGroups(pages: PdfPage[], report: IstReport): void {
	const groups = [report.details.slice(0, 2), report.details.slice(2, 5), report.details.slice(5, 7)];
	for (let index = 7; index < report.details.length; index += 2) groups.push(report.details.slice(index, index + 2));
	let previous: LocatedText | undefined;
	for (const details of groups) {
		const labels = details.map(({ label }) => renderedBlock(pages, label)[0]);
		for (const [index, label] of labels.entries()) {
			expect(label.page).toBe(labels[0].page);
			expect(label.baseline).toBeCloseTo(labels[0].baseline, 2);
			if (index > 0) expect(label.x).toBeGreaterThan(labels[index - 1].x);
		}
		if (previous) expect(labels[0].order).toBeGreaterThan(previous.order);
		previous = labels.at(-1);
	}
}

function expectLogoOnEveryPage(pages: PdfPage[]): void {
	const logo = readFileSync(new URL('../static/logo.png', import.meta.url));
	const width = logo.readUInt32BE(16);
	const height = logo.readUInt32BE(20);
	for (const [index, page] of pages.entries()) {
		const logos = page.images.filter((image) => image.width === width && image.height === height);
		expect(logos.length, `Page ${index + 1} has no logo image XObject`).toBeGreaterThan(0);
		expect(page.imageDraws.some(({ name }) => logos.some((logo) => logo.name === name)),
			`Page ${index + 1} does not draw its logo XObject with Do`).toBe(true);
	}
}

function expectGradeColors(pages: PdfPage[], report: IstReport): void {
	const metrics = new PDFDocument({ autoFirstPage: false });
	try {
		for (const row of report.rows) {
			const matches = pages.flatMap((page) => {
				if (!findTextBlock([page], cardHeaders(report)[1])) return [];
				const thresholdColumn = renderedBlock([page], cardHeaders(report)[1])[0].x;
				return page.texts.filter(({ text, font, color, x, baseline, size }) => {
					if (text !== row.gradeLabel || font !== 'Helvetica-Bold') return false;
					metrics.font(font).fontSize(size);
					const right = x + metrics.widthOfString(text);
					return page.fills.some((fill) => fill.left > thresholdColumn && x >= fill.left
						&& right <= fill.right + 0.01 && baseline - size * 0.718 >= fill.top - 0.01
						&& baseline + size * 0.207 <= fill.bottom + 0.01
						&& (color === gradeColors[row.grade] || fill.color === gradeColors[row.grade]));
				});
			});
			const expectedCount = report.rows.filter((other) =>
				other.grade === row.grade && other.gradeLabel === row.gradeLabel).length;
			expect(matches.length, `Missing ${row.grade} grade pill/label/color: ${row.gradeLabel}`)
				.toBeGreaterThanOrEqual(expectedCount);
		}
	} finally {
		metrics.resume();
		metrics.end();
	}
}

function expectReadable(pages: PdfPage[]): void {
	const metrics = new PDFDocument({ autoFirstPage: false });
	try {
		for (const [index, page] of pages.entries()) {
			for (const font of page.fonts) expect(['Helvetica', 'Helvetica-Bold']).toContain(font);
			expect(page.texts.filter(({ text }) => /^(?:Page|Página) \d+$/.test(text))).toHaveLength(0);
			const boxes = page.texts.map((line) => {
				metrics.font(line.font).fontSize(line.size);
				return { line, left: line.x, right: line.x + metrics.widthOfString(line.text),
					top: line.baseline - line.size * 0.718, bottom: line.baseline + line.size * 0.207 };
			});

			for (const box of boxes) {
				expect(box.left).toBeGreaterThanOrEqual(41.99);
				expect(box.right).toBeLessThanOrEqual(570.01);
				expect(box.top).toBeGreaterThanOrEqual(41.99);
				expect(box.bottom).toBeLessThanOrEqual(736.01);
			}
			for (let first = 0; first < boxes.length; first++) {
				for (let second = first + 1; second < boxes.length; second++) {
					const a = boxes[first];
					const b = boxes[second];
					const horizontalOverlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
					const verticalOverlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
					expect(horizontalOverlap > 0.01 && verticalOverlap > 0.01,
						`Page ${index + 1} overlapping text: ${a.line.text} / ${b.line.text}`).toBe(false);
				}
			}
		}
	} finally {
		metrics.resume();
		metrics.end();
	}
}

function freezeReport(report: IstReport): void {
	expect(report.brand).toBeString();
	expect(report.brandDescription).toBeString();
	for (const detail of report.details) Object.freeze(detail);
	for (const row of report.rows) {
		Object.freeze(row.thresholds);
		Object.freeze(row);
	}
	Object.freeze(report.details);
	Object.freeze(report.rows);
	Object.freeze(report.columns);
	Object.freeze(report);
}

describe('IST report presentation', () => {
	for (const language of ['en', 'es'] as const) {
		test(`${language} report view uses every already-assessed exercise and body-fat row`, () => {
			const assessment = assessIst(makeInput(), assessedAt);
			const report = presentIstAssessment(assessment, language);
			const messages = translations[language].ist;
			expect(report).toMatchObject({ brand: translations[language].header.brand,
				brandDescription: translations[language].header.brandDescription,
				title: messages.report.title, subtitle: messages.report.subtitle });
			expect(report.rows.map(({ key }) => key)).toEqual([...exerciseKeys, 'bodyFat']);
			for (const [index, exercise] of assessment.exercises.entries()) {
				const row = report.rows[index];
				expect(row).toMatchObject({ key: exercise.key, label: messages.categories[exercise.key],
					grade: exercise.grade, gradeLabel: messages.grades[exercise.grade],
					outcome: exercise.passed ? messages.pass : messages.fail });
				const result = exercise.result.status === 'unable_to_complete' ? messages.unable
					: exercise.key === 'run' || exercise.key === 'plank'
						? `${formatDuration(exercise.result.value)} (${messages.units.minutesSeconds})`
						: `${exercise.result.value} ${messages.units.repetitions}`;
				expect(row.result).toBe(result);
				if (exercise.thresholds.kind === 'minimum') {
					const value = (count: number) => exercise.key === 'plank'
						? `${formatDuration(count)} (${messages.units.minutesSeconds})`
						: `${count} ${messages.units.repetitions}`;
					expect(row.thresholds).toEqual([
						`${messages.report.minimum}: ${value(exercise.thresholds.minimum)}`,
						`${messages.report.midpoint}: ${value(exercise.thresholds.midpoint)}`,
						`${messages.report.referenceMaximum}: ${value(exercise.thresholds.referenceMaximum)}`
					]);
				} else {
					expect(row.thresholds).toEqual([
						`${messages.report.greenLimit} 9:45 (${messages.units.minutesSeconds})`,
						`${messages.report.passingLimit} 10:30 (${messages.units.minutesSeconds})`
					]);
				}
			}
			expect(report.rows[4]).toEqual({ key: 'bodyFat', label: messages.categories.bodyFat,
				result: '27.31%', thresholds: [`${messages.report.ceiling}: 32.00%`], grade: 'green',
				gradeLabel: messages.grades.green, outcome: messages.pass });
			expect(report.passed).toBe(assessment.passed);
			expect(report.overall).toBe(`${messages.fail} · ${messages.notReady}`);
			expect(report.belowBaseline).toBe(messages.categories.sitUps);
			expect(report.disclaimer).toBe(messages.report.disclaimer);
		});

		test(`${language} keeps decimals, the full accented name, all details, and a date-only assessment date`, () => {
			const report = makeReport(language);
			const messages = translations[language].ist;
			expect(report.filename).toBe(`${language === 'es' ? 'informe-IST' : 'IST-report'}-2026-10-03.pdf`);
			expect(report).not.toHaveProperty('studentName');
			expect(report).not.toHaveProperty('assessedAt');
			expect(report).not.toHaveProperty('pageLabel');
			expect(report.details).toEqual([
				{ label: messages.fields.studentName, value: 'José María Muñoz' },
				{ label: messages.report.date, value: new Intl.DateTimeFormat(language === 'es' ? 'es-PR' : 'en-US',
					{ dateStyle: 'long', timeZone: 'UTC' }).format(new Date(assessedAt)) },
				{ label: messages.fields.age, value: '22' },
				{ label: messages.report.ageBand, value: `22–26 ${messages.units.years}` },
				{ label: messages.fields.sex, value: messages.sexOptions.female },
				{ label: messages.fields.weightLb, value: `130.5 ${messages.units.pounds}` },
				{ label: messages.fields.waistIn, value: `30.25 ${messages.units.inches}` }
			]);
			expect(report.details[1].value).toBe(language === 'es' ? '3 de octubre de 2026' : 'October 3, 2026');
			expect(makeReport(language, { sex: 'male', weightLb: 170.5, waistIn: 33.25 }).rows[4].result).toBe('18.74%');
		});

		test(`${language} female 585/630 durations keep the presented grades and threshold limits`, () => {
			for (const [seconds, duration, grade] of [[585, '9:45', 'green'], [630, '10:30', 'yellow']] as const) {
				const report = makeReport(language, { run: { status: 'recorded', value: seconds } });
				const messages = translations[language].ist;
				expect(report.rows[3].result).toBe(`${duration} (${messages.units.minutesSeconds})`);
				expect(report.rows[3].gradeLabel).toBe(messages.grades[grade]);
				expect(report.rows[3].outcome).toBe(messages.pass);
				expect(report.rows[3].thresholds).toEqual([
					`${messages.report.greenLimit} 9:45 (${messages.units.minutesSeconds})`,
					`${messages.report.passingLimit} 10:30 (${messages.units.minutesSeconds})`
				]);
			}
		});

		test(`${language} distinguishes recorded zero from inability in all exercise rows`, () => {
			const overrides = Object.fromEntries(exerciseKeys.map((key) => [key, { status: 'unable_to_complete' }])) as Partial<IstInput>;
			const report = makeReport(language, overrides);
			const messages = translations[language].ist;
			for (const row of report.rows.slice(0, 4)) {
				expect(row.result).toBe(messages.unable);
				expect(row.gradeLabel).toBe(messages.grades.red);
				expect(row.outcome).toBe(messages.fail);
			}
			expect(report.belowBaseline).toBe(exerciseKeys.map((key) => messages.categories[key]).join(', '));
			expect(makeReport(language, { pushUps: { status: 'recorded', value: 0 } }).rows[0].result).toBe('0 reps');
		});
	}

	test('presentation trusts an assessed snapshot instead of reassessing its input', () => {
		const assessment = assessIst(makeInput(), assessedAt);
		assessment.exercises[1].grade = 'green';
		assessment.exercises[1].passed = true;
		assessment.bodyFat = { estimate: 12.34, ceiling: 45, grade: 'red', passed: false };
		assessment.passed = true;
		assessment.belowBaseline = ['bodyFat'];
		const report = presentIstAssessment(assessment, 'es');
		expect(report.rows[1]).toMatchObject({ result: 'No pude completar', gradeLabel: 'Excelente', outcome: 'Aprobado' });
		expect(report.rows[4]).toMatchObject({ result: '12.34%', thresholds: ['Límite de grasa corporal: 45.00%'],
			gradeLabel: 'No Aprobado', outcome: 'No Aprobado' });
		expect(report.passed).toBe(true);
		expect(report.belowBaseline).toBe('Grasa corporal estimada');
	});
});

describe('IST PDF generation', () => {
	for (const language of ['en', 'es'] as const) {
		test(`${language} produces a branded one-page Letter PDF with all failing-report text and accented names`, async () => {
			const report = makeReport(language);
			expect(report.passed).toBe(false);
			const original = structuredClone(report);
			freezeReport(report);
			const bytes = await generateIstPdf(report);
			expect(Buffer.isBuffer(bytes)).toBe(true);
			const pages = readPdf(bytes);
			expect(pages).toHaveLength(1);
			expectReportText(pages, report);
			expectDetailGroups(pages, report);
			expectCardHeaders(pages[0], report);
			expectSummaryBeforeCards(pages, report);
			expectLogoOnEveryPage(pages);
			expectReadable(pages);
			expect(report).toEqual(original);
		});

		test(`${language} retains every grade label and its green, yellow, or red pill color`, async () => {
			const report = makeReport(language);
			expect(new Set(report.rows.map(({ grade }) => grade))).toEqual(new Set(['green', 'yellow', 'red']));
			const pages = readPdf(await generateIstPdf(report));
			expectGradeColors(pages, report);
			expectReportText(pages, report);
			expectReadable(pages);
		});

		test(`${language} keeps passing readiness before the cards on one page with no below-baseline categories`, async () => {
			const report = makeReport(language, { sitUps: { status: 'recorded', value: 80 } });
			expect(report.passed).toBe(true);
			expect(report.belowBaseline).toBe(translations[language].ist.allPassed);
			const pages = readPdf(await generateIstPdf(report));
			expect(pages).toHaveLength(1);
			expectReportText(pages, report);
			expectSummaryBeforeCards(pages, report);
			expectLogoOnEveryPage(pages);
			expectGradeColors(pages, report);
			expectReadable(pages);
		});

		test(`${language} renders inability, failing grades, and outcomes for all four exercises`, async () => {
			const overrides = Object.fromEntries(exerciseKeys.map((key) => [key, { status: 'unable_to_complete' }])) as Partial<IstInput>;
			const report = makeReport(language, overrides);
			const messages = translations[language].ist;
			expect(report.passed).toBe(false);
			for (const row of report.rows.slice(0, 4)) {
				expect(row).toMatchObject({ result: messages.unable, grade: 'red',
					gradeLabel: messages.grades.red, outcome: messages.fail });
			}
			const pages = readPdf(await generateIstPdf(report));
			expect(pages).toHaveLength(1);
			const text = compact(pages.map(pageText).join(' '));
			expect(text.split(compact(messages.unable)).length - 1).toBe(4);
			const headers = expectCardHeaders(pages[0], report);
			const headerBottom = Math.max(...headers.map(({ baseline }) => baseline));
			const content = { ...pages[0], texts: pages[0].texts.filter(({ baseline }) => baseline > headerBottom) };
			const starts = report.rows.map((row) => renderedBlock([content], row.label)[0].order);
			for (const [index, row] of report.rows.entries()) {
				const card = { ...content, texts: content.texts.slice(starts[index], starts[index + 1]) };
				for (const value of [row.label, row.result, ...row.thresholds, row.gradeLabel, row.outcome]) {
					renderedBlock([card], value);
				}
			}
			expectReportText(pages, report);
			expectSummaryBeforeCards(pages, report);
			expectGradeColors(pages, report);
			expectReadable(pages);
		});

		test(`${language} groups extra student details in pairs after the name/date, age/band/sex, and weight/waist groups`, async () => {
			const report = makeReport(language);
			report.details.push(...Array.from({ length: 5 }, (_, index) => ({
				label: `DatoExtraÑ${index}`, value: `ValorExtraÁ${index}`
			})));
			const pages = readPdf(await generateIstPdf(report));
			expectDetailGroups(pages, report);
			expectReportText(pages, report);
			expectSummaryBeforeCards(pages, report);
			expectReadable(pages);
		});

		test(`${language} preserves every character of a very long accented name and unbroken surname across pages`, async () => {
			const name = 'ÚrsulaJoséMaríaMuñoz ' + 'José María Muñoz '.repeat(160)
				+ 'Álvarez'.repeat(90) + ' ÚltimoApellidoÑandú';
			const report = makeReport(language, { studentName: name });
			const pages = readPdf(await generateIstPdf(report));
			const nameLines = expectPreservedBlock(pages, name);
			expect(new Set(nameLines.map(({ page }) => page)).size).toBeGreaterThan(1);
			expectReportText(pages, report);
			expectSummaryBeforeCards(pages, report);
			expectLogoOnEveryPage(pages);
			expectReadable(pages);
		});
	}

	test('uses supplied brand, row text, thresholds, grades, outcomes, and summary without inferring results', async () => {
		const report = makeReport('es');
		report.brand = 'Marca conservada';
		report.brandDescription = 'Descripción conservada';
		const columns = report.columns;
		report.columns = { outcome: columns.outcome, grade: columns.grade, thresholds: columns.thresholds,
			result: columns.result, category: columns.category };
		report.rows[0] = { ...report.rows[0], result: 'Resultado conservado', thresholds: ['Umbral conservado: 987.65'],
			grade: 'red', gradeLabel: 'Calificación conservada', outcome: 'Decisión conservada' };
		report.overall = 'Preparación conservada';
		report.belowBaseline = 'Lista conservada';
		const original = structuredClone(report);
		freezeReport(report);
		const pages = readPdf(await generateIstPdf(report));
		expectReportText(pages, report);
		expectCardHeaders(pages[0], report);
		expectSummaryBeforeCards(pages, report);
		expect(report).toEqual(original);
		expectReadable(pages);
	});

	test('embeds and draws the logo and brand header on every card-continuation page', async () => {
		const report = makeReport('es');
		report.rows = Array.from({ length: 20 }, (_, index) => ({ ...report.rows[index % 5], label: `TarjetaÑ${index}` }));
		const bytes = await generateIstPdf(report);
		expect(bytes.toString('latin1')).toContain('/Subtype /Image');
		const pages = readPdf(bytes);
		expect(pages.length).toBeGreaterThan(1);
		expectLogoOnEveryPage(pages);
		for (const page of pages) {
			renderedBlock([page], report.brand);
			renderedBlock([page], report.brandDescription);
		}
		expectReportText(pages, report);
		expectReadable(pages);
	});

	test('splits an oversized Spanish card, including an unbroken threshold, with repeated three-column headers and no lost characters', async () => {
		const report = makeReport('es');
		const thresholds = Array.from({ length: 180 }, (_, index) =>
			`Umbral ${String(index).padStart(3, '0')}: información de evaluación con mínimo y máximo.`);
		thresholds.splice(90, 0, 'InicioUmbralÑ' + 'ÁÉÍÓÚÑ'.repeat(180) + 'FinUmbralÑ');
		report.rows = [{ ...report.rows[0], thresholds }];
		const pages = readPdf(await generateIstPdf(report));
		expect(pages.length).toBeGreaterThan(5);
		const thresholdLines = expectPreservedBlock(pages, thresholds.join('\n'));
		const cardPages = new Set(thresholdLines.map(({ page }) => page));
		expect(cardPages.size).toBeGreaterThan(5);
		for (const [index, page] of pages.entries()) {
			if (cardPages.has(index)) {
				const headers = expectCardHeaders(page, report);
				const content = thresholdLines.filter(({ page }) => page === index);
				expect(Math.max(...headers.map(({ baseline }) => baseline)))
					.toBeLessThan(Math.min(...content.map(({ baseline }) => baseline)));
			} else expect(findTextBlock([page], cardHeaders(report)[0])).toBeUndefined();
		}
		expectReportText(pages, report);
		expectSummaryBeforeCards(pages, report);
		expectLogoOnEveryPage(pages);
		expectReadable(pages);
	});

	test('paginates extra detail pairs and places the top summary before a whole single card without orphan headers', async () => {
		const report = makeReport('es');
		report.rows = [{ ...report.rows[0], label: 'TarjetaÚnicaÑ', result: 'ResultadoÚnicoÑ',
			thresholds: ['UmbralÚnicoÑ: mínimo 17'], gradeLabel: 'CalificaciónÚnicaÑ', outcome: 'DecisiónÚnicaÑ' }];
		report.details.push(...Array.from({ length: 48 }, (_, index) => ({ label: `DatoÑ${index}`, value: `ValorÁ${index}` })));
		const pages = readPdf(await generateIstPdf(report));
		expect(pages.length).toBeGreaterThan(1);
		const row = report.rows[0];
		const rowLines = [row.label, row.result, ...row.thresholds, row.gradeLabel, row.outcome]
			.flatMap((value) => renderedBlock(pages, value));
		const cardPages = new Set(rowLines.map(({ page }) => page));
		expect(cardPages.size).toBe(1);
		for (const [index, page] of pages.entries()) {
			if (cardPages.has(index)) expectCardHeaders(page, report);
			else expect(findTextBlock([page], cardHeaders(report)[0])).toBeUndefined();
		}
		expectDetailGroups(pages, report);
		expectReportText(pages, report);
		expectSummaryBeforeCards(pages, report);
		expectLogoOnEveryPage(pages);
		expectReadable(pages);
	});

	test('preserves oversized readiness, below-baseline, and disclaimer text, including unbroken words, across pages', async () => {
		const report = makeReport('es');
		report.overall = 'InicioPreparaciónÑ ' + 'PreparaciónÁ'.repeat(700) + ' FinPreparaciónÑ';
		report.belowBaseline = 'InicioCategoríasÑ ' + Array.from({ length: 120 }, (_, index) =>
			`Categoría ${index}: preparación física`).join(', ') + ' ' + 'FísicaÑ'.repeat(180) + ' FinCategoríasÑ';
		report.disclaimer = 'InicioDescargoÑ\n' + Array.from({ length: 60 }, (_, index) =>
			`Nota ${index}: ${report.disclaimer}`).join('\n') + '\n' + 'EvaluaciónÁ'.repeat(180) + ' FinDescargoÑ';
		const pages = readPdf(await generateIstPdf(report));
		expect(pages.length).toBeGreaterThan(4);
		for (const value of [report.overall, report.belowBaseline, report.disclaimer]) {
			const lines = expectPreservedBlock(pages, value);
			expect(new Set(lines.map(({ page }) => page)).size).toBeGreaterThan(1);
		}
		expectReportText(pages, report);
		expectSummaryBeforeCards(pages, report);
		expectLogoOnEveryPage(pages);
		expectReadable(pages);
	});

	test('paginates many English cards with repeated headers, preserves each whole normal card, and keeps readiness first', async () => {
		const report = makeReport('en');
		report.rows = Array.from({ length: 25 }, (_, index) => {
			const row = report.rows[index % 5];
			const marker = String(index).padStart(2, '0');
			return { ...row, label: `Card ${marker}`, result: `Result ${marker}: ${row.result}`,
				thresholds: row.thresholds.map((threshold) => `Threshold ${marker}: ${threshold}`),
				gradeLabel: `${row.gradeLabel} ${marker}`, outcome: `${row.outcome} ${marker}` };
		});
		const pages = readPdf(await generateIstPdf(report));
		expect(pages.length).toBeGreaterThan(2);
		const cardPages = new Set<number>();
		for (const row of report.rows) {
			expect(pages.filter((page) => pageText(page).includes(row.label))).toHaveLength(1);
			const lines = [row.label, row.result, ...row.thresholds, row.gradeLabel, row.outcome]
				.flatMap((value) => renderedBlock(pages, value));
			const rowPages = new Set(lines.map(({ page }) => page));
			expect(rowPages.size, `Normal card split across pages: ${row.label}`).toBe(1);
			cardPages.add(lines[0].page);
		}
		for (const [index, page] of pages.entries()) {
			if (cardPages.has(index)) {
				const headers = expectCardHeaders(page, report);
				const labels = report.rows.flatMap((row) => findTextBlock([page], row.label) ?? []);
				expect(Math.max(...headers.map(({ baseline }) => baseline)))
					.toBeLessThan(Math.min(...labels.map(({ baseline }) => baseline)));
			} else expect(findTextBlock([page], cardHeaders(report)[0])).toBeUndefined();
		}
		expectReportText(pages, report);
		expectSummaryBeforeCards(pages, report);
		expectLogoOnEveryPage(pages);
		expectGradeColors(pages, report);
		expectReadable(pages);
	});
});
