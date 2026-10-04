import {

	type CategoryKey,
	type ExerciseAssessment,
	type ExerciseKey,
	type ExerciseResult,
	type IstAssessment,
	type IstInput,
	type SexBaseline
} from './types';

const ageBands = [
	[17, 21], [22, 26], [27, 31], [32, 36], [37, 41], [42, 46], [47, 51]
] as const;

type ThresholdPair = readonly [minimum: number, referenceMaximum: number];

const pushUpThresholds: Record<SexBaseline, readonly ThresholdPair[]> = {
	male: [[42, 71], [40, 75], [39, 77], [36, 75], [34, 73], [30, 66], [25, 59]],
	female: [[19, 42], [17, 46], [17, 50], [15, 45], [13, 40], [12, 37], [12, 37]]
};
const sitUpThresholds: readonly ThresholdPair[] = [
	[53, 78], [50, 80], [45, 82], [42, 76], [38, 76], [32, 72], [30, 66]
];
const plankThresholds: readonly ThresholdPair[] = [
	[90, 220], [85, 215], [80, 210], [75, 205], [70, 200], [70, 200], [70, 200]
];
const runThresholds = {
	male: { greenMaximum: 465, passingMaximum: 510 },
	female: { greenMaximum: 585, passingMaximum: 630 }
} as const;

export function calculateRawBodyFat(sex: SexBaseline, weightLb: number, waistIn: number): number {
	return sex === 'male'
		? -26.97 - 0.12 * weightLb + 1.99 * waistIn
		: -9.15 - 0.015 * weightLb + 1.27 * waistIn;
}

function assessMinimum(
	key: Exclude<ExerciseKey, 'run'>,
	result: ExerciseResult,
	[minimum, referenceMaximum]: ThresholdPair
): ExerciseAssessment {
	const midpoint = Math.floor((minimum + referenceMaximum) / 2);
	const grade = result.status === 'unable_to_complete' || result.value < minimum
		? 'red'
		: result.value >= midpoint ? 'green' : 'yellow';

	return {
		key,
		result,
		grade,
		passed: grade !== 'red',
		thresholds: { kind: 'minimum', minimum, referenceMaximum, midpoint }
	};
}

function assessRun(result: ExerciseResult, sex: SexBaseline): ExerciseAssessment {
	const thresholds = runThresholds[sex];
	const grade = result.status === 'unable_to_complete' || result.value > thresholds.passingMaximum
		? 'red'
		: result.value <= thresholds.greenMaximum ? 'green' : 'yellow';

	return {
		key: 'run',
		result,
		grade,
		passed: grade !== 'red',
		thresholds: { kind: 'run', ...thresholds }
	};
}

export function assessIst(input: IstInput, assessedAt: string): IstAssessment {
	const rawBodyFat = calculateRawBodyFat(input.sex, input.weightLb, input.waistIn);
	if (!Number.isFinite(rawBodyFat) || rawBodyFat < 0 || rawBodyFat > 100) {
		throw new RangeError('Raw body-fat estimate must be finite and between 0 and 100.');
	}

	const bandIndex = ageBands.findIndex(([minimum, maximum]) =>
		Number.isInteger(input.age) && input.age >= minimum && input.age <= maximum
	);
	if (bandIndex === -1) {
		throw new RangeError('IST age must be a whole number between 17 and 51.');
	}

	const [minimumAge, maximumAge] = ageBands[bandIndex];
	const exercises = [
		assessMinimum('pushUps', input.pushUps, pushUpThresholds[input.sex][bandIndex]),
		assessMinimum('sitUps', input.sitUps, sitUpThresholds[bandIndex]),
		assessMinimum('plank', input.plank, plankThresholds[bandIndex]),
		assessRun(input.run, input.sex)
	];
	// Raw validity is checked first; ordinary floating-point rounding matches Go math.Round here.
	const estimate = Math.round(rawBodyFat * 100) / 100;
	const ceiling = (bandIndex === 0 ? 20 : bandIndex === 1 ? 22 : bandIndex <= 4 ? 24 : 26)
		+ (input.sex === 'female' ? 10 : 0);
	const bodyFatPassed = estimate <= ceiling;
	const belowBaseline: CategoryKey[] = exercises
		.filter(({ passed }) => !passed)
		.map(({ key }) => key);
	if (!bodyFatPassed) belowBaseline.push('bodyFat');

	return {
		input,
		assessedAt,
		ageBand: `${minimumAge}–${maximumAge}`,
		exercises,
		bodyFat: { estimate, ceiling, grade: bodyFatPassed ? 'green' : 'red', passed: bodyFatPassed },
		passed: belowBaseline.length === 0,
		belowBaseline
	};
}
