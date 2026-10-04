import { isCorrectAnswer, type FrequencyWord } from './vocabulary';

export type AnswerOutcome = 'correct' | 'incorrect' | 'skipped';

export interface CardAnswer {
	word: FrequencyWord;
	value: string | null;
	outcome: AnswerOutcome;
}

export interface PracticeRound {
	words: readonly FrequencyWord[];
	index: number;
	answers: CardAnswer[];
	complete: boolean;
}

export function startRound(words: readonly FrequencyWord[]): PracticeRound {
	return { words: [...words], index: 0, answers: [], complete: words.length === 0 };
}

export function answerCard(round: PracticeRound, value: string | null): PracticeRound {
	if (round.complete || round.answers[round.index]) return round;
	const word = round.words[round.index];
	if (!word) return round;

	const outcome = value === null ? 'skipped' : isCorrectAnswer(word, value) ? 'correct' : 'incorrect';
	return { ...round, answers: [...round.answers, { word, value, outcome }] };
}

export function advanceRound(round: PracticeRound): PracticeRound {
	if (round.complete || !round.answers[round.index]) return round;
	return round.index === round.words.length - 1
		? { ...round, complete: true }
		: { ...round, index: round.index + 1 };
}

export function wordsToReview(round: PracticeRound): FrequencyWord[] {
	return round.answers.filter(({ outcome }) => outcome !== 'correct').map(({ word }) => word);
}
