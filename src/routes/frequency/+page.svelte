<script lang="ts">
	import { tick } from 'svelte';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import { formatMessage } from '#lib/i18n/translations.ts';
	import { answerCard, advanceRound, startRound, wordsToReview } from '#lib/frequency/practice.ts';
	import {
		deckSize,
		frequencyDecks,
		frequencyWords,
		searchSpanishOptions,
		type FrequencyWord
	} from '#lib/frequency/vocabulary.ts';

	const language = useLanguage();
	const messages = $derived(language.messages.frequency);
	let selectedDeck = $state(0);
	let round = $state(startRound(frequencyDecks[0].words));
	let reviewing = $state(false);
	let query = $state('');
	let activeIndex = $state(0);
	let suggestionsOpen = $state(false);
	let answerInput = $state<HTMLInputElement>();
	let nextButton = $state<HTMLButtonElement>();
	let summary = $state<HTMLElement>();

	const currentWord = $derived(round.words[round.index]);
	const feedback = $derived(round.answers[round.index]);
	const suggestions = $derived(searchSpanishOptions(query));
	const popupOpen = $derived(suggestionsOpen && suggestions.length > 0 && !feedback);
	const activeOption = $derived(suggestions[activeIndex]);
	const correctCount = $derived(round.answers.filter(({ outcome }) => outcome === 'correct').length);
	const reviewWords = $derived(wordsToReview(round));
	const progress = $derived((round.answers.length / round.words.length) * 100);

	async function beginRound(words: readonly FrequencyWord[], isReview = false) {
		round = startRound(words);
		reviewing = isReview;
		query = '';
		activeIndex = 0;
		suggestionsOpen = false;
		await tick();
		answerInput?.focus();
	}

	function changeDeck(id: number) {
		if (!frequencyDecks[id]) return;
		selectedDeck = id;
		void beginRound(frequencyDecks[id].words);
	}

	async function submitAnswer(value: string | null) {
		if (feedback || round.complete) return;
		round = answerCard(round, value);
		suggestionsOpen = false;
		await tick();
		nextButton?.focus();
	}

	async function nextCard() {
		round = advanceRound(round);
		query = '';
		activeIndex = 0;
		suggestionsOpen = false;
		await tick();
		if (round.complete) summary?.focus();
		else answerInput?.focus();
	}

	function handleSearchKey(event: KeyboardEvent) {
		if (event.isComposing) return;
		if (event.key === 'Escape') {
			suggestionsOpen = false;
			return;
		}
		if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && suggestions.length) {
			event.preventDefault();
			if (!popupOpen) {
				activeIndex = event.key === 'ArrowDown' ? 0 : suggestions.length - 1;
			} else {
				const direction = event.key === 'ArrowDown' ? 1 : -1;
				activeIndex = (activeIndex + direction + suggestions.length) % suggestions.length;
			}
			suggestionsOpen = true;
		}
		if (event.key === 'Enter') {
			event.preventDefault();
			if (popupOpen && activeOption) void submitAnswer(activeOption);
		}
	}
</script>

<svelte:head>
	<title>{messages.pageTitle}</title>
	<meta name="description" content={messages.description} />
</svelte:head>

<div class="frequency-page">
	<header class="page-heading">
		<p class="eyebrow">{messages.eyebrow}</p>
		<h1>{messages.title}</h1>
		<p class="introduction">{messages.introduction}</p>
		<div class="deck-facts">
			<span class="direction">{messages.direction}</span>
			<span>{formatMessage(messages.wordCount, { count: frequencyWords.length.toLocaleString(language.current) })}</span>
			<span>{formatMessage(messages.deckSize, { count: deckSize })}</span>
		</div>
	</header>

	<noscript><p class="notice">{messages.javascriptRequired}</p></noscript>

	<div class="deck-picker">
		<div>
			<label for="frequency-deck">{messages.chooseDeck}</label>
			<p id="deck-hint">{messages.deckHint}</p>
		</div>
		<select
			id="frequency-deck"
			value={selectedDeck}
			aria-describedby="deck-hint"
			onchange={(event) => changeDeck(Number(event.currentTarget.value))}
		>
			{#each frequencyDecks as deck (deck.id)}
				<option value={deck.id}>
					{formatMessage(messages.deckOption, { deck: deck.id + 1, start: deck.startRank, end: deck.endRank })}
				</option>
			{/each}
		</select>
	</div>

	<section class="practice-area" aria-label={reviewing ? messages.reviewRound : formatMessage(messages.deckLabel, { deck: selectedDeck + 1 })}>
		<div class="round-heading">
			<div>
				<p class="eyebrow">{reviewing ? messages.reviewRound : formatMessage(messages.deckLabel, { deck: selectedDeck + 1 })}</p>
				<p class="card-progress">
					{round.complete
						? formatMessage(messages.answeredProgress, { answered: round.answers.length, total: round.words.length })
						: formatMessage(messages.cardProgress, { current: round.index + 1, total: round.words.length })}
				</p>
			</div>
			<dl class="scoreboard">
				<div><dt>{messages.correctCount}</dt><dd>{correctCount}</dd></div>
				<div><dt>{messages.reviewCount}</dt><dd>{reviewWords.length}</dd></div>
			</dl>
		</div>
		<div
			class="progress-track"
			role="progressbar"
			aria-label={messages.progressLabel}
			aria-valuemin={0}
			aria-valuemax={round.words.length}
			aria-valuenow={round.answers.length}
			aria-valuetext={formatMessage(messages.answeredProgress, { answered: round.answers.length, total: round.words.length })}
		>
			<div style:width={`${progress}%`}></div>
		</div>

		{#if round.complete}
			<section class="round-summary" tabindex="-1" bind:this={summary} aria-labelledby="round-complete-title">
				<div class="completion-icon" aria-hidden="true">✓</div>
				<h2 id="round-complete-title">{messages.completeTitle}</h2>
				<p class="summary-score">{formatMessage(messages.completeMessage, { correct: correctCount, total: round.words.length })}</p>
				<p class="muted">{reviewWords.length ? messages.reviewMessage : messages.perfectMessage}</p>
				<div class="summary-actions">
					{#if reviewWords.length}
						<button class="primary-button" onclick={() => beginRound(reviewWords, true)}>
							{formatMessage(messages.reviewMissed, { count: reviewWords.length })}
						</button>
					{/if}
					{#if selectedDeck < frequencyDecks.length - 1}
						<button class:primary-button={!reviewWords.length} class:secondary-button={reviewWords.length > 0} onclick={() => changeDeck(selectedDeck + 1)}>
							{messages.nextDeck}<span aria-hidden="true">→</span>
						</button>
					{/if}
					<button class="text-button" onclick={() => beginRound(frequencyDecks[selectedDeck].words)}>{messages.restartDeck}</button>
				</div>
				{#if selectedDeck === frequencyDecks.length - 1}<p class="muted">{messages.lastDeck}</p>{/if}
				{#if reviewWords.length}
					<div class="review-list">
						<h3>{messages.reviewList}</h3>
						<dl>
							{#each reviewWords as word (word.rank)}
								<div><dt lang="en">{word.english}</dt><dd lang="es">{word.spanish}</dd></div>
							{/each}
						</dl>
					</div>
				{/if}
			</section>
		{:else}
			<div class="study-layout">
				<div class="card-stack">
					<div class="flashcard" class:revealed={feedback} class:correct={feedback?.outcome === 'correct'}>
						<div class="card-topline">
							<span>{feedback ? messages.spanishTranslation : messages.englishWord}</span>
							<span>{formatMessage(messages.frequencyRank, { rank: currentWord.rank })}</span>
						</div>
						{#key `${currentWord.rank}-${feedback?.outcome ?? 'question'}`}
							<div class="card-face">
								{#if feedback}
									<p class="original-word" lang="en">{currentWord.english}</p>
									<span class="translation-arrow" aria-hidden="true">↓</span>
									<h2 class="translation" lang="es">{currentWord.spanish}</h2>
									{#if currentWord.alternatives?.length}
										<p class="alternative-answers">
											<span>{messages.alsoAccepted}:</span>
											<span lang="es">{currentWord.alternatives.join(' · ')}</span>
										</p>
									{/if}
								{:else}
									<h2 class="english-word" lang="en">{currentWord.english}</h2>
									<p class="card-prompt">{messages.prompt}</p>
								{/if}
							</div>
						{/key}
						<div class="card-bottomline" aria-hidden="true"><span>{messages.englishShort}</span><span>→</span><span>{messages.spanishShort}</span></div>
					</div>
				</div>

				<div class="answer-area">
					{#if feedback}
						<div class="feedback" class:success={feedback.outcome === 'correct'}>
							<p class="feedback-label">
								<span aria-hidden="true">{feedback.outcome === 'correct' ? '✓' : '↺'}</span>
								{messages[feedback.outcome]}
							</p>
							<p class="feedback-hint">{messages[`${feedback.outcome}Hint`]}</p>
							{#if feedback.value !== null}
								<p class="chosen-answer">{messages.yourAnswer}: <span lang="es">{feedback.value}</span></p>
							{/if}
						</div>
						{#if currentWord.note}
							<div class="usage-note">
								<h3>{messages.usageNote}</h3>
								<p>{currentWord.note[language.current]}</p>
							</div>
						{/if}
						<button class="primary-button next-button" bind:this={nextButton} onclick={nextCard} aria-describedby="revealed-answer">
							{round.index === round.words.length - 1 ? messages.finishRound : messages.nextCard}
							<span aria-hidden="true">→</span>
						</button>
						<p id="revealed-answer" class="visually-hidden">
							{messages[feedback.outcome]}. <span lang="en">{currentWord.english}</span>: <span lang="es">{currentWord.spanish}</span>.
							{#if currentWord.alternatives?.length}
								{messages.alsoAccepted}: <span lang="es">{currentWord.alternatives.join(', ')}</span>.
							{/if}
						</p>
					{:else}
						<label for="spanish-answer">{messages.answerLabel}</label>
						<p class="answer-hint" id="answer-hint">{messages.answerHint}</p>
						<input
							id="spanish-answer"
							bind:this={answerInput}
							bind:value={query}
							lang="es"
							role="combobox"
							aria-autocomplete="list"
							aria-expanded={popupOpen}
							aria-controls="spanish-suggestions"
							aria-activedescendant={popupOpen && activeOption ? `spanish-option-${activeIndex}` : undefined}
							aria-describedby="answer-hint current-prompt"
							placeholder={messages.answerPlaceholder}
							autocomplete="off"
							spellcheck="false"
							maxlength={100}
							oninput={() => { activeIndex = 0; suggestionsOpen = true; }}
							onfocus={() => { suggestionsOpen = true; }}
							onblur={() => { suggestionsOpen = false; }}
							onkeydown={handleSearchKey}
						/>
						<span id="current-prompt" class="visually-hidden" lang="en">{currentWord.english}</span>
						<div class="search-results">
							<ul id="spanish-suggestions" role="listbox" aria-label={messages.suggestionsLabel} hidden={!popupOpen}>
								{#each suggestions as option, index (option)}
									<li role="presentation">
										<button
											id={`spanish-option-${index}`}
											class="suggestion"
											class:active={activeIndex === index}
											role="option"
											aria-selected={activeIndex === index}
											tabindex="-1"
											lang="es"
											onpointerdown={(event) => event.preventDefault()}
											onclick={() => submitAnswer(option)}
										>
											{option}<span aria-hidden="true">↵</span>
										</button>
									</li>
								{/each}
							</ul>
							{#if !query.trim()}<p class="search-empty">{messages.searchPrompt}</p>
							{:else if !suggestions.length}<p class="search-empty">{messages.noMatches}</p>{/if}
						</div>
						<p class="visually-hidden" role="status">
							{query.trim() ? (suggestions.length ? formatMessage(messages.suggestionCount, { count: suggestions.length }) : messages.noMatches) : ''}
						</p>
						<div class="answer-actions">
							<button class="primary-button" disabled={!activeOption} onclick={() => { if (activeOption) void submitAnswer(activeOption); }}>{messages.checkAnswer}</button>
							<button class="text-button" onclick={() => submitAnswer(null)}>{messages.dontKnow}</button>
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</section>

	<details class="list-details">
		<summary>{messages.listDetails}</summary>
		<p>{messages.listNote}</p>
	</details>
</div>

<style>
	.frequency-page { max-width: 70rem; margin-inline: auto; }
	.eyebrow { margin: 0 0 0.5rem; color: var(--color-accent); font-size: 0.75rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
	h1 { margin: 0; font-family: var(--font-display); font-size: clamp(1.4rem, 3vw, 2.25rem); line-height: 1.3; letter-spacing: -0.02em; text-transform: uppercase; overflow-wrap: anywhere; }
	.introduction { max-width: 45rem; margin: 0.9rem 0 0; color: var(--color-muted); }
	.deck-facts { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 1.25rem; margin-top: 1.25rem; color: var(--color-muted); font-size: 0.8rem; }
	.direction { padding: 0.35rem 0.7rem; border: 1px solid var(--color-border); border-radius: 2rem; color: var(--color-accent); background: var(--color-accent-soft); }
	.deck-picker { display: flex; align-items: center; justify-content: space-between; gap: 1.5rem; margin-top: 2rem; padding: 1.25rem; border: 1px solid var(--color-border); border-radius: 0.75rem; background: var(--color-surface); }
	label { display: block; font-weight: 700; font-size: 0.9rem; }
	.deck-picker p { max-width: 36rem; margin: 0.35rem 0 0; font-size: 0.8rem; color: var(--color-muted); }
	select, input { border: 1px solid var(--color-border); border-radius: 0.5rem; background: var(--color-background); color: var(--color-text); }
	select { flex-shrink: 0; max-width: 100%; padding: 0.8rem; font-size: 0.875rem; }
	.practice-area { margin-top: 2rem; }
	.round-heading { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
	.round-heading .eyebrow { margin-bottom: 0.15rem; }
	.card-progress { margin: 0; font-size: 0.875rem; color: var(--color-muted); }
	.scoreboard { display: flex; gap: 1.5rem; margin: 0; text-align: right; }
	.scoreboard dt { color: var(--color-muted); font-size: 0.7rem; }
	.scoreboard dd { margin: 0; font-size: 1.5rem; font-weight: 700; line-height: 1.3; font-variant-numeric: tabular-nums; }
	.scoreboard div:first-child dd { color: var(--color-accent); }
	.progress-track { height: 0.3rem; margin: 1rem 0 1.75rem; border-radius: 1rem; background: var(--color-border); overflow: hidden; }
	.progress-track > div { height: 100%; border-radius: inherit; background: var(--color-accent); transition: width 200ms ease; }
	.study-layout { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 2rem; align-items: start; }
	.card-stack { position: relative; isolation: isolate; margin: 0 0.3rem 0.6rem; }
	.card-stack::before, .card-stack::after { content: ''; position: absolute; inset: 0; z-index: -1; border: 1px solid var(--color-border); border-radius: 1rem; background: var(--color-surface); }
	.card-stack::before { transform: rotate(-2deg) translateY(0.35rem); }
	.card-stack::after { transform: rotate(1deg) translateY(0.2rem); }
	.flashcard { display: flex; flex-direction: column; min-height: 23rem; padding: 1.5rem; border: 1px solid var(--color-border); border-radius: 1rem; background: radial-gradient(ellipse at 50% 0%, var(--color-accent-soft), transparent 75%), var(--color-surface); }
	.flashcard.revealed { border-color: var(--color-accent-secondary); }
	.flashcard.correct { border-color: var(--color-accent); }
	.card-topline { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.5rem; color: var(--color-muted); font-size: 0.6875rem; }
	.card-face { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; padding: 2rem 0.25rem; text-align: center; animation: reveal 220ms ease-out; }
	.english-word { margin: 0; font-size: clamp(2.75rem, 5vw, 4.5rem); line-height: 1.15; letter-spacing: -0.04em; overflow-wrap: anywhere; max-width: 100%; }
	.card-prompt { margin: 1.25rem 0 0; color: var(--color-muted); font-size: 0.875rem; }
	.original-word { margin: 0; font-size: 1.5rem; color: var(--color-muted); overflow-wrap: anywhere; max-width: 100%; }
	.translation-arrow { margin: 0.5rem 0; color: var(--color-accent-secondary); }
	.translation { max-width: 100%; margin: 0; font-size: clamp(1.75rem, 3vw, 2.75rem); line-height: 1.25; letter-spacing: -0.03em; overflow-wrap: anywhere; color: var(--color-accent); }
	.alternative-answers {
		max-width: 100%;
		margin: 1rem 0 0;
		font-size: 0.85rem;
		color: var(--color-muted);
		overflow-wrap: anywhere;
	}

	.alternative-answers span:first-child {
		display: block;
		margin-bottom: 0.25rem;
		font-size: 0.7rem;
		color: var(--color-accent-secondary);
	}

	.usage-note {
		margin-top: 1rem;
		padding-left: 1rem;
		border-left: 2px solid var(--color-accent-secondary);
		font-size: 0.8rem;
		color: var(--color-muted);
	}

	.usage-note h3 {
		margin: 0 0 0.35rem;
		font-size: 0.8rem;
		color: var(--color-text);
	}

	.usage-note p {
		margin: 0;
		line-height: 1.65;
	}

	.card-bottomline { display: flex; justify-content: center; gap: 1rem; color: var(--color-accent-secondary); font-size: 0.7rem; font-weight: 700; letter-spacing: 0.1em; }
	.answer-area { min-width: 0; padding-top: 0.25rem; }
	.answer-hint { margin: 0.4rem 0 1rem; font-size: 0.8rem; line-height: 1.65; color: var(--color-muted); }
	input { width: 100%; min-height: 3.25rem; padding: 0.85rem 1rem; background: var(--color-surface); }
	input::placeholder { color: var(--color-muted); opacity: 0.8; }
	.search-results { min-height: 3.5rem; margin-top: 0.5rem; }
	ul { margin: 0; padding: 0.35rem; list-style: none; border: 1px solid var(--color-border); border-radius: 0.75rem; background: var(--color-surface); }
	button { cursor: pointer; }
	.suggestion { display: flex; align-items: center; justify-content: space-between; gap: 1rem; width: 100%; min-height: 2.75rem; padding: 0.65rem 0.75rem; border: 0; border-radius: 0.4rem; background: transparent; color: var(--color-text); text-align: left; overflow-wrap: anywhere; }
	.suggestion span { color: var(--color-accent-secondary); font-size: 0.8rem; }
	.suggestion:hover, .suggestion.active { background: var(--color-accent-soft); color: var(--color-accent); }
	.search-empty { margin: 0; padding: 0.5rem 0.25rem; color: var(--color-muted); font-size: 0.8rem; }
	.answer-actions { display: flex; flex-wrap: wrap; gap: 0.75rem 1rem; align-items: center; margin-top: 1rem; }
	.primary-button, .secondary-button { display: inline-flex; justify-content: center; align-items: center; gap: 0.75rem; min-height: 2.75rem; padding: 0.75rem 1rem; border: 1px solid var(--color-accent); border-radius: 0.5rem; font-size: 0.875rem; font-weight: 700; }
	.primary-button { background: var(--color-accent); color: var(--color-background); }
	.primary-button:hover:not(:disabled) { filter: brightness(1.1); }
	.primary-button:disabled { opacity: 0.4; cursor: not-allowed; }
	.secondary-button { background: var(--color-accent-soft); color: var(--color-accent); }
	.secondary-button:hover { background: var(--color-background); }
	.text-button { min-height: 2.75rem; padding: 0.5rem 0.1rem; border: 0; background: transparent; color: var(--color-muted); font-size: 0.875rem; text-decoration: underline; text-underline-offset: 0.25rem; }
	.text-button:hover { color: var(--color-text); }
	.feedback { margin-top: 1.5rem; padding: 1.25rem; border: 1px solid var(--color-border); border-radius: 0.75rem; background: var(--color-surface); }
	.feedback.success { background: var(--color-accent-soft); }
	.feedback-label { display: flex; align-items: center; gap: 0.65rem; margin: 0; font-size: 1.15rem; font-weight: 700; }
	.feedback-label span { color: var(--color-accent); }
	.feedback-hint { margin: 0.6rem 0 0; color: var(--color-muted); font-size: 0.875rem; }
	.chosen-answer { margin: 1rem 0 0; color: var(--color-muted); font-size: 0.8rem; }
	.chosen-answer span { color: var(--color-text); }
	.next-button { margin-top: 1.25rem; width: 100%; justify-content: space-between; }
	.round-summary { padding: clamp(1.25rem, 4vw, 2.5rem); border: 1px solid var(--color-border); border-radius: 1rem; background: var(--color-surface); text-align: center; }
	.completion-icon { display: grid; place-items: center; width: 3rem; height: 3rem; margin: 0 auto 1rem; border-radius: 50%; background: var(--color-accent-soft); color: var(--color-accent); font-size: 1.5rem; }
	.round-summary h2 { margin: 0; font-size: 1.75rem; }
	.summary-score { margin: 0.5rem 0; font-size: 1.1rem; color: var(--color-accent); }
	.muted { color: var(--color-muted); font-size: 0.875rem; }
	.summary-actions { display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 1rem; margin-top: 1.5rem; }
	.review-list { max-width: 40rem; margin: 2rem auto 0; text-align: left; }
	.review-list h3 { margin: 0; font-size: 0.875rem; color: var(--color-muted); }
	.review-list dl { margin: 0.5rem 0 0; }
	.review-list dl div { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; padding: 0.65rem 0; border-bottom: 1px solid var(--color-border); overflow-wrap: anywhere; }
	.review-list dd { margin: 0; color: var(--color-accent); }
	.list-details { margin-top: 2rem; color: var(--color-muted); font-size: 0.8rem; }
	.list-details summary { cursor: pointer; width: fit-content; }
	.list-details p { max-width: 50rem; line-height: 1.75; }
	.notice { padding: 1rem; border: 1px solid var(--color-border); border-radius: 0.5rem; }
	.visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
	@keyframes reveal { from { opacity: 0; transform: translateY(0.5rem); } to { opacity: 1; transform: translateY(0); } }
	@media (max-width: 64rem) {
		.study-layout { grid-template-columns: minmax(0, 1fr); gap: 1.5rem; }
		.flashcard { min-height: 18rem; }
		.feedback { margin-top: 0; }
		.deck-picker { flex-direction: column; align-items: stretch; gap: 1rem; }
		select { width: 100%; }
	}
	@media (prefers-reduced-motion: reduce) { .card-face { animation: none; } .progress-track > div { transition: none; } }
</style>
