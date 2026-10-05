import { describe, expect, spyOn, test } from 'bun:test';
import {
	answerCard,
	advanceRound,
	getCompleteness,
	roundSize,
	selectNextWord,
	startRound,
	wordsToReview,
	type ItemProgress,
	type PracticeCard,
	type PracticeRound,
	type VocabularyProgress
} from '../src/lib/frequency/practice';
import {
	frequencyWords,
	getSpanishAnswers,
	normalizeAnswer,
	spanishOptions,
	type FrequencyWord
} from '../src/lib/frequency/vocabulary';

const words = frequencyWords.slice(0, 3);
const [you, i, the] = words;
const zero = () => 0;

function itemProgress(overrides: Partial<ItemProgress> = {}): ItemProgress {
	return {
		correctCount: 0,
		incorrectCount: 0,
		skippedCount: 0,
		lastPracticedAt: null,
		lastOutcome: null,
		...overrides
	};
}

function currentCard(round: PracticeRound): PracticeCard {
	if (!round.currentCard) throw new Error('Expected a current practice card');
	return round.currentCard;
}

function respondAndAdvance(
	round: PracticeRound,
	value: string | null,
	answeredAt = 1000,
	random = zero
): PracticeRound {
	const { id } = currentCard(round);
	return advanceRound(answerCard(round, id, value, answeredAt), id, random);
}

function findWord(english: string): FrequencyWord {
	const word = frequencyWords.find((word) => word.english === english);
	if (!word) throw new Error(`Missing frequency word: ${english}`);
	return word;
}

describe('adaptive word selection', () => {
	test('an empty pool has no eligible word and does not use the RNG', () => {
		expect(
			selectNextWord([], { outside: itemProgress({ correctCount: 10 }) }, () => {
				throw new Error('An empty pool must not draw a word');
			})
		).toBeNull();
	});

	test('missing progress is zero and higher counts cannot bypass eligibility with retry weights', () => {
		const progress = {
			[you.id]: itemProgress({ correctCount: 3, incorrectCount: 10000 }),
			[the.id]: itemProgress({ correctCount: 1, skippedCount: 10000 }),
			outside: itemProgress({ correctCount: 0 })
		};
		for (const draw of [0, 0.25, 0.5, 0.999999]) {
			expect(selectNextWord(words, progress, () => draw)).toBe(i);
		}
	});

	test('explicit zero and absent progress rows are equally eligible', () => {
		const progress = {
			[you.id]: itemProgress({ correctCount: 1 }),
			[i.id]: itemProgress()
		};
		expect(selectNextWord(words, progress, zero)).toBe(i);
		expect(selectNextWord(words, progress, () => 0.5)).toBe(the);
	});

	test('all unpracticed words receive equal baseline weight with deterministic boundaries', () => {
		for (const [draw, word] of [
			[0, you],
			[1 / 3 - Number.EPSILON, you],
			[1 / 3, i],
			[2 / 3 - Number.EPSILON, i],
			[2 / 3, the],
			[0.999999, the]
		] as const) {
			expect(selectNextWord(words, {}, () => draw)).toBe(word);
			expect(selectNextWord(words, {}, () => draw)).toBe(word);
		}
	});

	test('minimum correct counts still control selection in later passes', () => {
		const progress = {
			[you.id]: itemProgress({ correctCount: 7, incorrectCount: 10000 }),
			[i.id]: itemProgress({ correctCount: 5 }),
			[the.id]: itemProgress({ correctCount: 5 })
		};
		expect(selectNextWord(words, progress, zero)).toBe(i);
		expect(selectNextWord(words, progress, () => 0.999999)).toBe(the);
	});

	test('wrong and skipped responses have the same additive retry weight', () => {
		const progress = {
			[you.id]: itemProgress({ correctCount: 4 }),
			[i.id]: itemProgress({ correctCount: 4, incorrectCount: 2 }),
			[the.id]: itemProgress({ correctCount: 4, skippedCount: 2 })
		};
		const draws: Record<string, number> = { [you.id]: 0, [i.id]: 0, [the.id]: 0 };
		for (let sample = 0; sample < 700; sample++) {
			const selected = selectNextWord(words, progress, () => (sample + 0.5) / 700)!;
			draws[selected.id]++;
		}
		expect(draws).toEqual({ [you.id]: 100, [i.id]: 300, [the.id]: 300 });
	});

	test('wrong and skipped counts accumulate together without changing the baseline weight', () => {
		const progress = { [you.id]: itemProgress({ incorrectCount: 1, skippedCount: 2 }) };
		expect(selectNextWord([you, i], progress, () => 0.799999)).toBe(you);
		expect(selectNextWord([you, i], progress, () => 0.8)).toBe(i);
	});

	test('excludes the previous ID whenever another eligible ID exists, even with a huge retry weight', () => {
		const progress = { [you.id]: itemProgress({ incorrectCount: 10000 }) };
		expect(selectNextWord(words, progress, zero, you.id)).toBe(i);
		expect(selectNextWord(words, progress, () => 0.999999, you.id)).toBe(the);
		expect(selectNextWord(words, {}, zero, 'outside')).toBe(you);
	});

	test('repeat avoidance preserves the weights of the remaining eligible words', () => {
		const progress = { [the.id]: itemProgress({ skippedCount: 2 }) };
		expect(selectNextWord(words, progress, () => 0.249999, you.id)).toBe(i);
		expect(selectNextWord(words, progress, () => 0.25, you.id)).toBe(the);
	});

	test('does not exclude a lone eligible word in favor of a higher-count alternative', () => {
		const progress = {
			[i.id]: itemProgress({ correctCount: 1 }),
			[the.id]: itemProgress({ correctCount: 2 })
		};
		expect(selectNextWord(words, progress, zero, you.id)).toBe(you);
		expect(selectNextWord([you], {}, zero, you.id)).toBe(you);
	});

	test('uses Math.random by default for selection, starting, and advancing', () => {
		const random = spyOn(Math, 'random').mockReturnValue(0.9);
		try {
			expect(selectNextWord(words, {})).toBe(the);
			const round = startRound(words, {}, { id: 'default-rng' });
			expect(currentCard(round).word).toBe(the);
			const answered = answerCard(round, currentCard(round).id, null, 1000);
			expect(currentCard(advanceRound(answered, currentCard(round).id)).word).toBe(i);
			expect(random).toHaveBeenCalledTimes(3);
		} finally {
			random.mockRestore();
		}
	});
});

describe('starting adaptive rounds', () => {
	test('starts a 25-attempt round with the selected 1-based card, not a preselected deck', () => {
		const progress = { [you.id]: itemProgress({ correctCount: 1 }) };
		const round = startRound(words, progress, { id: 'round-one', random: () => 0.9 });
		expect(roundSize).toBe(25);
		expect(round).toEqual({
			id: 'round-one',
			pool: words,
			progress,
			currentCard: { id: 'round-one:1', word: the, position: 1 },
			answers: [],
			complete: false
		});
		expect(round.pool).not.toBe(words);
		expect(round.progress).toBe(progress);
	});

	test('defaults to fresh random UUID round IDs and sparse empty progress', () => {
		const first = startRound([you]);
		const second = startRound([you]);
		expect(first.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
		expect(second.id).not.toBe(first.id);
		expect(currentCard(first).id).toBe(`${first.id}:1`);
		expect(first.progress).toEqual({});
	});

	test('avoids an immediate repeat across round boundaries without resetting supplied progress', () => {
		const previous = respondAndAdvance(startRound(words, {}, { id: 'old', random: zero }), null);
		const next = startRound(words, previous.progress, {
			id: 'new',
			random: zero,
			previousWordId: you.id
		});
		expect(next.progress).toBe(previous.progress);
		expect(next.answers).toEqual([]);
		expect(currentCard(next).word).toBe(i);
		expect(currentCard(next).position).toBe(1);
		expect(next.progress[you.id].skippedCount).toBe(1);
	});

	test('an empty round is partial, has no current card, and retains cumulative progress', () => {
		const progress = { [you.id]: itemProgress({ correctCount: 3 }) };
		const round = startRound([], progress, { id: 'empty', random: zero });
		expect(round.complete).toBe(false);
		expect(round.currentCard).toBeNull();
		expect(round.answers).toEqual([]);
		expect(round.progress).toBe(progress);
		expect(answerCard(round, 'empty:1', null, 1000)).toBe(round);
		expect(advanceRound(round, 'empty:1', zero)).toBe(round);
		expect(wordsToReview(round)).toEqual([]);
	});
});

describe('answer validation and immediate progress', () => {
	test.each([
		{ value: ' TU ', outcome: 'correct', correctCount: 5, incorrectCount: 2, skippedCount: 3 },
		{ value: 'yo', outcome: 'incorrect', correctCount: 4, incorrectCount: 3, skippedCount: 3 },
		{ value: null, outcome: 'skipped', correctCount: 4, incorrectCount: 2, skippedCount: 4 }
	] as const)('records $outcome separately without erasing previous correct answers', (example) => {
		const progress = {
			[you.id]: itemProgress({
				correctCount: 4,
				incorrectCount: 2,
				skippedCount: 3,
				lastPracticedAt: 500,
				lastOutcome: 'incorrect'
			}),
			[i.id]: itemProgress({ correctCount: 10 })
		};
		const initial = startRound([you], progress, { id: 'answer', random: zero });
		const card = currentCard(initial);
		const answered = answerCard(initial, card.id, example.value, 1234);
		expect(answered.answers).toEqual([
			{
				cardId: 'answer:1',
				word: you,
				position: 1,
				value: example.value,
				outcome: example.outcome,
				answeredAt: 1234
			}
		]);
		expect(answered.progress[you.id]).toEqual({
			correctCount: example.correctCount,
			incorrectCount: example.incorrectCount,
			skippedCount: example.skippedCount,
			lastPracticedAt: 1234,
			lastOutcome: example.outcome
		});
		expect(answered.progress[i.id]).toBe(progress[i.id]);
		expect(answered.currentCard).toBe(card);
		expect(answered.complete).toBe(false);
		expect(initial.answers).toEqual([]);
		expect(initial.progress[you.id]).toBe(progress[you.id]);
	});

	test('initializes an absent row and defaults the answer timestamp to Date.now()', () => {
		const now = spyOn(Date, 'now').mockReturnValue(4321);
		try {
			const initial = startRound([you], {}, { id: 'timestamp', random: zero });
			const answered = answerCard(initial, currentCard(initial).id, null);
			expect(answered.progress[you.id]).toEqual(
				itemProgress({ skippedCount: 1, lastPracticedAt: 4321, lastOutcome: 'skipped' })
			);
			expect(answered.answers[0].answeredAt).toBe(4321);
		} finally {
			now.mockRestore();
		}
	});

	test('accepts every reviewed primary and alternative answer with normalized spelling', () => {
		for (const word of frequencyWords) {
			for (const answer of getSpanishAnswers(word)) {
				const initial = startRound([word], {}, { id: 'reviewed-answer', random: zero });
				const value = ` \t${answer.normalize('NFD').toUpperCase().replace(/ /g, '\t  ')}\n `;
				const answered = answerCard(initial, currentCard(initial).id, value, 1000);
				expect(answered.answers[0]?.outcome).toBe('correct');
				expect(answered.answers[0]?.value).toBe(value);
				expect(answered.progress[word.id]?.correctCount).toBe(1);
			}
		}
	});

	test('accepts a recognized answer from the full pool, even when it is wrong for this word', () => {
		const initial = startRound([you], {}, { id: 'full-options', random: zero });
		const answered = answerCard(initial, currentCard(initial).id, ' SUR ', 1000);
		expect(spanishOptions).toContain('sur');
		expect(answered.answers[0].outcome).toBe('incorrect');
		expect(answered.progress[you.id].incorrectCount).toBe(1);
		expect(answered.progress[you.id].correctCount).toBe(0);
	});

	test.each(['', ' ', '\t\n', 'zzzzzzzz', 'graicas', 'auto / coche', 'porfavor'])(
		'rejects empty, whitespace, and unrecognized input %j without using an attempt',
		(value) => {
			const initial = startRound([you], {}, { id: 'validation', random: zero });
			const card = currentCard(initial);
			expect(answerCard(initial, card.id, value, 1000)).toBe(initial);
			expect(initial.progress).toEqual({});
			expect(advanceRound(initial, card.id, zero)).toBe(initial);
			const valid = answerCard(initial, card.id, you.spanish, 2000);
			expect(valid.answers).toHaveLength(1);
			expect(valid.answers[0].answeredAt).toBe(2000);
		}
	);

	test('skipping is accepted only as null, not as empty input', () => {
		const initial = startRound([you], {}, { id: 'skip', random: zero });
		const card = currentCard(initial);
		expect(answerCard(initial, card.id, '', 1000)).toBe(initial);
		const skipped = answerCard(initial, card.id, null, 2000);
		expect(skipped.answers[0]).toMatchObject({ value: null, outcome: 'skipped', answeredAt: 2000 });
		expect(skipped.progress[you.id].skippedCount).toBe(1);
	});

	test('ignores wrong card IDs and records a matching card submission only once', () => {
		const initial = startRound([you], {}, { id: 'idempotent', random: zero });
		const card = currentCard(initial);
		expect(answerCard(initial, 'other:1', null, 1000)).toBe(initial);
		expect(answerCard(initial, 'idempotent:2', null, 1000)).toBe(initial);
		const answered = answerCard(initial, card.id, ' TU ', 2000);
		expect(answerCard(answered, card.id, null, 3000)).toBe(answered);
		expect(answerCard(answered, card.id, 'yo', 3000)).toBe(answered);
		expect(answered.answers).toHaveLength(1);
		expect(answered.progress[you.id].lastPracticedAt).toBe(2000);
	});

	test('records later outcomes and timestamps while preserving the response history', () => {
		let round = startRound([you], {}, { id: 'history', random: zero });
		round = respondAndAdvance(round, you.spanish, 1000);
		round = respondAndAdvance(round, i.spanish, 2000);
		round = answerCard(round, currentCard(round).id, null, 3000);
		expect(round.progress[you.id]).toEqual({
			correctCount: 1,
			incorrectCount: 1,
			skippedCount: 1,
			lastPracticedAt: 3000,
			lastOutcome: 'skipped'
		});
		expect(round.answers.map(({ outcome, answeredAt }) => ({ outcome, answeredAt }))).toEqual([
			{ outcome: 'correct', answeredAt: 1000 },
			{ outcome: 'incorrect', answeredAt: 2000 },
			{ outcome: 'skipped', answeredAt: 3000 }
		]);
	});
});

describe('adaptive round lifecycle', () => {
	test('cannot advance an unanswered current card or an answered card with a mismatched ID', () => {
		const initial = startRound(words, {}, { id: 'advance', random: zero });
		const card = currentCard(initial);
		expect(advanceRound(initial, card.id, zero)).toBe(initial);
		const answered = answerCard(initial, card.id, null, 1000);
		expect(advanceRound(answered, 'advance:2', zero)).toBe(answered);
		const advanced = advanceRound(answered, card.id, zero);
		expect(currentCard(advanced)).toEqual({ id: 'advance:2', word: i, position: 2 });
		expect(advanced.answers).toBe(answered.answers);
		expect(advanced.progress).toBe(answered.progress);
		expect(advanceRound(advanced, card.id, zero)).toBe(advanced);
	});

	test('recalculates after each outcome and holds correct words back through subsequent passes', () => {
		let round = startRound([you, i], {}, { id: 'passes', random: zero });
		round = respondAndAdvance(round, you.spanish);
		expect(currentCard(round).word).toBe(i);
		round = respondAndAdvance(round, you.spanish);
		expect(currentCard(round).word).toBe(i);
		expect(round.progress[i.id].incorrectCount).toBe(1);
		round = respondAndAdvance(round, null);
		expect(currentCard(round).word).toBe(i);
		expect(round.progress[i.id].skippedCount).toBe(1);
		round = respondAndAdvance(round, i.spanish);
		expect(getCompleteness(round.pool, round.progress).fullPassesCompleted).toBe(1);
		expect(currentCard(round).word).toBe(you);
		round = respondAndAdvance(round, you.spanish);
		expect(currentCard(round).word).toBe(i);
		round = respondAndAdvance(round, i.spanish);
		expect(getCompleteness(round.pool, round.progress).fullPassesCompleted).toBe(2);
		expect(currentCard(round).word).toBe(you);
		expect(round.complete).toBe(false);
	});

	test('draws only on starting and advancing, so the reveal keeps the answered card', () => {
		let draws = 0;
		const random = () => {
			draws++;
			return draws === 1 ? 0 : 0.99;
		};
		const initial = startRound(words, {}, { id: 'reveal', random });
		const card = currentCard(initial);
		const answered = answerCard(initial, card.id, null, 1000);
		expect(draws).toBe(1);
		expect(answered.currentCard).toBe(card);
		const advanced = advanceRound(answered, card.id, random);
		expect(draws).toBe(2);
		expect(currentCard(advanced).word).toBe(the);
	});

	test('stale submissions after advancing cannot answer the next appearance of the same word', () => {
		const initial = startRound([you], {}, { id: 'repeat', random: zero });
		const oldId = currentCard(initial).id;
		const next = respondAndAdvance(initial, null, 1000);
		expect(currentCard(next).word).toBe(you);
		expect(currentCard(next).id).toBe('repeat:2');
		expect(answerCard(next, oldId, you.spanish, 2000)).toBe(next);
		expect(advanceRound(next, oldId, zero)).toBe(next);
		const answered = answerCard(next, currentCard(next).id, you.spanish, 3000);
		expect(answered.answers.map(({ cardId }) => cardId)).toEqual(['repeat:1', 'repeat:2']);
		expect(answered.progress[you.id].correctCount).toBe(1);
		expect(answered.progress[you.id].skippedCount).toBe(1);
	});

	test('old round card IDs cannot submit into a new round with the same word and position', () => {
		const old = startRound([you], {}, { id: 'old-round', random: zero });
		const oldId = currentCard(old).id;
		const answered = answerCard(old, oldId, null, 1000);
		const next = startRound([you], answered.progress, { id: 'next-round', random: zero });
		expect(answerCard(next, oldId, you.spanish, 2000)).toBe(next);
		expect(advanceRound(next, oldId, zero)).toBe(next);
		expect(next.answers).toEqual([]);
		expect(next.progress[you.id].skippedCount).toBe(1);
	});

	test.each([1, 2, 3, 25, frequencyWords.length])(
		'completes after exactly 25 accepted attempts with a pool of %i items',
		(poolSize) => {
			const pool = frequencyWords.slice(0, poolSize);
			let round = startRound(pool, {}, { id: `size-${poolSize}`, random: zero });
			for (let position = 1; position <= roundSize; position++) {
				const card = currentCard(round);
				expect(card.position).toBe(position);
				round = answerCard(round, card.id, card.word.spanish, position * 1000);
				expect(round.complete).toBe(position === roundSize);
				expect(round.currentCard).toBe(card);
				if (position < roundSize) round = advanceRound(round, card.id, zero);
			}
			expect(round.answers).toHaveLength(25);
			expect(round.answers.map(({ cardId }) => cardId)).toEqual(
				Array.from({ length: 25 }, (_, index) => `size-${poolSize}:${index + 1}`)
			);
			expect(round.answers.map(({ position }) => position)).toEqual(
				Array.from({ length: 25 }, (_, index) => index + 1)
			);
			expect(Object.values(round.progress).reduce((total, item) => total + item.correctCount, 0)).toBe(25);
			if (poolSize < roundSize) {
				expect(new Set(round.answers.map(({ word }) => word.id)).size).toBe(poolSize);
			}
			const summary = advanceRound(round, currentCard(round).id, zero);
			expect(summary.complete).toBe(true);
			expect(summary.currentCard).toBeNull();
		}
	);

	test('wrong answers, skips, and correct answers all count toward the 25 attempts', () => {
		let round = startRound([you], {}, { id: 'mixed', random: zero });
		for (let position = 1; position <= 25; position++) {
			const value = position % 3 === 1 ? you.spanish : position % 3 === 2 ? i.spanish : null;
			const card = currentCard(round);
			round = answerCard(round, card.id, value, position);
			if (position < 25) round = advanceRound(round, card.id, zero);
		}
		expect(round.complete).toBe(true);
		expect(round.answers).toHaveLength(25);
		expect(round.progress[you.id]).toEqual({
			correctCount: 9,
			incorrectCount: 8,
			skippedCount: 8,
			lastPracticedAt: 25,
			lastOutcome: 'correct'
		});
	});

	test('invalid and duplicate submissions do not complete a 24-attempt round', () => {
		let round = startRound([you], {}, { id: 'final-reveal', random: zero });
		for (let position = 1; position <= 24; position++) {
			round = respondAndAdvance(round, null, position);
		}
		const card = currentCard(round);
		expect(answerCard(round, card.id, 'zzzzzzzz', 25)).toBe(round);
		expect(answerCard(round, 'final-reveal:24', null, 25)).toBe(round);
		expect(advanceRound(round, card.id, zero)).toBe(round);
		expect(round.complete).toBe(false);
		const final = answerCard(round, card.id, null, 25);
		expect(final.complete).toBe(true);
		expect(final.currentCard).toBe(card);
		expect(final.answers).toHaveLength(25);
		expect(answerCard(final, card.id, you.spanish, 26)).toBe(final);
		expect(answerCard(final, 'final-reveal:26', null, 26)).toBe(final);
		expect(advanceRound(final, 'final-reveal:24', zero)).toBe(final);
		const summary = advanceRound(final, card.id, () => {
			throw new Error('A completed round must not select a 26th card');
		});
		expect(summary.currentCard).toBeNull();
		expect(summary.answers).toBe(final.answers);
		expect(summary.progress).toBe(final.progress);
		expect(advanceRound(summary, card.id, zero)).toBe(summary);
		expect(answerCard(summary, card.id, null, 26)).toBe(summary);
	});

	test('leaving a round early retains immediate progress and keeps the round partial', () => {
		let round = startRound([you], {}, { id: 'partial', random: zero });
		for (let position = 1; position <= 5; position++) {
			round = respondAndAdvance(round, null, position);
		}
		expect(round.complete).toBe(false);
		expect(round.answers).toHaveLength(5);
		expect(currentCard(round).position).toBe(6);
		expect(round.progress[you.id].skippedCount).toBe(5);
		const next = startRound(words, round.progress, { id: 'after-partial', random: zero });
		expect(next.progress).toBe(round.progress);
		expect(next.answers).toEqual([]);
		expect(next.complete).toBe(false);
	});

	test('new rounds keep all cumulative correct counts rather than restarting the pass', () => {
		let round = startRound([you], {}, { id: 'cumulative', random: zero });
		for (let position = 1; position <= 25; position++) {
			round = respondAndAdvance(round, you.spanish, position);
		}
		expect(round.complete).toBe(true);
		const next = startRound([you], round.progress, {
			id: 'cumulative-next',
			random: zero,
			previousWordId: you.id
		});
		expect(next.progress).toBe(round.progress);
		expect(next.progress[you.id].correctCount).toBe(25);
		expect(currentCard(next).id).toBe('cumulative-next:1');
		const answered = answerCard(next, currentCard(next).id, you.spanish, 26);
		expect(answered.progress[you.id].correctCount).toBe(26);
		expect(round.progress[you.id].correctCount).toBe(25);
	});
});

describe('full-pool completeness and stable identity', () => {
	test('uses the full vocabulary denominator with missing rows treated as zero', () => {
		const progress = {
			[you.id]: itemProgress({ correctCount: 2 }),
			outside: itemProgress({ correctCount: 99, incorrectCount: 99, skippedCount: 99 })
		};
		expect(getCompleteness(frequencyWords, progress)).toEqual({
			totalItems: frequencyWords.length,
			practicedItems: 1,
			successfulItems: 1,
			fullPassesCompleted: 0,
			currentPass: 1,
			currentPassCompletedItems: 1
		});
	});

	test('correct, wrong, and skipped counts all establish practice coverage, but only correct succeeds', () => {
		const progress = {
			[you.id]: itemProgress({ correctCount: 1 }),
			[i.id]: itemProgress({ incorrectCount: 2 }),
			[the.id]: itemProgress({ skippedCount: 3 })
		};
		expect(getCompleteness(words, progress)).toEqual({
			totalItems: 3,
			practicedItems: 3,
			successfulItems: 1,
			fullPassesCompleted: 0,
			currentPass: 1,
			currentPassCompletedItems: 1
		});
	});

	test('zero rows and timestamp metadata do not count as recorded practice', () => {
		const progress = { [you.id]: itemProgress({ lastPracticedAt: 1234, lastOutcome: 'skipped' }) };
		expect(getCompleteness(words, progress)).toEqual({
			totalItems: 3,
			practicedItems: 0,
			successfulItems: 0,
			fullPassesCompleted: 0,
			currentPass: 1,
			currentPassCompletedItems: 0
		});
	});

	test('an empty pool has zero completed passes and starts at pass one, ignoring unrelated rows', () => {
		expect(getCompleteness([], { [you.id]: itemProgress({ correctCount: 99 }) })).toEqual({
			totalItems: 0,
			practicedItems: 0,
			successfulItems: 0,
			fullPassesCompleted: 0,
			currentPass: 1,
			currentPassCompletedItems: 0
		});
	});

	test('resets current-pass progress on transition without erasing full passes or first-pass coverage', () => {
		const progress = {
			[you.id]: itemProgress({ correctCount: 1 }),
			[i.id]: itemProgress({ correctCount: 1 }),
			[the.id]: itemProgress({ incorrectCount: 1, skippedCount: 1 })
		};
		let round = startRound(words, progress, { id: 'coverage', random: zero });
		expect(currentCard(round).word).toBe(the);
		expect(getCompleteness(words, round.progress)).toEqual({
			totalItems: 3,
			practicedItems: 3,
			successfulItems: 2,
			fullPassesCompleted: 0,
			currentPass: 1,
			currentPassCompletedItems: 2
		});
		const card = currentCard(round);
		round = answerCard(round, card.id, the.spanish, 1000);
		expect(getCompleteness(words, round.progress)).toEqual({
			totalItems: 3,
			practicedItems: 3,
			successfulItems: 3,
			fullPassesCompleted: 1,
			currentPass: 2,
			currentPassCompletedItems: 0
		});
		round = advanceRound(round, card.id, zero);
		round = answerCard(round, currentCard(round).id, you.spanish, 2000);
		expect(getCompleteness(words, round.progress)).toEqual({
			totalItems: 3,
			practicedItems: 3,
			successfulItems: 3,
			fullPassesCompleted: 1,
			currentPass: 2,
			currentPassCompletedItems: 1
		});
	});

	test('derives later passes from the minimum, counting items ahead once rather than counting answers', () => {
		const progress = {
			[you.id]: itemProgress({ correctCount: 8 }),
			[i.id]: itemProgress({ correctCount: 4 }),
			[the.id]: itemProgress({ correctCount: 3 })
		};
		expect(getCompleteness(words, progress)).toEqual({
			totalItems: 3,
			practicedItems: 3,
			successfulItems: 3,
			fullPassesCompleted: 3,
			currentPass: 4,
			currentPassCompletedItems: 2
		});
	});

	test('rank changes and reordering do not move progress, eligibility, or completeness to another ID', () => {
		const progress = {
			[you.id]: itemProgress({ correctCount: 2 }),
			[the.id]: itemProgress({ correctCount: 1 })
		};
		const reordered = [...words].reverse().map((word, index) => ({ ...word, rank: index + 100 }));
		const selected = selectNextWord(reordered, progress, zero)!;
		expect(selected.id).toBe(i.id);
		expect(selected.rank).not.toBe(i.rank);
		expect(getCompleteness(reordered, progress)).toEqual(getCompleteness(words, progress));
		const round = startRound(reordered, progress, { id: 'stable', random: zero });
		const answered = answerCard(round, currentCard(round).id, i.spanish, 1000);
		expect(answered.progress[i.id].correctCount).toBe(1);
		expect(answered.progress[you.id].correctCount).toBe(2);
		expect(answered.progress[the.id].correctCount).toBe(1);
		expect(answered.answers[0].word.id).toBe(i.id);
	});

	test('distinct item IDs remain distinct even if their spellings and ranks match', () => {
		const sameSpelling = { ...i, rank: you.rank, english: you.english, spanish: you.spanish };
		const pool = [you, sameSpelling];
		const progress = { [you.id]: itemProgress({ correctCount: 2 }) };
		const round = startRound(pool, progress, { id: 'same-spelling', random: zero });
		expect(currentCard(round).word.id).toBe(i.id);
		const answered = answerCard(round, currentCard(round).id, you.spanish, 1000);
		expect(answered.progress[i.id].correctCount).toBe(1);
		expect(answered.progress[you.id].correctCount).toBe(2);
		expect(getCompleteness(pool, answered.progress)).toMatchObject({
			totalItems: 2,
			successfulItems: 2,
			fullPassesCompleted: 1,
			currentPassCompletedItems: 1
		});
	});
});

describe('immutability and display-only review', () => {
	test('selection, grading, advancing, completeness, and review do not mutate their inputs', () => {
		const pool = Object.freeze([...words]);
		const progress: VocabularyProgress = Object.freeze({
			[you.id]: Object.freeze(itemProgress()),
			[i.id]: Object.freeze(itemProgress({ correctCount: 1 })),
			outside: Object.freeze(itemProgress({ incorrectCount: 4 }))
		});
		const initial = startRound(pool, progress, { id: 'immutable', random: zero });
		const snapshot = structuredClone(initial);
		Object.freeze(initial.pool);
		Object.freeze(initial.answers);
		Object.freeze(initial.currentCard);
		Object.freeze(initial);
		expect(selectNextWord(pool, progress, zero)).toBe(you);
		const answered = answerCard(initial, currentCard(initial).id, null, 1000);
		Object.freeze(answered.progress[you.id]);
		Object.freeze(answered.progress);
		Object.freeze(answered.answers[0]);
		Object.freeze(answered.answers);
		Object.freeze(answered);
		const next = advanceRound(answered, currentCard(answered).id, zero);
		getCompleteness(pool, next.progress);
		expect(wordsToReview(next)).toEqual([you]);
		expect(initial).toEqual(snapshot);
		expect(answered).not.toBe(initial);
		expect(answered.progress).not.toBe(progress);
		expect(answered.progress[you.id]).not.toBe(progress[you.id]);
		expect(answered.progress[i.id]).toBe(progress[i.id]);
		expect(answered.progress.outside).toBe(progress.outside);
		expect(next).not.toBe(answered);
		expect(next.answers).toBe(answered.answers);
		expect(next.progress).toBe(answered.progress);
		expect(currentCard(next).word).toBe(the);
	});

	test('review lists unique word IDs in first-miss order, including skips and later-correct words', () => {
		let round = startRound([you, i], {}, { id: 'review-order', random: zero });
		round = respondAndAdvance(round, you.spanish);
		round = respondAndAdvance(round, you.spanish);
		round = respondAndAdvance(round, i.spanish);
		round = respondAndAdvance(round, null);
		round = respondAndAdvance(round, null);
		round = respondAndAdvance(round, you.spanish);
		round = respondAndAdvance(round, i.spanish);
		expect(round.answers.map(({ outcome }) => outcome)).toEqual([
			'correct', 'incorrect', 'correct', 'skipped', 'skipped', 'correct', 'correct'
		]);
		expect(wordsToReview(round)).toEqual([i, you]);
		expect(wordsToReview(round).map(({ id }) => id)).toEqual([i.id, you.id]);
	});

	test('review does not restrict scheduling to missed words or erase reviewed synonyms', () => {
		let round = startRound([you, i], {}, { id: 'display-only', random: zero });
		round = respondAndAdvance(round, you.spanish);
		round = respondAndAdvance(round, you.spanish);
		round = respondAndAdvance(round, i.spanish);
		expect(wordsToReview(round)).toEqual([i]);
		expect(currentCard(round).word).toBe(you);
		expect(round.pool).toEqual([you, i]);
		const car = findWord('car');
		const initial = startRound([car], {}, { id: 'alternative', random: zero });
		const answered = answerCard(initial, currentCard(initial).id, 'coche', 1000);
		expect(answered.answers[0].outcome).toBe('correct');
		expect(wordsToReview(answered)).toEqual([]);
		expect(getSpanishAnswers(car)).toContain('coche');
	});

	test('review deduplicates by ID, not rank or spelling', () => {
		const sameSpelling = { ...i, rank: you.rank, english: you.english, spanish: you.spanish };
		let round = startRound([you, sameSpelling], {}, { id: 'review-identity', random: zero });
		round = respondAndAdvance(round, null);
		round = respondAndAdvance(round, null);
		round = respondAndAdvance(round, null);
		expect(wordsToReview(round).map(({ id }) => id)).toEqual([you.id, i.id]);
		expect(normalizeAnswer(sameSpelling.spanish)).toBe(normalizeAnswer(you.spanish));
	});
});
