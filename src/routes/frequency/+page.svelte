<script lang="ts">
	import VocabularyPractice from '#lib/components/VocabularyPractice.svelte';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import { formatMessage } from '#lib/i18n/translations.ts';
	import { roundSize } from '#lib/frequency/rules.ts';
	import { frequencyWords } from '#lib/frequency/vocabulary.ts';

	const language = useLanguage();
	const messages = $derived(language.messages.frequency);

</script>

<svelte:head>
	<title>{messages.pageTitle}</title>
	<meta name="description" content={messages.description} />
</svelte:head>

	<div class="page-heading">
		<p class="eyebrow">{messages.eyebrow}</p>
		<h1>{messages.title}</h1>
		<p class="introduction">{messages.introduction}</p>
		<div class="deck-facts">
			<span>{messages.direction}</span>
			<span>{formatMessage(messages.wordCount, { count: frequencyWords.length.toLocaleString(language.current) })}</span>
			<span>{formatMessage(messages.roundSize, { count: roundSize })}</span>
		</div>
	</div>

	<VocabularyPractice />

<style>
	.page-heading { margin-bottom: 1.5rem; }
	.eyebrow { color: var(--primary); font-size: 0.65rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }
	h1 { margin-top: 0.45rem; font-size: clamp(2rem, 3.5vw, 3rem); font-weight: 700; line-height: 1.15; letter-spacing: -0.05em; overflow-wrap: anywhere; }
	.introduction { max-width: 42rem; margin-top: 0.75rem; color: var(--muted-foreground); font-size: 0.875rem; line-height: 1.7; }
	.deck-facts { display: flex; flex-wrap: wrap; gap: 0.5rem 1.25rem; margin-top: 1rem; color: var(--muted-foreground); font-size: 0.75rem; }
	.deck-facts span:first-child { color: var(--primary); }

</style>
