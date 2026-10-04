import { describe, expect, mock, spyOn, test } from 'bun:test';
import {
	durations,
	endSession,
	generateQuestion,
	getSessionStats,
	operations,
	operationSymbols,
	startSession,
	submitAnswer,
	updateSessionTime,
	type Duration,
	type Operation,
	type Question,
	type Session
} from '../src/lib/speed-math/game';

const startedAt = 1_800_000_000_000;
const nearOne = 1 - Number.EPSILON;

function sequenceRandom(...values: number[]): () => number {
	let index = 0;
	return () => {
		const value = values[index++];
		if (value === undefined) throw new Error('Unexpected extra random draw');
		return value;
	};
}

function makeSession(duration: Duration = 5, operation: Operation = 'addition'): Session {
	const session = startSession(duration, operation, startedAt, () => 0);
	Object.freeze(session.question);
	return Object.freeze(session);
}

function expectValidQuestion(question: Question): void {
	const { operation, left, right, answer } = question;
	for (const value of [left, right, answer]) {
		expect(Number.isSafeInteger(value)).toBe(true);
		expect(value).toBeGreaterThanOrEqual(0);
	}

	switch (operation) {
		case 'addition':
		case 'subtraction':
			expect(left).toBeLessThanOrEqual(50);
			expect(right).toBeLessThanOrEqual(50);
			if (operation === 'addition') expect(answer).toBe(left + right);
			else {
				expect(left).toBeGreaterThanOrEqual(right);
				expect(answer).toBe(left - right);
			}
			break;
		case 'multiplication':
			expect(left).toBeGreaterThanOrEqual(1);
			expect(left).toBeLessThanOrEqual(12);
			expect(right).toBeGreaterThanOrEqual(1);
			expect(right).toBeLessThanOrEqual(12);
			expect(answer).toBe(left * right);
			break;
		case 'division':
			expect(right).toBeGreaterThanOrEqual(1);
			expect(right).toBeLessThanOrEqual(12);
			expect(answer).toBeGreaterThanOrEqual(1);
			expect(answer).toBeLessThanOrEqual(12);
			expect(left % right).toBe(0);
			expect(left).toBe(right * answer);
			break;
	}
}

describe('question generation', () => {
	test('exports the supported durations, operations, and mathematical symbols', () => {
		expect(durations).toEqual([5, 10, 15]);
		expect(operations).toEqual(['addition', 'subtraction', 'multiplication', 'division']);
		expect(operationSymbols).toEqual({
			addition: '+', subtraction: '−', multiplication: '×', division: '÷'
		});
	});

	for (const operation of operations) {
		test(`${operation}: every operand combination and repeat fallback stays within its bounds`, () => {
			const range = operation === 'addition' || operation === 'subtraction' ? 51 : 12;
			const seen = new Set<string>();
			for (let first = 0; first < range; first++) {
				for (let second = 0; second < range; second++) {
					const values = [(first + 0.5) / range, (second + 0.5) / range];
					const question = Object.freeze(generateQuestion(operation, undefined, sequenceRandom(...values)));
					expect(question.operation).toBe(operation);
					expectValidQuestion(question);
					seen.add(`${question.left}:${question.right}`);

					const next = generateQuestion(operation, question, sequenceRandom(...values));
					expect(next.operation).toBe(operation);
					expectValidQuestion(next);
					expect([next.left, next.right]).not.toEqual([question.left, question.right]);
				}
			}
			expect(seen.size).toBe(operation === 'subtraction' ? (51 * 52) / 2 : range * range);
		});

		for (const value of [0, 0.5, nearOne]) {
			test(`${operation}: constant random ${value} never repeats consecutively or retries`, () => {
				const random = mock(() => value);
				let previous = Object.freeze(generateQuestion(operation, undefined, random));
				for (let index = 0; index < 50; index++) {
					const next = generateQuestion(operation, previous, random);
					expectValidQuestion(next);
					expect([next.left, next.right]).not.toEqual([previous.left, previous.right]);
					previous = Object.freeze(next);
				}
				expect(random).toHaveBeenCalledTimes(102);
			});
		}
	}

	test('includes both operand extremes and sorts subtraction without making it negative', () => {
		const cases: readonly [Operation, number[], Question][] = [
			['addition', [0, 0], { operation: 'addition', left: 0, right: 0, answer: 0 }],
			['addition', [nearOne, nearOne], { operation: 'addition', left: 50, right: 50, answer: 100 }],
			['subtraction', [0, nearOne], { operation: 'subtraction', left: 50, right: 0, answer: 50 }],
			['subtraction', [nearOne, nearOne], { operation: 'subtraction', left: 50, right: 50, answer: 0 }],
			['multiplication', [0, 0], { operation: 'multiplication', left: 1, right: 1, answer: 1 }],
			['multiplication', [nearOne, nearOne], { operation: 'multiplication', left: 12, right: 12, answer: 144 }],
			['division', [0, nearOne], { operation: 'division', left: 12, right: 12, answer: 1 }],
			['division', [nearOne, 0], { operation: 'division', left: 12, right: 1, answer: 12 }],
			['division', [nearOne, nearOne], { operation: 'division', left: 144, right: 12, answer: 12 }]
		];
		for (const [operation, values, expected] of cases) {
			expect(generateQuestion(operation, undefined, sequenceRandom(...values))).toEqual(expected);
		}
	});

	test('only rejects identical ordered operands with the same operation', () => {
		for (const operation of ['addition', 'multiplication'] as const) {
			const previous = generateQuestion(operation, undefined, sequenceRandom(0, nearOne));
			expect(generateQuestion(operation, previous, sequenceRandom(nearOne, 0))).toEqual({
				...previous, left: previous.right, right: previous.left
			});
		}
		const addition: Question = { operation: 'addition', left: 1, right: 1, answer: 2 };
		expect(generateQuestion('multiplication', addition, () => 0)).toEqual({
			operation: 'multiplication', left: 1, right: 1, answer: 1
		});
		const division: Question = { operation: 'division', left: 12, right: 1, answer: 12 };
		expect(generateQuestion('division', division, sequenceRandom(5.5 / 12, 1.5 / 12))).toEqual({
			operation: 'division', left: 12, right: 2, answer: 6
		});
	});
});

describe('session lifecycle', () => {
	for (const duration of durations) {
		for (const operation of operations) {
			test(`starts a ${duration}-minute ${operation} session with injected time and random`, () => {
				const answer = operation === 'addition' || operation === 'subtraction' ? 0 : 1;
				expect(startSession(duration, operation, startedAt, () => 0)).toEqual({
					status: 'running',
					duration,
					operation,
					question: { operation, left: answer, right: answer, answer },
					startedAt,
					endsAt: startedAt + duration * 60_000,
					endedAt: null,
					correct: 0,
					incorrect: 0
				});
			});
		}

		test(`${duration}-minute session expires at its deadline, including a background jump`, () => {
			const session = makeSession(duration);
			expect(updateSessionTime(session, startedAt)).toBe(session);
			expect(updateSessionTime(session, session.endsAt - 1)).toBe(session);
			for (const now of [session.endsAt, session.endsAt + 3_600_000]) {
				const finished = updateSessionTime(session, now);
				expect(finished).not.toBe(session);
				expect(finished).toEqual({ ...session, status: 'finished', endedAt: session.endsAt });
				expect(finished.question).toBe(session.question);
				expect(session.status).toBe('running');
			}
		});
	}

	test('manual early finish preserves scores and question and is idempotent', () => {
		const session = Object.freeze({ ...makeSession(), correct: 3, incorrect: 2 });
		const finished = Object.freeze(endSession(session, startedAt + 90_000));
		expect(finished).toEqual({ ...session, status: 'finished', endedAt: startedAt + 90_000 });
		expect(finished.question).toBe(session.question);
		for (const now of [startedAt, startedAt + 120_000, session.endsAt + 1000]) {
			expect(endSession(finished, now)).toBe(finished);
			expect(updateSessionTime(finished, now)).toBe(finished);
		}
		expect(session.status).toBe('running');
	});

	test('manual finish clamps to the session limits and natural finish is idempotent', () => {
		const session = makeSession();
		expect(endSession(session, startedAt - 1000).endedAt).toBe(startedAt);
		for (const now of [session.endsAt, session.endsAt + 3_600_000]) {
			expect(endSession(session, now).endedAt).toBe(session.endsAt);
		}
		const finished = Object.freeze(updateSessionTime(session, session.endsAt));
		expect(updateSessionTime(finished, session.endsAt + 1000)).toBe(finished);
		expect(endSession(finished, startedAt + 1000)).toBe(finished);
	});

	test('defaults to Date.now and Math.random for generation and session helpers', () => {
		const clock = spyOn(Date, 'now').mockReturnValue(startedAt);
		const random = spyOn(Math, 'random').mockReturnValue(0);
		try {
			expect(generateQuestion('multiplication')).toEqual({
				operation: 'multiplication', left: 1, right: 1, answer: 1
			});
			const session = startSession(5, 'addition');
			expect(session.startedAt).toBe(startedAt);
			expect(session.question.answer).toBe(0);
			expect(getSessionStats(session).elapsedSeconds).toBe(0);
			clock.mockReturnValue(startedAt + 60_000);
			const result = submitAnswer(session, '0');
			expect(result.outcome).toBe('correct');
			expect(result.session.question).toEqual({ operation: 'addition', left: 0, right: 1, answer: 1 });
			expect(updateSessionTime(result.session)).toBe(result.session);
			expect(getSessionStats(result.session).correctPerMinute).toBe(1);
			expect(endSession(result.session).endedAt).toBe(startedAt + 60_000);
			clock.mockReturnValue(session.endsAt);
			expect(updateSessionTime(session).endedAt).toBe(session.endsAt);
		} finally {
			clock.mockRestore();
			random.mockRestore();
		}
	});
});

describe('answer submission', () => {
	for (const operation of operations) {
		test(`${operation}: correct whole integers accept whitespace and leading zeros and advance`, () => {
			const session = makeSession(5, operation);
			const result = submitAnswer(session, ` \t000${session.question.answer}\n `, startedAt + 1000, () => 0);
			expect(result.outcome).toBe('correct');
			expect(result.session).toEqual({ ...session, correct: 1, question: result.session.question });
			expect(result.session.question).not.toEqual(session.question);
			expectValidQuestion(result.session.question);
			expect(session.correct).toBe(0);
		});

		test(`${operation}: an incorrect integer scores once and immediately advances`, () => {
			const session = makeSession(5, operation);
			const result = submitAnswer(session, String(session.question.answer + 1), startedAt + 1000, () => 0);
			expect(result.outcome).toBe('incorrect');
			expect(result.session).toEqual({ ...session, incorrect: 1, question: result.session.question });
			expect(result.session.question).not.toEqual(session.question);
			expectValidQuestion(result.session.question);
			expect(session.incorrect).toBe(0);
		});
	}

	test('successive submissions grade the new question and preserve earlier immutable snapshots', () => {
		const session = makeSession();
		const first = submitAnswer(session, '0', startedAt + 1000, () => 0);
		Object.freeze(first.session.question);
		Object.freeze(first.session);
		const second = submitAnswer(first.session, '0', startedAt + 2000, () => 0);
		const third = submitAnswer(second.session, String(second.session.question.answer), startedAt + 3000, () => 0);
		expect([first.outcome, second.outcome, third.outcome]).toEqual(['correct', 'incorrect', 'correct']);
		expect([third.session.correct, third.session.incorrect]).toEqual([2, 1]);
		expect([first.session.correct, first.session.incorrect]).toEqual([1, 0]);
		expect([session.correct, session.incorrect]).toEqual([0, 0]);
	});

	test('invalid inputs preserve identity, scores, question, and the random source', () => {
		const session = Object.freeze({ ...makeSession(), correct: 2, incorrect: 1 });
		const random = mock(() => 0);
		for (const rawAnswer of [
			'', ' \t\n ', '-1', '-0', '+1', '1.0', '.5', '1e2', '0x10', '0b10',
			'Infinity', 'NaN', '1 2', '1\n2', '1,000', '1_000', '1a', '١', '０',
			'9007199254740992', '0009007199254740992', '9'.repeat(400)
		]) {
			const result = submitAnswer(session, rawAnswer, startedAt + 1000, random);
			expect(result.outcome).toBe('invalid');
			expect(result.session).toBe(session);
			expect(result.session.question).toBe(session.question);
		}
		expect(random).not.toHaveBeenCalled();
	});

	test('the largest safe integer is valid even when it is incorrect', () => {
		const result = submitAnswer(makeSession(), ` 000${Number.MAX_SAFE_INTEGER} `, startedAt + 1000, () => 0);
		expect(result.outcome).toBe('incorrect');
		expect(result.session.incorrect).toBe(1);
	});

	for (const duration of durations) {
		test(`${duration}-minute session accepts answers just before, but not at or after, its deadline`, () => {
			const session = makeSession(duration);
			const accepted = submitAnswer(session, '0', session.endsAt - 1, () => 0);
			expect(accepted.outcome).toBe('correct');
			expect(accepted.session.status).toBe('running');
			expect(accepted.session.correct).toBe(1);
			expect(submitAnswer(session, '', session.endsAt - 1).session).toBe(session);
			expect(submitAnswer(session, '', session.endsAt - 1).outcome).toBe('invalid');

			const random = mock(() => 0);
			for (const now of [session.endsAt, session.endsAt + 3_600_000]) {
				for (const rawAnswer of [String(accepted.session.question.answer), '999', '']) {
					const result = submitAnswer(accepted.session, rawAnswer, now, random);
					expect(result.outcome).toBe('expired');
					expect(result.session).toEqual({
						...accepted.session, status: 'finished', endedAt: session.endsAt
					});
					expect(result.session.question).toBe(accepted.session.question);
				}
			}
			expect(random).not.toHaveBeenCalled();
		});
	}

	test('finished sessions never score, validate, or generate another question', () => {
		const session = makeSession();
		const random = mock(() => 0);
		for (const finished of [
			endSession(session, startedAt + 1000),
			updateSessionTime(session, session.endsAt)
		]) {
			Object.freeze(finished);
			for (const now of [startedAt + 2000, session.endsAt + 1000]) {
				for (const rawAnswer of ['0', '999', '']) {
					const result = submitAnswer(finished, rawAnswer, now, random);
					expect(result.outcome).toBe('inactive');
					expect(result.session).toBe(finished);
				}
			}
		}
		expect(random).not.toHaveBeenCalled();
	});
});

describe('session statistics', () => {
	for (const duration of durations) {
		test(`${duration}-minute session starts zero-safe and clamps timing before start and after deadline`, () => {
			const session = makeSession(duration);
			for (const now of [startedAt - 1000, startedAt]) {
				expect(getSessionStats(session, now)).toEqual({
					total: 0, accuracy: 0, correctPerMinute: 0,
					elapsedSeconds: 0, remainingSeconds: duration * 60
				});
			}
			for (const now of [session.endsAt, session.endsAt + 3_600_000]) {
				expect(getSessionStats(session, now)).toEqual({
					total: 0, accuracy: 0, correctPerMinute: 0,
					elapsedSeconds: duration * 60, remainingSeconds: 0
				});
			}
			expect(session.status).toBe('running');
		});
	}

	test('calculates total, percentage accuracy, and correct answers per elapsed minute', () => {
		const session = Object.freeze({ ...makeSession(), correct: 3, incorrect: 1 });
		expect(getSessionStats(session, startedAt + 120_000)).toEqual({
			total: 4, accuracy: 75, correctPerMinute: 1.5, elapsedSeconds: 120, remainingSeconds: 180
		});
		for (const [correct, incorrect, accuracy] of [[0, 4, 0], [4, 0, 100]] as const) {
			expect(getSessionStats({ ...session, correct, incorrect }, startedAt + 60_000).accuracy).toBe(accuracy);
		}
	});

	test('a correct answer at zero elapsed time has a finite zero rate', () => {
		const result = submitAnswer(makeSession(), '0', startedAt, () => 0);
		expect(getSessionStats(result.session, startedAt)).toEqual({
			total: 1, accuracy: 100, correctPerMinute: 0, elapsedSeconds: 0, remainingSeconds: 300
		});
	});

	test('remaining seconds round up while elapsed seconds retain millisecond precision', () => {
		const session = makeSession();
		const cases = [
			[1, 300], [999, 300], [1000, 299], [1001, 299],
			[299_000, 1], [299_999, 1], [300_000, 0], [300_001, 0]
		] as const;
		for (const [offset, remainingSeconds] of cases) {
			const stats = getSessionStats(session, startedAt + offset);
			expect(stats.remainingSeconds).toBe(remainingSeconds);
			expect(stats.elapsedSeconds).toBe(Math.min(offset, 300_000) / 1000);
		}
		const scored = { ...session, correct: 1 };
		expect(getSessionStats(scored, startedAt + 1500).correctPerMinute).toBe(40);
	});

	test('early-finished statistics use endedAt and do not drift with the current clock', () => {
		const session = Object.freeze({ ...makeSession(), correct: 3, incorrect: 1 });
		const finished = Object.freeze(endSession(session, startedAt + 120_000));
		for (const now of [startedAt - 1000, startedAt + 180_000, session.endsAt + 3_600_000]) {
			expect(getSessionStats(finished, now)).toEqual({
				total: 4, accuracy: 75, correctPerMinute: 1.5, elapsedSeconds: 120, remainingSeconds: 0
			});
		}
	});

	test('late expiry bounds elapsed time and rate to the selected session duration', () => {
		for (const duration of durations) {
			const session = Object.freeze({ ...makeSession(duration), correct: duration * 2, incorrect: duration });
			const now = session.endsAt + 3_600_000;
			const finished = Object.freeze(updateSessionTime(session, now));
			const expected = {
				total: duration * 3,
				accuracy: (2 / 3) * 100,
				correctPerMinute: 2,
				elapsedSeconds: duration * 60,
				remainingSeconds: 0
			};
			expect(getSessionStats(session, now)).toEqual(expected);
			expect(getSessionStats(finished, now)).toEqual(expected);
		}
	});

	test('an immediate finish stays zero-safe for elapsed time and rate', () => {
		const result = submitAnswer(makeSession(), '0', startedAt, () => 0);
		const finished = Object.freeze(endSession(result.session, startedAt));
		expect(getSessionStats(finished, startedAt + 60_000)).toEqual({
			total: 1, accuracy: 100, correctPerMinute: 0, elapsedSeconds: 0, remainingSeconds: 0
		});
	});
});
