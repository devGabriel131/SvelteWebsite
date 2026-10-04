import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import {
	deckSize,
	frequencyDecks,
	frequencyWords,
	isCorrectAnswer,
	normalizeAnswer,
	searchSpanishOptions,
	spanishOptions,
	type FrequencyWord
} from '../src/lib/frequency/vocabulary';

function optionSpelling(value: string): string {
	return value.normalize('NFC').toLowerCase().trim().replace(/\s+/g, ' ');
}

describe('source vocabulary and decks', () => {
	test('preserves all 1,001 source rows and their one-based ranks', () => {
		expect(frequencyWords).toHaveLength(1001);
		expect(frequencyWords.map(({ rank }) => rank)).toEqual(
			Array.from({ length: 1001 }, (_, index) => index + 1)
		);
		expect(frequencyWords.slice(0, 6)).toEqual([
			{ rank: 1, english: 'you', spanish: 'tú' },
			{ rank: 2, english: 'i', spanish: 'yo' },
			{ rank: 3, english: 'the', spanish: 'el' },
			{ rank: 4, english: 'to', spanish: 'a' },
			{ rank: 5, english: 'a', spanish: 'a' },
			{ rank: 6, english: 'it', spanish: 'el o la (objeto)' }
		]);
		expect(frequencyWords.slice(-2)).toEqual([
			{ rank: 1000, english: 'decision', spanish: 'decisión' },
			{ rank: 1001, english: 'south', spanish: 'sur' }
		]);
	});

	test('preserves every exact word, translation, and position from the supplied CSV', () => {
		// Fingerprint the supplied CSV with LF separators; no dependency on the Downloads file.
		const sourceRows = frequencyWords.map(({ english, spanish }) => `${english},${spanish}`).join('\n');
		expect(createHash('sha256').update(sourceRows).digest('hex')).toBe(
			'51b6af311b6532d2f456fb98def7060e682aea56b4534c5eb936a55da88765f4'
		);
	});

	test('retains duplicate rows, capitalization, punctuation, and questionable translations', () => {
		expect(frequencyWords[23]).toEqual({ rank: 24, english: 'no', spanish: 'No' });
		expect(frequencyWords[24]).toEqual({ rank: 25, english: 'not', spanish: 'no' });
		expect(frequencyWords[168]).toEqual({ rank: 169, english: 'mr.', spanish: 'señor.' });
		expect(frequencyWords[493]).toEqual({ rank: 494, english: 'cool', spanish: 'Frío' });
		expect(frequencyWords[638]).toEqual({ rank: 639, english: 'worked', spanish: 'trabajó' });
	});

	test('zero-based decks cover every row once, including the short final deck', () => {
		expect(deckSize).toBe(25);
		expect(frequencyDecks).toHaveLength(41);
		for (const [id, deck] of frequencyDecks.entries()) {
			expect(deck.id).toBe(id);
			expect(deck.startRank).toBe(id * deckSize + 1);
			expect(deck.endRank).toBe(Math.min((id + 1) * deckSize, frequencyWords.length));
			expect(deck.words).toHaveLength(deck.endRank - deck.startRank + 1);
			expect(deck.words).toEqual(frequencyWords.slice(id * deckSize, (id + 1) * deckSize));
		}
		const deckWords = frequencyDecks.flatMap(({ words }) => words);
		expect(deckWords).toEqual(frequencyWords);
		expect(new Set(deckWords.map(({ rank }) => rank)).size).toBe(1001);
		expect(frequencyDecks[40]).toEqual({
			id: 40,
			startRank: 1001,
			endRank: 1001,
			words: [{ rank: 1001, english: 'south', spanish: 'sur' }]
		});
	});
});

describe('answer normalization and Spanish options', () => {
	test('normalizes accents, composed/decomposed Unicode, case, and whitespace', () => {
		expect(normalizeAnswer('\t  ÁRBOL \n DE  NIÑO\u00a0')).toBe('arbol de nino');
		expect(normalizeAnswer('MAÑANA')).toBe('manana');
		expect(normalizeAnswer('MAN\u0303ANA')).toBe('manana');
		expect(normalizeAnswer(' \t\n ')).toBe('');
	});

	test('keeps punctuation and word boundaries significant', () => {
		expect(normalizeAnswer(' SEÑOR. ')).toBe('senor.');
		expect(normalizeAnswer(' EL O LA (OBJETO) ')).toBe('el o la (objeto)');
		expect(normalizeAnswer('porfavor')).not.toBe(normalizeAnswer('por favor'));
	});

	test('deduplicates the full Spanish pool while retaining first source spellings and order', () => {
		const firstSpellings = new Map<string, string>();
		for (const { spanish } of frequencyWords) {
			const spelling = optionSpelling(spanish);
			if (!firstSpellings.has(spelling)) firstSpellings.set(spelling, spanish);
		}
		expect(spanishOptions).toHaveLength(889);
		expect(spanishOptions).toEqual([...firstSpellings.values()]);
		expect(new Set(spanishOptions.map(optionSpelling)).size).toBe(spanishOptions.length);
	});

	test('merges repeated/case variants but preserves distinct accented Spanish spellings', () => {
		expect(spanishOptions.filter((option) => normalizeAnswer(option) === 'a')).toEqual(['a']);
		expect(spanishOptions.filter((option) => normalizeAnswer(option) === 'el')).toEqual(['el', 'él']);
				expect(spanishOptions).toContain('si');
				expect(spanishOptions).toContain('sí');
		expect(spanishOptions.filter((option) => normalizeAnswer(option) === 'no')).toEqual(['No']);
		expect(spanishOptions.filter((option) => normalizeAnswer(option) === 'manana')).toEqual(['mañana']);
		expect(spanishOptions.filter((option) => normalizeAnswer(option) === 'frio')).toEqual(['Frío']);
		expect(frequencyWords[15].spanish).toBe('él');
		expect(frequencyWords[606].spanish).toBe('frío');
	});
});

describe('Spanish option search', () => {
	test('empty and whitespace-only queries have no suggestions', () => {
		for (const query of ['', ' ', '\t\n']) expect(searchSpanishOptions(query)).toEqual([]);
	});

	test('searches the entire pool, including the final deck', () => {
		expect(searchSpanishOptions('TÚ')[0]).toBe('tú');
				expect(searchSpanishOptions('él')[0]).toBe('él');
				expect(searchSpanishOptions('el')[0]).toBe('el');
				expect(searchSpanishOptions('sí')[0]).toBe('sí');
				expect(searchSpanishOptions('si')[0]).toBe('si');
		expect(searchSpanishOptions('SUR')[0]).toBe('sur');
		expect(searchSpanishOptions('  DECISIÓN  ')[0]).toBe('decisión');
	});

	test('accepts accents, case, and repeated whitespace while returning original spellings', () => {
		expect(searchSpanishOptions('MAN\u0303ANA')).toEqual(searchSpanishOptions('  Mañana  '));
		expect(searchSpanishOptions('manana')[0]).toBe('mañana');
		expect(searchSpanishOptions(' frio ')[0]).toBe('Frío');
		expect(searchSpanishOptions(' POR\t\n FAVOR ')[0]).toBe('por favor');
	});

	test('prioritizes exact matches, then prefixes, then substrings in source order', () => {
		expect(searchSpanishOptions('amigo')).toEqual(['amigo', 'amigos']);
		expect(searchSpanishOptions('cas', 20)).toEqual([
			'casa', 'caso', 'casado', 'casi', 'casamiento', 'marcas', 'chicas'
		]);
		expect(searchSpanishOptions('cia')).toContain('gracias');
		const matches = searchSpanishOptions('a', Infinity);
		const priorities = matches.map((option) => {
			const normalized = normalizeAnswer(option);
			return normalized === 'a' ? 0 : normalized.startsWith('a') ? 1 : 2;
		});
		expect(priorities).toEqual([...priorities].sort((a, b) => a - b));
		expect(matches[0]).toBe('a');
	});

	test('narrows literal suggestions as more characters are typed', () => {
		const broad = searchSpanishOptions('am', Infinity);
		const narrow = searchSpanishOptions('amig', Infinity);
		expect(narrow).toEqual(['amigo', 'amigos']);
		expect(narrow.length).toBeLessThan(broad.length);
		expect(narrow.every((option) => broad.includes(option))).toBe(true);
	});

	test('finds small misspellings and bounded subsequences', () => {
		for (const query of ['graicas', 'graciasz', 'grcias', 'graciaz']) {
			expect(searchSpanishOptions(query)[0]).toBe('gracias');
		}
	});

	test('puts direct matches ahead of fuzzy matches', () => {
		const matches = searchSpanishOptions('gracias');
		expect(matches[0]).toBe('gracias');
		expect(matches).toContain('gratis');
		expect(matches.indexOf('gratis')).toBeGreaterThan(matches.indexOf('gracias'));
	});

	test('rejects unrelated nonsense, excessive edits, and loose subsequences', () => {
		for (const query of ['zzzzzzzz', 'qzxw', 'graaaaacias', 'grcs', 'mn', 'mna']) {
			expect(searchSpanishOptions(query)).toEqual([]);
		}
	});

	test('uses deterministic limits and returns no duplicate spellings', () => {
		const all = searchSpanishOptions('am', Infinity);
		expect(searchSpanishOptions('am')).toEqual(all.slice(0, 6));
		expect(searchSpanishOptions('am', 2)).toEqual(all.slice(0, 2));
		expect(searchSpanishOptions('am', 2.9)).toEqual(all.slice(0, 2));
		for (const limit of [0, -1, NaN]) expect(searchSpanishOptions('am', limit)).toEqual([]);
		expect(searchSpanishOptions('am')).toEqual(searchSpanishOptions('am'));
		expect(new Set(all.map(optionSpelling)).size).toBe(all.length);
	});
});

describe('exact answer grading', () => {
	test('accepts normalized equality for every source word', () => {
		for (const word of frequencyWords) {
			expect(isCorrectAnswer(word, ` \t${normalizeAnswer(word.spanish).toUpperCase()}\n `)).toBe(true);
		}
	});

	test('does not grade fuzzy suggestions or partial answers as correct', () => {
		const thanks = frequencyWords[199];
		expect(thanks).toEqual({ rank: 200, english: 'thanks', spanish: 'gracias' });
		expect(searchSpanishOptions('graicas')).toContain(thanks.spanish);
		for (const answer of ['graicas', 'grcias', 'gra', 'gratis', 'thanks', '']) {
			expect(isCorrectAnswer(thanks, answer)).toBe(false);
		}
		expect(isCorrectAnswer(thanks, ' GRÁCIAS ')).toBe(true);
	});

	test('requires the entire stored translation, including punctuation and annotations', () => {
		const word: FrequencyWord = frequencyWords[5];
		expect(isCorrectAnswer(word, ' EL  O LA\n(OBJETO) ')).toBe(true);
		for (const answer of ['el', 'la', 'el o la', 'el o la objeto']) {
			expect(isCorrectAnswer(word, answer)).toBe(false);
		}
		expect(isCorrectAnswer(frequencyWords[168], 'señor')).toBe(false);
	});
});
