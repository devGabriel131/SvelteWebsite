import { describe, expect, test } from 'bun:test';
import { inflateSync } from 'node:zlib';
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

type PdfText = { text: string; x: number; baseline: number; size: number; font: string; color: string };
type PdfPage = { texts: PdfText[] };

// Read PDFKit's standard-font text operators, not a general-purpose PDF parser.
// Structural checks and layout assertions need no system PDF utilities or test dependency.
function readPdf(pdf: Buffer): PdfPage[] {
	const source = pdf.toString('latin1');
	expect(source.startsWith('%PDF-1.3\n')).toBe(true);
	expect(source.trimEnd().endsWith('%%EOF')).toBe(true);
	const xrefOffset = Number(source.match(/startxref\n(\d+)\n/)?.[1]);
	expect(source.slice(xrefOffset, xrefOffset + 4)).toBe('xref');
	const objects = new Map([...source.matchAll(/(\d+) 0 obj\n([\s\S]*?)\nendobj/g)]
		.map((match) => [Number(match[1]), match[2]]));
	const decoder = new TextDecoder('windows-1252');
	const pages: PdfPage[] = [];
	for (const object of objects.values()) {
		if (!/\/Type \/Page\b/.test(object)) continue;
		expect(object).toContain('/MediaBox [0 0 612 792]');
		const resources = objects.get(Number(object.match(/\/Resources (\d+) 0 R/)?.[1]))!;
		const fonts = new Map([...resources.matchAll(/\/(F\d+) (\d+) 0 R/g)].map((match) => [
			match[1], objects.get(Number(match[2]))!.match(/\/BaseFont \/([^\s]+)/)![1]
		]));
		const content = objects.get(Number(object.match(/\/Contents (\d+) 0 R/)?.[1]))!;
		expect(content).toContain('/Filter /FlateDecode');
		const compressed = Buffer.from(content.match(/stream\n([\s\S]*?)\nendstream/)![1], 'latin1');
		const commands = inflateSync(compressed).toString('latin1');
		const texts: PdfText[] = [];
		for (const match of commands.matchAll(/BT\n([\s\S]*?)\nET/g)) {
			const matrix = match[1].match(/1 0 0 1 ([\d.-]+) ([\d.-]+) Tm/)!;
			const font = match[1].match(/\/(F\d+) ([\d.]+) Tf/)!;
			const bytes = Buffer.concat([...match[1].matchAll(/<([\da-f]+)>/gi)]
				.map((hex) => Buffer.from(hex[1], 'hex')));
			const rgb = [...commands.slice(0, match.index).matchAll(/([\d.]+) ([\d.]+) ([\d.]+) scn/g)].at(-1)!;
			const color = '#' + rgb.slice(1).map((channel) =>
				Math.round(Number(channel) * 255).toString(16).padStart(2, '0')).join('');
			texts.push({ text: decoder.decode(bytes), x: Number(matrix[1]),
				baseline: 792 - Number(matrix[2]), size: Number(font[2]), font: fonts.get(font[1])!, color });
		}
		pages.push({ texts });
	}
	const pageTree = [...objects.values()].find((object) => /\/Type \/Pages\b/.test(object))!;
	expect(Number(pageTree.match(/\/Count (\d+)/)?.[1])).toBe(pages.length);
	expect(pages.length).toBeGreaterThan(0);
	return pages;
}

function pageText(page: PdfPage): string {
	return normalize(page.texts.map(({ text }) => text).join(' '));
}
function expectReportText(pages: PdfPage[], report: IstReport): void {
	const text = pages.map(pageText).join(' ');
	for (const value of [report.title, report.subtitle, ...report.details.flatMap(({ label, value }) => [label, value]),
		...Object.values(report.columns), ...report.rows.flatMap((row) => [row.label, row.result,
			...row.thresholds, row.gradeLabel, row.outcome]), report.overallLabel, report.overall,
		report.belowBaselineLabel, report.belowBaseline, report.disclaimer]) {
		expect(text).toContain(normalize(value));
	}
}

function expectReadable(pages: PdfPage[], report: IstReport): void {
	const metrics = new PDFDocument({ autoFirstPage: false });
	try {
		for (const [index, page] of pages.entries()) {
			const footer = page.texts.filter(({ text }) => text === `${report.pageLabel} ${index + 1}`);
			expect(footer).toHaveLength(1);
			expect(footer[0].baseline).toBeGreaterThan(756);
			const boxes = page.texts.map((line) => {
				metrics.font(line.font).fontSize(line.size);
				return { line, left: line.x, right: line.x + metrics.widthOfString(line.text),
					top: line.baseline - line.size * 0.718, bottom: line.baseline + line.size * 0.207 };
			});
			for (const box of boxes) {
				expect(box.left).toBeGreaterThanOrEqual(41.99);
				expect(box.right).toBeLessThanOrEqual(570.01);
				if (box.line !== footer[0]) {
					expect(box.top).toBeGreaterThanOrEqual(41.99);
					expect(box.bottom).toBeLessThanOrEqual(736);
				}
			}
			for (let first = 0; first < boxes.length; first++) {
				for (let second = first + 1; second < boxes.length; second++) {
					const a = boxes[first];
					const b = boxes[second];
					const horizontalOverlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
					const verticalOverlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
					expect(horizontalOverlap > 0.01 && verticalOverlap > 0.01,
						`Overlapping text: ${a.line.text} / ${b.line.text}`).toBe(false);
				}
			}
		}
	} finally {
		metrics.resume();
		metrics.end();
	}
}

function freezeReport(report: IstReport): void {
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

		test(`${language} keeps decimals, the full accented name, all details, and the assessment date in UTC`, () => {
			const report = makeReport(language);
			const messages = translations[language].ist;
			expect(report.studentName).toBe('José María Muñoz');
			expect(report.assessedAt).toBe(assessedAt);
			expect(report.details).toEqual([
				{ label: messages.fields.studentName, value: 'José María Muñoz' },
				{ label: messages.report.date, value: new Intl.DateTimeFormat(language === 'es' ? 'es-PR' : 'en-US',
					{ dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(assessedAt)) + ' UTC' },
				{ label: messages.fields.age, value: '22' },
				{ label: messages.report.ageBand, value: `22–26 ${messages.units.years}` },
				{ label: messages.fields.sex, value: messages.sexOptions.female },
				{ label: messages.fields.weightLb, value: `130.5 ${messages.units.pounds}` },
				{ label: messages.fields.waistIn, value: `30.25 ${messages.units.inches}` }
			]);
			expect(report.details[1].value).toContain(language === 'es' ? '3 de octubre de 2026' : 'October 3, 2026');
			expect(report.details[1].value).toContain('12:34');
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
		test(`${language} produces a readable one-page Letter PDF with all presented text and accented names`, async () => {
			const report = makeReport(language);
			const original = structuredClone(report);
			freezeReport(report);
			const bytes = await generateIstPdf(report);
			expect(Buffer.isBuffer(bytes)).toBe(true);
			const pages = readPdf(bytes);
			expect(pages).toHaveLength(1);
			expectReportText(pages, report);
			expectReadable(pages, report);
			expect(report).toEqual(original);
			const gradeTexts = pages[0].texts.filter(({ x, text }) =>
				x === 423 && report.rows.some((row) => row.gradeLabel === text));
			expect(new Set(gradeTexts.map(({ color }) => color)).size).toBe(3);
			for (const grade of language === 'es' ? ['Excelente', 'Aprobado', 'No Aprobado'] : ['Excellent', 'Passed', 'Not passed']) {
				const text = gradeTexts.find(({ text }) => text === grade)!;
				expect(text.font).toBe('Helvetica-Bold');
				expect(text.color).not.toBe('#172d3b');
			}
		});

		test(`${language} prints passing overall readiness and no below-baseline categories`, async () => {
			const report = makeReport(language, { sitUps: { status: 'recorded', value: 80 } });
			expect(report.passed).toBe(true);
			expect(report.belowBaseline).toBe(translations[language].ist.allPassed);
			const pages = readPdf(await generateIstPdf(report));
			expectReportText(pages, report);
			expectReadable(pages, report);
		});

		test(`${language} wraps a very long name, including unbroken words, without truncation across pages`, async () => {
			const name = 'José María Muñoz '.repeat(160) + 'Álvarez'.repeat(90) + ' Último apellido';
			const report = makeReport(language, { studentName: name });
			const pages = readPdf(await generateIstPdf(report));
			expect(pages.length).toBeGreaterThan(1);
			expect(pages[0].texts.some(({ x, size }) => x === 225 && size === 10)).toBe(true);
			const detailValues = pages.flatMap(({ texts }) => texts)
				.filter(({ x, size }) => x === 225 && size === 10).map(({ text }) => text).join('');
			const compactName = name.replace(/\s/g, '');
			expect(detailValues.replace(/\s/g, '').slice(0, compactName.length)).toBe(compactName);
			expect(pages.map(pageText).join(' ')).toContain('Último apellido');
			expect(pages.map(pageText).join(' ')).toContain(report.overall);
			expectReadable(pages, report);
		});
	}

	test('uses supplied row text, thresholds, grades, outcomes, and summary without inferring results', async () => {
		const report = makeReport('es');
		const columns = report.columns;
		report.columns = { outcome: columns.outcome, grade: columns.grade, thresholds: columns.thresholds,
			result: columns.result, category: columns.category };
		report.rows[0] = { ...report.rows[0], result: 'Resultado conservado', thresholds: ['Umbral conservado: 987.65'],
			grade: 'red', gradeLabel: 'Calificación conservada', outcome: 'Decisión conservada' };
		report.overall = 'Preparación conservada';
		report.belowBaseline = 'Lista conservada';
		const pages = readPdf(await generateIstPdf(report));
		expectReportText(pages, report);
		expectReadable(pages, report);
	});

	test('splits an oversized Spanish table row and repeats all column headers without losing content', async () => {
		const report = makeReport('es');
		const thresholds = Array.from({ length: 180 }, (_, index) =>
			`Umbral ${String(index).padStart(3, '0')}: información de evaluación con mínimo y máximo.`);
		report.rows = [{ ...report.rows[0], thresholds }];
		const pages = readPdf(await generateIstPdf(report));
		expect(pages.length).toBeGreaterThan(5);
		const thresholdText = pages.flatMap(({ texts }) => texts)
			.filter(({ x, font }) => x === 237 && font === 'Helvetica').map(({ text }) => text).join(' ');
		expect(normalize(thresholdText)).toBe(normalize(thresholds.join(' ')));
		for (const page of pages.filter(({ texts }) => texts.some(({ x }) => x === 237))) {
			for (const header of Object.values(report.columns)) expect(pageText(page)).toContain(header);
			expect(page.texts.some(({ x, font }) => x === 237 && font === 'Helvetica')).toBe(true);
		}
		expectReadable(pages, report);
	});

	test('moves a single row and its summary without leaving an orphan table header', async () => {
		const report = makeReport('es');
		report.rows = [report.rows[0]];
		report.details.push(...Array.from({ length: 14 }, (_, index) => ({ label: `Dato ${index}`, value: `Valor ${index}` })));
		const pages = readPdf(await generateIstPdf(report));
		expect(pages).toHaveLength(2);
		expect(pageText(pages[0])).not.toContain(report.columns.category);
		expect(pageText(pages[1])).toContain(report.columns.category);
		expect(pageText(pages[1])).toContain(report.rows[0].label);
		expect(pageText(pages[1])).toContain(report.overall);
		expectReportText(pages, report);
		expectReadable(pages, report);
	});

	test('wraps oversized below-baseline and disclaimer content over pages without clipping', async () => {
		const report = makeReport('es');
		report.belowBaseline = Array.from({ length: 120 }, (_, index) => `Categoría ${index}: preparación física`).join(', ');
		report.disclaimer = Array.from({ length: 60 }, (_, index) => `Nota ${index}: ${report.disclaimer}`).join('\n');
		const pages = readPdf(await generateIstPdf(report));
		expect(pages.length).toBeGreaterThan(4);
		const texts = pages.flatMap(({ texts }) => texts);
		const belowBaseline = texts.filter(({ x, font, size }) => x === 42 && font === 'Helvetica' && size === 10)
			.map(({ text }) => text).join(' ');
		const disclaimer = texts.filter(({ x, font, size }) => x === 42 && font === 'Helvetica' && size === 9)
			.map(({ text }) => text).join(' ');
		expect(normalize(belowBaseline)).toContain(normalize(report.belowBaseline));
		expect(normalize(disclaimer)).toBe(normalize(report.disclaimer));
		expectReadable(pages, report);
	});

	test('paginates many English rows and keeps the final row with the full summary when possible', async () => {
		const report = makeReport('en');
		report.rows = Array.from({ length: 25 }, (_, index) => ({ ...report.rows[index % 5],
			label: `Row ${String(index).padStart(2, '0')}` }));
		const pages = readPdf(await generateIstPdf(report));
		expect(pages.length).toBeGreaterThan(2);
		for (const page of pages) {
			for (const header of Object.values(report.columns)) expect(pageText(page)).toContain(header);
		}
		for (const row of report.rows) {
			expect(pages.filter((page) => pageText(page).includes(row.label))).toHaveLength(1);
		}
		const lastPage = pageText(pages[pages.length - 1]);
		expect(lastPage).toContain('Row 24');
		expect(lastPage).toContain(report.overall);
		expect(lastPage).toContain(report.belowBaseline);
		expect(lastPage).toContain(report.disclaimer);
		expectReadable(pages, report);
	});
});
