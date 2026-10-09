import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import {
	frequencyWords,
	getOtherSpanishAnswers,
	getSpanishAnswers,
	isCorrectAnswer,
	normalizeAnswer,
	searchSpanishOptions,
	spanishOptions,
	type FrequencyWord
} from '../src/lib/frequency/vocabulary';

function optionSpelling(value: string): string {
	return value.normalize('NFC').toLowerCase().trim().replace(/\s+/g, ' ');
}

function findWord(english: string): FrequencyWord {
	const word = frequencyWords.find((word) => word.english === english);
	if (!word) throw new Error(`Missing frequency word: ${english}`);
	return word;
}

describe('reviewed vocabulary and stable item identity', () => {
	test('preserves all 1,001 source English words, ranks, and positions', () => {
		expect(frequencyWords).toHaveLength(1001);
		expect(frequencyWords.map(({ rank }) => rank)).toEqual(
			Array.from({ length: 1001 }, (_, index) => index + 1)
		);
		const sourceOrder = frequencyWords.map(({ rank, english }) => `${rank},${english}`).join('\n');
		expect(createHash('sha256').update(sourceOrder).digest('hex')).toBe(
			'd5858682b2bc42e2b1e3d06a8c680d2c7e1878f0fd9d81c1ed70f0bb8165f0a9'
		);
	});

	test('uses corrected translations without removing English cards', () => {
		expect(frequencyWords.slice(0, 6).map(({ english, spanish }) => ({ english, spanish }))).toEqual([
			{ english: 'you', spanish: 'tú' },
			{ english: 'i', spanish: 'yo' },
			{ english: 'the', spanish: 'el' },
			{ english: 'to', spanish: 'a' },
			{ english: 'a', spanish: 'un' },
			{ english: 'it', spanish: 'eso' }
		]);
		const corrections: Record<string, string> = {
			killed: 'mató', college: 'universidad', dude: 'tipo', women: 'mujeres',
			cell: 'célula', its: 'su', sitting: 'sentado', wearing: 'llevando puesto',
			calling: 'llamando', seeing: 'viendo', speaking: 'hablando', giving: 'dando',
			thinking: 'pensando', working: 'trabajando', saying: 'diciendo', makes: 'hace',
			saw: 'vio', cool: 'genial', would: '-ría', will: 'ir a'
		};
		for (const [english, spanish] of Object.entries(corrections)) {
			expect(findWord(english).spanish).toBe(spanish);
		}
	});

	test('every card has unique, nonempty, individually selectable Spanish answers', () => {
		for (const word of frequencyWords) {
			const answers = getSpanishAnswers(word);
			expect(answers.length).toBeGreaterThan(0);
			expect(new Set(answers.map(normalizeAnswer)).size).toBe(answers.length);
			if (word.alternatives) expect(word.alternatives.length).toBeGreaterThan(0);
			for (const answer of answers) {
				expect(answer.trim()).toBe(answer);
				expect(answer.length).toBeGreaterThan(0);
				expect(spanishOptions).toContain(answer);
				expect(answer).not.toContain('/');
			}
		}
	});

	test('contains translations and alternatives without per-word usage notes', () => {
		for (const word of frequencyWords) expect('note' in word).toBe(false);
		expect(findWord('haven').spanish).toBe('refugio');
		expect(findWord('won').spanish).toBe('ganó');
	});

	test('every bundled item has a unique, permanent UUID independent of its content', () => {
		const ids = frequencyWords.map(({ id }) => id);
		expect(new Set(ids).size).toBe(frequencyWords.length);
		for (const id of ids) {
			expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
		}
		// Changing spelling or rank must not regenerate the persisted item catalog IDs.
		expect(createHash('sha256').update([...ids].sort().join('\n')).digest('hex')).toBe(
			'072ae90cafdbed25aad300e43c8fc76e8b385ce979f2729750f7816036294239'
		);
	});
});

describe('other accepted Spanish answers', () => {
	test('offers the other translations without repeating the chosen answer', () => {
		const car = findWord('car');
		expect(getOtherSpanishAnswers(car, 'carro')).toEqual(['auto', 'coche', 'automóvil']);
		expect(getOtherSpanishAnswers(car, 'auto')).toEqual(['carro', 'coche', 'automóvil']);
		expect(getOtherSpanishAnswers(car, 'coche')).toEqual(['carro', 'auto', 'automóvil']);
		expect(getOtherSpanishAnswers(car, 'automovil')).toEqual(['carro', 'auto', 'coche']);
	});

	test('excludes the chosen answer using the same normalization as grading', () => {
		expect(getOtherSpanishAnswers(findWord('you'), ' TU ')).toEqual(['usted', 'ustedes', 'vos']);
		expect(getOtherSpanishAnswers(findWord('please'), ' POR\t FAVOR ')).toEqual(['complacer', 'agradar']);
	});

	test('has no extra hint when there are no other accepted translations', () => {
		expect(getOtherSpanishAnswers(findWord('i'), ' YO ')).toEqual([]);
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
		expect(normalizeAnswer(' -RÍA ')).toBe('-ria');
		expect(normalizeAnswer('porfavor')).not.toBe(normalizeAnswer('por favor'));
	});

	test('deduplicates primary and alternative answers while retaining original Spanish spellings', () => {
		const firstSpellings = new Map<string, string>();
		for (const word of frequencyWords) {
			for (const answer of getSpanishAnswers(word)) {
				const spelling = optionSpelling(answer);
				if (!firstSpellings.has(spelling)) firstSpellings.set(spelling, answer);
			}
		}
		expect(spanishOptions).toEqual([...firstSpellings.values()]);
		expect(new Set(spanishOptions.map(optionSpelling)).size).toBe(spanishOptions.length);
		for (const answer of ['carro', 'auto', 'coche', 'complacer', 'universidad', 'célula']) {
			expect(spanishOptions).toContain(answer);
		}
	});

	test('preserves meaningful accented spellings in suggestions', () => {
		for (const answer of ['el', 'él', 'tu', 'tú', 'si', 'sí']) expect(spanishOptions).toContain(answer);
		expect(spanishOptions.filter((option) => normalizeAnswer(option) === 'no')).toEqual(['no']);
		expect(spanishOptions.filter((option) => normalizeAnswer(option) === 'manana')).toEqual(['mañana']);
	});
});

describe('Spanish option search', () => {
	test('empty and whitespace-only queries have no suggestions', () => {
		for (const query of ['', ' ', '\t\n']) expect(searchSpanishOptions(query)).toEqual([]);
	});

	test('searches the entire pool, including alternatives and the final item', () => {
		for (const answer of ['tú', 'él', 'el', 'sí', 'si', 'sur', 'decisión', 'auto', 'coche', 'complacer']) {
			expect(searchSpanishOptions(answer)[0]).toBe(answer);
		}
	});

	test('accepts accents, case, and repeated whitespace and returns correct spellings', () => {
		expect(searchSpanishOptions('MAN\u0303ANA')).toEqual(searchSpanishOptions('  Mañana  '));
		expect(searchSpanishOptions('manana')[0]).toBe('mañana');
		expect(searchSpanishOptions(' frio ')[0]).toBe('frío');
		expect(searchSpanishOptions(' POR\t\n FAVOR ')[0]).toBe('por favor');
		expect(searchSpanishOptions('celula')[0]).toBe('célula');
	});

	test('prioritizes exact matches, then prefixes, then substrings', () => {
		expect(searchSpanishOptions('amigo')[0]).toBe('amigo');
		const prefixes = searchSpanishOptions('cas', Infinity);
		expect(prefixes).toContain('casa');
		expect(prefixes).toContain('casamiento');
		const firstSubstring = prefixes.findIndex((option) => !normalizeAnswer(option).startsWith('cas'));
		expect(firstSubstring).toBeGreaterThan(0);
		expect(prefixes.slice(firstSubstring).every((option) => !normalizeAnswer(option).startsWith('cas'))).toBe(true);
		expect(searchSpanishOptions('cia')).toContain('gracias');
	});

	test('narrows literal suggestions as more characters are typed', () => {
		const broad = searchSpanishOptions('am', Infinity);
		const narrow = searchSpanishOptions('amig', Infinity);
		expect(narrow).toContain('amigo');
		expect(narrow).toContain('amigos');
		expect(narrow.length).toBeLessThan(broad.length);
		expect(narrow.every((option) => broad.includes(option))).toBe(true);
	});

	test('finds small misspellings and puts direct matches ahead of fuzzy suggestions', () => {
		for (const query of ['graicas', 'graciasz', 'grcias', 'graciaz']) {
			expect(searchSpanishOptions(query)[0]).toBe('gracias');
		}
		const matches = searchSpanishOptions('gracias');
		expect(matches[0]).toBe('gracias');
		expect(matches.indexOf('gratis')).toBeGreaterThan(0);
	});

	test('rejects unrelated nonsense, excessive edits, and loose subsequences', () => {
		for (const query of ['zzzzzzzz', 'qzxw', 'graaaaacias', 'grcs']) {
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

describe('reviewed answer grading', () => {
	test('accepts common alternative meanings, regional vocabulary, and polite/verb uses of please', () => {
		const examples: Record<string, string[]> = {
			car: ['carro', 'auto', 'coche'], a: ['un', 'una'], was: ['era', 'estaba', 'fue', 'estuvo'],
			please: ['por favor', 'complacer', 'agradar'], saw: ['vio', 'sierra'],
			cell: ['célula', 'celda', 'celular'], work: ['trabajar', 'trabajo'],
			makes: ['hace', 'fabrica', 'marcas'], giving: ['dando', 'generoso', 'donación'],
			moved: ['se movió', 'movió', 'conmovido', 'emocionado'],
			saved: ['salvó', 'guardado', 'ahorrado']
		};
		for (const [english, answers] of Object.entries(examples)) {
			for (const answer of answers) expect(isCorrectAnswer(findWord(english), answer)).toBe(true);
		}
	});

	test('rejects clear machine-translation errors rather than perpetuating them as alternatives', () => {
		for (const [english, incorrect] of [
			['college', 'colega'], ['dude', 'dudar'], ['killed', 'delicado'],
			['its', 'es'], ['women', 'mujer'], ['a', 'a'], ['would', 'quería'],
			['i-i', 'yo-yo'], ['george', 'Jorge']
		]) {
			expect(isCorrectAnswer(findWord(english), incorrect)).toBe(false);
		}
	});

	test('does not grade fuzzy queries, partial translations, or joined alternatives as correct', () => {
		const thanks = findWord('thanks');
		expect(searchSpanishOptions('graicas')).toContain('gracias');
		for (const answer of ['graicas', 'grcias', 'gra', 'gratis', 'thanks', '']) {
			expect(isCorrectAnswer(thanks, answer)).toBe(false);
		}
		expect(isCorrectAnswer(thanks, ' GRÁCIAS ')).toBe(true);
		expect(isCorrectAnswer(findWord('car'), 'auto / coche')).toBe(false);
		expect(isCorrectAnswer(findWord('it'), 'el o la (objeto)')).toBe(false);
	});
});
