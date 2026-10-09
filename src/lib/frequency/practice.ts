import { roundSize, type AnswerOutcome } from './rules';
import { isCorrectAnswer, isSpanishOption, type FrequencyWord } from './vocabulary';

export interface ItemProgress {
	correctCount: number;
	incorrectCount: number;
	skippedCount: number;
	lastPracticedAt: number | null;
	lastOutcome: AnswerOutcome | null;
}

export type VocabularyProgress = Readonly<Record<string, ItemProgress>>;

export interface PracticeCard {
	id: string;
	word: FrequencyWord;
	position: number;
}

export interface CardAnswer {
	cardId: string;
	word: FrequencyWord;
	position: number;
	value: string | null;
	outcome: AnswerOutcome;
	answeredAt: number;
}

export interface PracticeRound {
	id: string;
	pool: readonly FrequencyWord[];
	progress: VocabularyProgress;
	currentCard: PracticeCard | null;
	answers: CardAnswer[];
	complete: boolean;
}

export function selectNextWord(
	pool: readonly FrequencyWord[],
	progress: VocabularyProgress,
	random: () => number = Math.random,
	previousWordId?: string
): FrequencyWord | null {
	if (!pool.length) return null;

	const minimum = pool.reduce(
		(count, word) => Math.min(count, progress[word.id]?.correctCount ?? 0),
		Infinity
	);
	const eligible = pool.filter((word) => (progress[word.id]?.correctCount ?? 0) === minimum);
	const alternatives = eligible.filter((word) => word.id !== previousWordId);
	const candidates = alternatives.length ? alternatives : eligible;
	const weights = candidates.map(
		(word) => 1 + (progress[word.id]?.incorrectCount ?? 0) + (progress[word.id]?.skippedCount ?? 0)
	);
	let remaining = random() * weights.reduce((total, weight) => total + weight, 0);

	for (const [index, word] of candidates.entries()) {
		if (remaining < weights[index]) return word;
		remaining -= weights[index];
	}

	return candidates[candidates.length - 1];
}

export function startRound(
	pool: readonly FrequencyWord[],
	progress: VocabularyProgress = {},
	options: { id?: string; random?: () => number; previousWordId?: string } = {}
): PracticeRound {
	const id = options.id ?? crypto.randomUUID();
	const word = selectNextWord(pool, progress, options.random, options.previousWordId);

	return {
		id,
		pool: [...pool],
		progress,
		currentCard: word ? { id: `${id}:1`, word, position: 1 } : null,
		answers: [],
		complete: false
	};
}

export function answerCard(
	round: PracticeRound,
	cardId: string,
	value: string | null,
	answeredAt: number = Date.now()
): PracticeRound {
	const card = round.currentCard;
	if (
		round.complete ||
		!card ||
		card.id !== cardId ||
		round.answers.some((answer) => answer.cardId === cardId)
	) {
		return round;
	}

	if (value !== null && !isSpanishOption(value)) return round;

	const outcome = value === null ? 'skipped' : isCorrectAnswer(card.word, value) ? 'correct' : 'incorrect';
	const previous = round.progress[card.word.id] ?? {
		correctCount: 0,
		incorrectCount: 0,
		skippedCount: 0,
		lastPracticedAt: null,
		lastOutcome: null
	};
	const answers: CardAnswer[] = [
		...round.answers,
		{ cardId, word: card.word, position: card.position, value, outcome, answeredAt }
	];

	return {
		...round,
		progress: {
			...round.progress,
			[card.word.id]: {
				correctCount: previous.correctCount + (outcome === 'correct' ? 1 : 0),
				incorrectCount: previous.incorrectCount + (outcome === 'incorrect' ? 1 : 0),
				skippedCount: previous.skippedCount + (outcome === 'skipped' ? 1 : 0),
				lastPracticedAt: answeredAt,
				lastOutcome: outcome
			}
		},
		answers,
		complete: answers.length === roundSize
	};
}

export function advanceRound(
	round: PracticeRound,
	cardId: string,
	random: () => number = Math.random
): PracticeRound {
	const card = round.currentCard;
	if (
		!card ||
		card.id !== cardId ||
		!round.answers.some((answer) => answer.cardId === cardId)
	) {
		return round;
	}

	if (round.complete) return { ...round, currentCard: null };

	const word = selectNextWord(round.pool, round.progress, random, card.word.id);
	const position = card.position + 1;
	return {
		...round,
		currentCard: word ? { id: `${round.id}:${position}`, word, position } : null
	};
}

export function getCompleteness(pool: readonly FrequencyWord[], progress: VocabularyProgress) {
	let practicedItems = 0;
	let successfulItems = 0;
	let fullPassesCompleted = pool.length ? Infinity : 0;

	for (const word of pool) {
		const item = progress[word.id];
		const correctCount = item?.correctCount ?? 0;
		if (correctCount + (item?.incorrectCount ?? 0) + (item?.skippedCount ?? 0) > 0) practicedItems++;
		if (correctCount > 0) successfulItems++;
		fullPassesCompleted = Math.min(fullPassesCompleted, correctCount);
	}

	return {
		totalItems: pool.length,
		practicedItems,
		successfulItems,
		fullPassesCompleted,
		currentPass: fullPassesCompleted + 1,
		currentPassCompletedItems: pool.filter(
			(word) => (progress[word.id]?.correctCount ?? 0) > fullPassesCompleted
		).length
	};
}

export function wordsToReview(round: PracticeRound): FrequencyWord[] {
	const seen = new Set<string>();
	const words: FrequencyWord[] = [];
	for (const { word, outcome } of round.answers) {
		if (outcome === 'correct' || seen.has(word.id)) continue;
		seen.add(word.id);
		words.push(word);
	}
	return words;
}
