import { translations, type Language } from '../i18n/translations';
import type { CategoryKey, Grade, IstAssessment } from './types';

export interface IstReportRow {
	key: CategoryKey;
	label: string;
	result: string;
	thresholds: string[];
	grade: Grade;
	gradeLabel: string;
	outcome: string;
}

export interface IstReport {
	brand: string;
	brandDescription: string;
	title: string;
	subtitle: string;
	studentName: string;
	assessedAt: string;
	details: { label: string; value: string }[];
	columns: { category: string; result: string; thresholds: string; grade: string; outcome: string };
	rows: IstReportRow[];
	overallLabel: string;
	overall: string;
	passed: boolean;
	belowBaselineLabel: string;
	belowBaseline: string;
	disclaimer: string;
	pageLabel: string;
}

export function formatDuration(seconds: number): string {
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

// Presentation only: both the screen and PDF consume the already-evaluated assessment.
export function presentIstAssessment(assessment: IstAssessment, language: Language): IstReport {
	const messages = translations[language].ist;
	const locale = language === 'es' ? 'es-PR' : 'en-US';
	const number = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 20 }).format(value);
	const percent = (value: number) => `${new Intl.NumberFormat(locale, {
		minimumFractionDigits: 2, maximumFractionDigits: 2
	}).format(value)}%`;
	const date = new Intl.DateTimeFormat(locale, {
		dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC'
	}).format(new Date(assessment.assessedAt)) + ' UTC';
	const { input } = assessment;
	const rows: IstReportRow[] = assessment.exercises.map((exercise) => {
		const isTimed = exercise.key === 'run' || exercise.key === 'plank';
		const value = (count: number) => isTimed
			? `${formatDuration(count)} (${messages.units.minutesSeconds})`
			: `${number(count)} ${messages.units.repetitions}`;
		const thresholds = exercise.thresholds.kind === 'minimum'
			? [
				`${messages.report.minimum}: ${value(exercise.thresholds.minimum)}`,
				`${messages.report.midpoint}: ${value(exercise.thresholds.midpoint)}`,
				`${messages.report.referenceMaximum}: ${value(exercise.thresholds.referenceMaximum)}`
			]
			: [
				`${messages.report.greenLimit} ${value(exercise.thresholds.greenMaximum)}`,
				`${messages.report.passingLimit} ${value(exercise.thresholds.passingMaximum)}`
			];
		return {
			key: exercise.key,
			label: messages.categories[exercise.key],
			result: exercise.result.status === 'unable_to_complete' ? messages.unable : value(exercise.result.value),
			thresholds,
			grade: exercise.grade,
			gradeLabel: messages.grades[exercise.grade],
			outcome: exercise.passed ? messages.pass : messages.fail
		};
	});
	rows.push({
		key: 'bodyFat', label: messages.categories.bodyFat, result: percent(assessment.bodyFat.estimate),
		thresholds: [`${messages.report.ceiling}: ${percent(assessment.bodyFat.ceiling)}`],
		grade: assessment.bodyFat.grade, gradeLabel: messages.grades[assessment.bodyFat.grade],
		outcome: assessment.bodyFat.passed ? messages.pass : messages.fail
	});

	return {
		brand: translations[language].header.brand,
		brandDescription: translations[language].header.brandDescription,
		title: messages.report.title,
		subtitle: messages.report.subtitle,
		studentName: input.studentName,
		assessedAt: assessment.assessedAt,
		details: [
			{ label: messages.fields.studentName, value: input.studentName },
			{ label: messages.report.date, value: date },
			{ label: messages.fields.age, value: `${input.age}` },
			{ label: messages.report.ageBand, value: `${assessment.ageBand} ${messages.units.years}` },
			{ label: messages.fields.sex, value: messages.sexOptions[input.sex] },
			{ label: messages.fields.weightLb, value: `${number(input.weightLb)} ${messages.units.pounds}` },
			{ label: messages.fields.waistIn, value: `${number(input.waistIn)} ${messages.units.inches}` }
		],
		columns: {
			category: messages.report.category, result: messages.report.result, thresholds: messages.report.thresholds,
			grade: messages.report.grade, outcome: messages.report.outcome
		},
		rows,
		overallLabel: messages.overallLabel,
		overall: `${assessment.passed ? messages.pass : messages.fail} · ${assessment.passed ? messages.ready : messages.notReady}`,
		passed: assessment.passed,
		belowBaselineLabel: messages.belowBaseline,
		belowBaseline: assessment.belowBaseline.length
			? assessment.belowBaseline.map((key) => messages.categories[key]).join(', ')
			: messages.allPassed,
		disclaimer: messages.report.disclaimer,
		pageLabel: messages.report.page
	};
}
