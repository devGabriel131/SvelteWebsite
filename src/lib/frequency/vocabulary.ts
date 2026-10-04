import type { Language } from '../i18n/translations';
import words from './words.json';

export type FrequencyWord = {
	rank: number;
	english: string;
	spanish: string;
	alternatives?: string[];
	note?: Record<Language, string>;
};

export const frequencyWords: FrequencyWord[] = words;
export const deckSize = 25;

export const frequencyDecks: {
	id: number;
	startRank: number;
	endRank: number;
	words: FrequencyWord[];
}[] = Array.from({ length: Math.ceil(frequencyWords.length / deckSize) }, (_, id) => {
	const words = frequencyWords.slice(id * deckSize, (id + 1) * deckSize);
	return { id, startRank: words[0].rank, endRank: words[words.length - 1].rank, words };
});

export function normalizeAnswer(value: string): string {
	return value
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.trim()
		.replace(/\s+/g, ' ');
}

export function getSpanishAnswers(word: FrequencyWord): string[] {
	return [word.spanish, ...(word.alternatives ?? [])];
}

export function isCorrectAnswer(word: FrequencyWord, answer: string): boolean {
	const normalized = normalizeAnswer(answer);
	return getSpanishAnswers(word).some((option) => normalizeAnswer(option) === normalized);
}

function optionSpelling(value: string): string {
	return value.normalize('NFC').toLowerCase().trim().replace(/\s+/g, ' ');
}

const seenSpanishOptions = new Set<string>();
export const spanishOptions: string[] = frequencyWords.flatMap(getSpanishAnswers).filter((spanish) => {
	// Keep distinct Spanish spellings such as “el” and “él” visible in the answer pool.
	const spelling = optionSpelling(spanish);
	if (seenSpanishOptions.has(spelling)) return false;
	seenSpanishOptions.add(spelling);
	return true;
});

const searchOptions = spanishOptions.map((spanish) => ({
	spanish,
	spelling: optionSpelling(spanish),
	normalized: normalizeAnswer(spanish)
}));

function boundedEditDistance(query: string, value: string, maximum: number): number {
	if (Math.abs(query.length - value.length) > maximum) return maximum + 1;

	let previous = Array.from({ length: value.length + 1 }, (_, index) => index);
	for (let row = 1; row <= query.length; row++) {
		const current = [row];
		let rowMinimum = row;
		for (let column = 1; column <= value.length; column++) {
			current[column] = Math.min(
				previous[column] + 1,
				current[column - 1] + 1,
				previous[column - 1] + (query[row - 1] === value[column - 1] ? 0 : 1)
			);
			rowMinimum = Math.min(rowMinimum, current[column]);
		}
		if (rowMinimum > maximum) return maximum + 1;
		previous = current;
	}
	return previous[value.length];
}

export function searchSpanishOptions(query: string, limit = 6): string[] {
	const normalizedQuery = normalizeAnswer(query);
	const querySpelling = optionSpelling(query);
	const resultLimit = Math.max(0, Math.floor(limit));
	if (!normalizedQuery || !resultLimit) return [];

	// Short queries stay literal. Insertions allow subsequences only within this small edit budget.
	const maximumEdits = Math.min(2, Math.floor(normalizedQuery.length / 3));
	const matches: { spanish: string; priority: number; distance: number; index: number }[] = [];

	for (const [index, { spanish, spelling, normalized }] of searchOptions.entries()) {
		let priority: number;
		let distance = 0;
		if (spelling === querySpelling) {
			priority = 0;
		} else if (normalized === normalizedQuery) {
			priority = 1;
		} else if (normalized.startsWith(normalizedQuery)) {
			priority = 2;
		} else if (normalized.includes(normalizedQuery)) {
			priority = 3;
		} else {
			if (normalizedQuery.length < 4) continue;
			distance = boundedEditDistance(normalizedQuery, normalized, maximumEdits);
			if (distance > maximumEdits) continue;
			priority = 4;
		}
		matches.push({ spanish, priority, distance, index });
	}

	return matches
		.sort((a, b) => a.priority - b.priority || a.distance - b.distance || a.index - b.index)
		.slice(0, resultLimit)
		.map(({ spanish }) => spanish);
}
