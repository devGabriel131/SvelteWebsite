export const exerciseKeys = ['pushUps', 'sitUps', 'plank', 'run'] as const;
export type ExerciseKey = (typeof exerciseKeys)[number];
export type CategoryKey = ExerciseKey | 'bodyFat';
export type SexBaseline = 'male' | 'female';
export type Grade = 'green' | 'yellow' | 'red';

export type ExerciseResult =
	| { status: 'recorded'; value: number }
	| { status: 'unable_to_complete' };

export interface IstInput {
	studentName: string;
	sex: SexBaseline;
	age: number;
	weightLb: number;
	waistIn: number;
	pushUps: ExerciseResult;
	sitUps: ExerciseResult;
	plank: ExerciseResult;
	run: ExerciseResult;
}

export const istFields = [
	'studentName', 'sex', 'age', 'weightLb', 'waistIn',
	'pushUpsStatus', 'pushUpsValue', 'sitUpsStatus', 'sitUpsValue',
	'runStatus', 'runMinutes', 'runSeconds',
	'plankStatus', 'plankMinutes', 'plankSeconds'
] as const;
export type IstField = (typeof istFields)[number];
export const exerciseValueFields = {
	pushUps: ['pushUpsValue'],
	sitUps: ['sitUpsValue'],
	plank: ['plankMinutes', 'plankSeconds'],
	run: ['runMinutes', 'runSeconds']
} as const satisfies Record<ExerciseKey, readonly IstField[]>;
export type IstFormValues = Record<IstField, string>;
export type ValidationCode =
	| 'required' | 'number' | 'whole' | 'range' | 'sex' | 'status' | 'inconsistent' | 'bodyFat';
export type IstErrors = Partial<Record<IstField, ValidationCode>>;
export type ValidationResult =
	| { valid: true; input: IstInput }
	| { valid: false; errors: IstErrors };

export interface RepetitionThresholds {
	minimum: number;
	referenceMaximum: number;
	midpoint: number;
}

export interface ExerciseAssessment {
	key: ExerciseKey;
	result: ExerciseResult;
	grade: Grade;
	passed: boolean;
	thresholds:
		| ({ kind: 'minimum' } & RepetitionThresholds)
		| { kind: 'run'; greenMaximum: number; passingMaximum: number };
}

export interface IstAssessment {
	input: IstInput;
	assessedAt: string;
	ageBand: string;
	exercises: ExerciseAssessment[];
	bodyFat: { estimate: number; ceiling: number; grade: 'green' | 'red'; passed: boolean };
	passed: boolean;
	belowBaseline: CategoryKey[];
}
