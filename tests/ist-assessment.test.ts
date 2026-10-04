import { describe, expect, test } from 'bun:test';
import { assessIst, calculateRawBodyFat } from '../src/lib/ist/assessment';
import {
	exerciseKeys,
	type CategoryKey,
	type ExerciseKey,
	type Grade,
	type IstInput,
	type SexBaseline
} from '../src/lib/ist/types';

const assessedAt = '2026-10-03T12:00:00.000Z';
const sexes: readonly SexBaseline[] = ['male', 'female'];
const bands = [
	{ ages: [17, 21], label: '17–21', malePush: [42, 71], femalePush: [19, 42], sit: [53, 78], plank: [90, 220], maleFat: 20 },
	{ ages: [22, 26], label: '22–26', malePush: [40, 75], femalePush: [17, 46], sit: [50, 80], plank: [85, 215], maleFat: 22 },
	{ ages: [27, 31], label: '27–31', malePush: [39, 77], femalePush: [17, 50], sit: [45, 82], plank: [80, 210], maleFat: 24 },
	{ ages: [32, 36], label: '32–36', malePush: [36, 75], femalePush: [15, 45], sit: [42, 76], plank: [75, 205], maleFat: 24 },
	{ ages: [37, 41], label: '37–41', malePush: [34, 73], femalePush: [13, 40], sit: [38, 76], plank: [70, 200], maleFat: 24 },
	{ ages: [42, 46], label: '42–46', malePush: [30, 66], femalePush: [12, 37], sit: [32, 72], plank: [70, 200], maleFat: 26 },
	{ ages: [47, 51], label: '47–51', malePush: [25, 59], femalePush: [12, 37], sit: [30, 66], plank: [70, 200], maleFat: 26 }
] as const;

function makeInput(overrides: Partial<IstInput> = {}): IstInput {
	const sex = overrides.sex ?? 'male';
	return {
		studentName: 'Alex Rivera',
		sex,
		age: 21,
		weightLb: sex === 'male' ? 170 : 130,
		waistIn: sex === 'male' ? 33 : 30,
		pushUps: { status: 'recorded', value: 100 },
		sitUps: { status: 'recorded', value: 100 },
		plank: { status: 'recorded', value: 300 },
		run: { status: 'recorded', value: 450 },
		...overrides
	};
}

function waistForFat(sex: SexBaseline, weightLb: number, target: number): number {
	return sex === 'male'
		? (target + 26.97 + 0.12 * weightLb) / 1.99
		: (target + 9.15 + 0.015 * weightLb) / 1.27;
}

function getExercise(input: IstInput, key: ExerciseKey) {
	const exercise = assessIst(input, assessedAt).exercises.find((exercise) => exercise.key === key);
	if (!exercise) throw new Error(`Missing exercise ${key}`);
	return exercise;
}

describe('age-band and sex-specific exercise baselines', () => {
	for (const sex of sexes) {
		for (const band of bands) {
			for (let age = band.ages[0]; age <= band.ages[1]; age++) {
				test(`${sex} age ${age} uses age band ${band.label}`, () => {
					expect(assessIst(makeInput({ sex, age }), assessedAt).ageBand).toBe(band.label);
				});
			}

			for (const age of band.ages) {
				for (const key of ['pushUps', 'sitUps', 'plank'] as const) {
					const [minimum, referenceMaximum] = key === 'pushUps'
						? sex === 'male' ? band.malePush : band.femalePush
						: key === 'sitUps' ? band.sit : band.plank;
					const midpoint = Math.floor((minimum + referenceMaximum) / 2);
					const cases: readonly [number, Grade][] = [
						[0, 'red'],
						[minimum - 1, 'red'],
						[minimum, 'yellow'],
						[midpoint - 1, 'yellow'],
						[midpoint, 'green'],
						[referenceMaximum, 'green'],
						[referenceMaximum + 1, 'green'],
						[key === 'plank' ? 3600 : 300, 'green']
					];

					for (const [value, grade] of cases) {
						test(`${sex} age ${age}: ${key} ${value} is ${grade}`, () => {
							const result = { status: 'recorded', value } as const;
							expect(getExercise(makeInput({ sex, age, [key]: result }), key)).toEqual({
								key,
								result,
								grade,
								passed: grade !== 'red',
								thresholds: { kind: 'minimum', minimum, referenceMaximum, midpoint }
							});
						});
					}
				}
			}
		}
	}
});

describe('age-independent run baselines', () => {
	for (const sex of sexes) {
		const greenMaximum = sex === 'male' ? 465 : 585;
		const passingMaximum = sex === 'male' ? 510 : 630;
		const cases: readonly [number, Grade][] = [
			[1, 'green'],
			[greenMaximum - 1, 'green'],
			[greenMaximum, 'green'],
			[greenMaximum + 1, 'yellow'],
			[passingMaximum - 1, 'yellow'],
			[passingMaximum, 'yellow'],
			[passingMaximum + 1, 'red'],
			[3600, 'red']
		];
		for (const band of bands) {
			for (const age of band.ages) {
				for (const [value, grade] of cases) {
					test(`${sex} age ${age}: run ${value}s is ${grade}`, () => {
						const result = { status: 'recorded', value } as const;
						expect(getExercise(makeInput({ sex, age, run: result }), 'run')).toEqual({
							key: 'run',
							result,
							grade,
							passed: grade !== 'red',
							thresholds: { kind: 'run', greenMaximum, passingMaximum }
						});
					});
				}
			}
		}
	}
});

describe('body-fat formulas and rounding', () => {
	for (const { sex, age, weightLb, waistIn, raw, estimate, ceiling, passed } of [
		{ sex: 'male', age: 21, weightLb: 170, waistIn: 34, raw: 20.29, estimate: 20.29, ceiling: 20, passed: false },
		{ sex: 'male', age: 21, weightLb: 170, waistIn: 33, raw: 18.30, estimate: 18.30, ceiling: 20, passed: true },
		{ sex: 'female', age: 22, weightLb: 130, waistIn: 30, raw: 27, estimate: 27, ceiling: 32, passed: true },
		{ sex: 'male', age: 21, weightLb: 170.5, waistIn: 33.25, raw: 18.7375, estimate: 18.74, ceiling: 20, passed: true },
		{ sex: 'female', age: 22, weightLb: 130.5, waistIn: 30.25, raw: 27.31, estimate: 27.31, ceiling: 32, passed: true }
	] as const) {
		test(`${sex} age ${age}, ${weightLb}lb, ${waistIn}in estimates ${estimate}%`, () => {
			expect(calculateRawBodyFat(sex, weightLb, waistIn)).toBeCloseTo(raw, 10);
			const assessment = assessIst(makeInput({ sex, age, weightLb, waistIn }), assessedAt);
			expect(assessment.bodyFat).toEqual({ estimate, ceiling, grade: passed ? 'green' : 'red', passed });
			expect(assessment.passed).toBe(passed);
			expect(assessment.belowBaseline).toEqual(passed ? [] : ['bodyFat']);
		});
	}

	for (const sex of sexes) {
		for (const band of bands) {
			const ceiling = band.maleFat + (sex === 'female' ? 10 : 0);
			for (const age of band.ages) {
				for (const [offset, roundedOffset, passed] of [
					[-0.006, -0.01, true],
					[-0.004, 0, true],
					[0, 0, true],
					[0.004, 0, true],
					[0.006, 0.01, false]
				] as const) {
					test(`${sex} age ${age}: fat ceiling ${ceiling}, offset ${offset}`, () => {
						const weightLb = sex === 'male' ? 170 : 130;
						const waistIn = waistForFat(sex, weightLb, ceiling + offset);
						const assessment = assessIst(makeInput({ sex, age, weightLb, waistIn }), assessedAt);
						expect(calculateRawBodyFat(sex, weightLb, waistIn)).toBeCloseTo(ceiling + offset, 10);
						expect(assessment.bodyFat).toEqual({
							estimate: ceiling + roundedOffset,
							ceiling,
							grade: passed ? 'green' : 'red',
							passed
						});
						expect(assessment.passed).toBe(passed);
					});
				}
			}
		}
	}

	test('rounds an exact positive half-cent away from zero', () => {
		const input = makeInput({ sex: 'female', weightLb: 130, waistIn: 24.5 });
		expect(calculateRawBodyFat(input.sex, input.weightLb, input.waistIn) * 100).toBe(2001.5);
		expect(assessIst(input, assessedAt).bodyFat.estimate).toBe(20.02);
	});

	test('does not add epsilon to a floating-point value just below a half-cent', () => {
		const input = makeInput({ sex: 'female', weightLb: 130, waistIn: 24.492125984251967 });
		const raw = calculateRawBodyFat(input.sex, input.weightLb, input.waistIn);
		expect(raw * 100).toBe(2000.4999999999995);
		expect(assessIst(input, assessedAt).bodyFat.estimate).toBe(20);
	});

	test('keeps the actual formula arithmetic rather than repairing a nominal half-cent', () => {
		const input = makeInput({ weightLb: 170, waistIn: 33.861809045226124 });
		expect(calculateRawBodyFat(input.sex, input.weightLb, input.waistIn) * 100).toBe(2001.4999999999993);
		expect(assessIst(input, assessedAt).bodyFat.estimate).toBe(20.01);
	});

	for (const target of [0, 100]) {
		test(`accepts raw body-fat endpoint ${target} without clamping`, () => {
			const input = makeInput({ waistIn: waistForFat('male', 170, target) });
			expect(calculateRawBodyFat(input.sex, input.weightLb, input.waistIn)).toBe(target);
			expect(assessIst(input, assessedAt).bodyFat.estimate).toBe(target);
		});
	}

	for (const sex of sexes) {
		for (const target of [-0.004, -1, 100.004, 101]) {
			test(`defensively rejects ${sex} raw body fat ${target} before rounding`, () => {
				const weightLb = sex === 'male' ? 170 : 130;
				const input = makeInput({ sex, weightLb, waistIn: waistForFat(sex, weightLb, target) });
				const raw = calculateRawBodyFat(input.sex, input.weightLb, input.waistIn);
				if (target === -0.004) expect(Object.is(Math.round(raw * 100) / 100, -0)).toBe(true);
				if (target === 100.004) expect(Math.round(raw * 100) / 100).toBe(100);
				expect(() => assessIst(input, assessedAt)).toThrow(RangeError);
			});
		}
	}

	for (const sex of sexes) {
		for (const field of ['weightLb', 'waistIn'] as const) {
			for (const value of [NaN, Infinity, -Infinity]) {
				test(`defensively rejects ${sex} nonfinite ${field} ${value}`, () => {
					expect(() => assessIst(makeInput({ sex, [field]: value }), assessedAt)).toThrow(RangeError);
				});
			}
		}
	}
});

describe('overall assessment and purity', () => {
	for (const sex of sexes) {
		for (const key of [...exerciseKeys, 'bodyFat'] as const) {
			test(`a single failed ${sex} category ${key} fails the overall assessment`, () => {
				const input = makeInput({ sex });
				if (key === 'bodyFat') {
					input.waistIn = waistForFat(sex, input.weightLb, sex === 'male' ? 20.01 : 30.01);
				} else {
					input[key] = { status: 'recorded', value: key === 'run' ? (sex === 'male' ? 511 : 631) : 0 };
				}
				const assessment = assessIst(input, assessedAt);
				expect(assessment.passed).toBe(false);
				expect(assessment.belowBaseline).toEqual([key]);
			});
		}

		for (const key of exerciseKeys) {
			test(`${sex} unable_to_complete ${key} is red and fails overall`, () => {
				const input = makeInput({ sex, [key]: { status: 'unable_to_complete' } });
				const assessment = assessIst(input, assessedAt);
				expect(getExercise(input, key)).toMatchObject({ result: { status: 'unable_to_complete' }, grade: 'red', passed: false });
				expect(assessment.passed).toBe(false);
				expect(assessment.belowBaseline).toEqual([key]);
			});
		}

		test(`${sex} all exercises unable_to_complete yields four failures in display order`, () => {
			const input = makeInput({ sex });
			for (const key of exerciseKeys) input[key] = { status: 'unable_to_complete' };
			const assessment = assessIst(input, assessedAt);
			expect(assessment.exercises.map(({ key }) => key)).toEqual(['pushUps', 'sitUps', 'plank', 'run']);
			expect(assessment.exercises.every(({ grade, passed }) => grade === 'red' && !passed)).toBe(true);
			expect(assessment.bodyFat.passed).toBe(true);
			expect(assessment.passed).toBe(false);
			expect(assessment.belowBaseline).toEqual(['pushUps', 'sitUps', 'plank', 'run']);
		});

		test(`${sex} all yellow exercise grades and green body fat pass overall`, () => {
			const input = makeInput({
				sex,
				pushUps: { status: 'recorded', value: sex === 'male' ? 42 : 19 },
				sitUps: { status: 'recorded', value: 53 },
				plank: { status: 'recorded', value: 90 },
				run: { status: 'recorded', value: sex === 'male' ? 510 : 630 }
			});
			const assessment = assessIst(input, assessedAt);
			expect(assessment.exercises.map(({ grade }) => grade)).toEqual(['yellow', 'yellow', 'yellow', 'yellow']);
			expect(assessment.passed).toBe(true);
			expect(assessment.belowBaseline).toEqual([]);
		});
	}

	test('lists all failed categories with body fat last', () => {
		const input = makeInput({ waistIn: 34 });
		for (const key of exerciseKeys) input[key] = { status: 'unable_to_complete' };
		const expected: CategoryKey[] = ['pushUps', 'sitUps', 'plank', 'run', 'bodyFat'];
		expect(assessIst(input, assessedAt).belowBaseline).toEqual(expected);
	});

	test('returns the supplied input and timestamp deterministically without mutation', () => {
		const input = makeInput();
		for (const key of exerciseKeys) Object.freeze(input[key]);
		Object.freeze(input);
		const snapshot = structuredClone(input);
		const first = assessIst(input, assessedAt);
		expect(first).toEqual(assessIst(input, assessedAt));
		expect(first.input).toEqual(snapshot);
		expect(input).toEqual(snapshot);
		expect(first.assessedAt).toBe(assessedAt);
		expect(first.exercises.map(({ key }) => key)).toEqual(['pushUps', 'sitUps', 'plank', 'run']);
		expect(first.passed).toBe(true);
		expect(first.belowBaseline).toEqual([]);
		expect(assessIst(input, 'caller-supplied timestamp').assessedAt).toBe('caller-supplied timestamp');
		expect(assessIst(input, '').assessedAt).toBe('');
	});

	test('does not expose shared mutable threshold tables', () => {
		const input = makeInput();
		const first = assessIst(input, assessedAt);
		const thresholds = first.exercises[0].thresholds;
		if (thresholds.kind !== 'minimum') throw new Error('Expected minimum thresholds');
		thresholds.minimum = 999;
		expect(getExercise(input, 'pushUps').thresholds).toEqual({ kind: 'minimum', minimum: 42, referenceMaximum: 71, midpoint: 56 });
	});

	for (const age of [16, 52, 21.5, NaN, Infinity, -Infinity]) {
		test(`rejects an invalid assessment age ${age}`, () => {
			expect(() => assessIst(makeInput({ age }), assessedAt)).toThrow(RangeError);
		});
	}
});
