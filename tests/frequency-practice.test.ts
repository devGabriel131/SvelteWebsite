import { describe, expect, test } from 'bun:test';
import { answerCard, advanceRound, startRound, wordsToReview } from '../src/lib/frequency/practice';
import { frequencyWords } from '../src/lib/frequency/vocabulary';

const words = frequencyWords.slice(0, 3);

describe('frequency practice rounds', () => {
	test('always starts with the source English-first words in their frequency order', () => {
		const round = startRound(words);
		expect(round).toEqual({ words, index: 0, answers: [], complete: false });
		expect(round.words).not.toBe(words);
		expect(round.words[0]).toEqual({ rank: 1, english: 'you', spanish: 'tú' });
	});

	test('cannot advance without answering or revealing the card', () => {
		const round = startRound(words);
		expect(advanceRound(round)).toBe(round);
	});

	test('grades a normalized selected answer exactly once per card', () => {
		const initial = startRound(words);
		const answered = answerCard(initial, ' TU ');
		expect(answered.answers).toEqual([{ word: words[0], value: ' TU ', outcome: 'correct' }]);
		expect(initial.answers).toEqual([]);
		expect(answerCard(answered, null)).toBe(answered);
		expect(answerCard(answered, 'yo')).toBe(answered);
		expect(wordsToReview(answered)).toEqual([]);
	});

	test('keeps incorrect and skipped words for review, in round order', () => {
		let round = startRound(words);
		round = advanceRound(answerCard(round, 'nosotros'));
		round = advanceRound(answerCard(round, null));
		round = answerCard(round, 'el');
		expect(round.answers.map(({ outcome }) => outcome)).toEqual(['incorrect', 'skipped', 'correct']);
		expect(wordsToReview(round)).toEqual(words.slice(0, 2));
		expect(round.complete).toBe(false);
	});

	test('waits for the final reveal before completing and cannot record extra answers', () => {
		const oneCard = startRound([words[0]]);
		const answered = answerCard(oneCard, null);
		expect(answered.complete).toBe(false);
		const complete = advanceRound(answered);
		expect(complete.complete).toBe(true);
		expect(complete.index).toBe(0);
		expect(advanceRound(complete)).toBe(complete);
		expect(answerCard(complete, 'tú')).toBe(complete);
	});

	test('a review round contains only missed cards, resets results, and can clear the review queue', () => {
		let initial = startRound(words);
		initial = advanceRound(answerCard(initial, null));
		initial = advanceRound(answerCard(initial, 'yo'));
		initial = advanceRound(answerCard(initial, 'incorrecta'));
		let review = startRound(wordsToReview(initial));
		expect(review.words).toEqual([words[0], words[2]]);
		expect(review.answers).toEqual([]);
		review = advanceRound(answerCard(review, 'tú'));
		review = advanceRound(answerCard(review, 'el'));
		expect(review.complete).toBe(true);
		expect(wordsToReview(review)).toEqual([]);
		expect(initial.answers).toHaveLength(3);
	});

	test('the next deck starts a clean round, including the one-card final deck', () => {
		const final = startRound(frequencyWords.slice(-1));
		expect(final.words).toEqual([{ rank: 1001, english: 'south', spanish: 'sur' }]);
		expect(advanceRound(answerCard(final, 'sur')).complete).toBe(true);
	});

	test('empty rounds are safely complete', () => {
		const round = startRound([]);
		expect(round.complete).toBe(true);
		expect(advanceRound(round)).toBe(round);
		expect(answerCard(round, null)).toBe(round);
		expect(wordsToReview(round)).toEqual([]);
	});
});
