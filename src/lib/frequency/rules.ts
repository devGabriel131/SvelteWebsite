export const roundSize = 25;
export const answerOutcomes = ['correct', 'incorrect', 'skipped'] as const;
export type AnswerOutcome = (typeof answerOutcomes)[number];
