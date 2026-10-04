export const durations = [5, 10, 15] as const;
export type Duration = (typeof durations)[number];

export const operations = ['addition', 'subtraction', 'multiplication', 'division'] as const;
export type Operation = (typeof operations)[number];

export const operationSymbols: Record<Operation, string> = {
	addition: '+',
	subtraction: '−',
	multiplication: '×',
	division: '÷'
};

export interface Question {
	operation: Operation;
	left: number;
	right: number;
	answer: number;
}

export interface Session {
	status: 'running' | 'finished';
	duration: Duration;
	operation: Operation;
	question: Question;
	startedAt: number;
	endsAt: number;
	endedAt: number | null;
	correct: number;
	incorrect: number;
}

export function generateQuestion(
	operation: Operation,
	previous?: Question,
	random: () => number = Math.random
): Question {
	const minimum = operation === 'addition' || operation === 'subtraction' ? 0 : 1;
	const range = minimum === 0 ? 51 : 12;
	let left = Math.floor(random() * range) + minimum;
	let right = Math.floor(random() * range) + minimum;

	if (operation === 'subtraction' && left < right) [left, right] = [right, left];
	if (operation === 'division') left *= right;

	if (previous?.operation === operation && previous.left === left && previous.right === right) {
		// Advance a valid operand instead of retrying, even with a constant random source.
		switch (operation) {
			case 'addition':
				right = (right + 1) % 51;
				break;
			case 'subtraction':
				if (right < left) right += 1;
				else {
					left = (left + 1) % 51;
					right = 0;
				}
				break;
			case 'multiplication':
				right = (right % 12) + 1;
				break;
			case 'division':
				left = (((left / right) % 12) + 1) * right;
				break;
		}
	}

	switch (operation) {
		case 'addition':
			return { operation, left, right, answer: left + right };
		case 'subtraction':
			return { operation, left, right, answer: left - right };
		case 'multiplication':
			return { operation, left, right, answer: left * right };
		case 'division':
			return { operation, left, right, answer: left / right };
	}
}

export function startSession(
	duration: Duration,
	operation: Operation,
	now: number = Date.now(),
	random: () => number = Math.random
): Session {
	return {
		status: 'running',
		duration,
		operation,
		question: generateQuestion(operation, undefined, random),
		startedAt: now,
		endsAt: now + duration * 60_000,
		endedAt: null,
		correct: 0,
		incorrect: 0
	};
}

export function updateSessionTime(session: Session, now: number = Date.now()): Session {
	if (session.status === 'finished' || now < session.endsAt) return session;
	return { ...session, status: 'finished', endedAt: session.endsAt };
}

export function endSession(session: Session, now: number = Date.now()): Session {
	if (session.status === 'finished') return session;
	return {
		...session,
		status: 'finished',
		endedAt: Math.max(session.startedAt, Math.min(now, session.endsAt))
	};
}

export function submitAnswer(
	session: Session,
	rawAnswer: string,
	now: number = Date.now(),
	random: () => number = Math.random
): { session: Session; outcome: 'correct' | 'incorrect' | 'invalid' | 'expired' | 'inactive' } {
	if (session.status === 'finished') return { session, outcome: 'inactive' };

	const current = updateSessionTime(session, now);
	if (current.status === 'finished') return { session: current, outcome: 'expired' };

	const input = rawAnswer.trim();
	if (!/^[0-9]+$/.test(input)) return { session, outcome: 'invalid' };

	const answer = Number(input);
	if (!Number.isSafeInteger(answer)) return { session, outcome: 'invalid' };

	const correct = answer === session.question.answer;
	return {
		session: {
			...session,
			correct: session.correct + (correct ? 1 : 0),
			incorrect: session.incorrect + (correct ? 0 : 1),
			question: generateQuestion(session.operation, session.question, random)
		},
		outcome: correct ? 'correct' : 'incorrect'
	};
}

export function getSessionStats(
	session: Session,
	now: number = Date.now()
): {
	total: number;
	accuracy: number;
	correctPerMinute: number;
	elapsedSeconds: number;
	remainingSeconds: number;
} {
	const total = session.correct + session.incorrect;
	const elapsedUntil = session.endedAt ?? now;
	const elapsedMs = Math.max(0, Math.min(elapsedUntil, session.endsAt) - session.startedAt);
	const remainingMs = session.status === 'finished'
		? 0
		: Math.max(0, session.endsAt - Math.max(session.startedAt, now));

	return {
		total,
		accuracy: total === 0 ? 0 : (session.correct / total) * 100,
		correctPerMinute: elapsedMs === 0 ? 0 : (session.correct * 60_000) / elapsedMs,
		elapsedSeconds: elapsedMs / 1000,
		remainingSeconds: Math.ceil(remainingMs / 1000)
	};
}
