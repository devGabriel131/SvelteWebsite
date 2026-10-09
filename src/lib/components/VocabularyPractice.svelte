
<script lang="ts">
	import { tick } from 'svelte';
	import { ArrowRight, BookOpen, Check, Keyboard } from '@lucide/svelte';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Progress } from '#lib/components/ui/progress/index.js';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import { formatMessage } from '#lib/i18n/translations.ts';
	import {
		answerCard,
		advanceRound,
		getCompleteness,
		startRound,
		wordsToReview,
		type PracticeRound
	} from '#lib/frequency/practice.ts';
	import { roundSize } from '#lib/frequency/rules.ts';
	import { frequencyWords, getOtherSpanishAnswers, searchSpanishOptions } from '#lib/frequency/vocabulary.ts';


	const language = useLanguage();
	const messages = $derived(language.messages.frequency);
	let round = $state<PracticeRound | null>(null);
	let roundNumber = $state(0);
	let query = $state('');
	let activeIndex = $state(0);
	let suggestionsOpen = $state(false);
	let answerInput = $state<HTMLElement | null>(null);
	let nextButton = $state<HTMLElement | null>(null);
	let summary = $state<HTMLElement>();

	const roundLabel = $derived(formatMessage(messages.roundLabel, {
		round: roundNumber.toLocaleString(language.current)
	}));
	const currentCard = $derived(round?.currentCard);
	const currentWord = $derived(currentCard?.word);
	const feedback = $derived(round?.answers.find(({ cardId }) => cardId === currentCard?.id));
	const otherAnswers = $derived(
		currentWord && feedback?.outcome === 'correct' && feedback.value !== null
			? getOtherSpanishAnswers(currentWord, feedback.value)
			: []
	);
	const suggestions = $derived(searchSpanishOptions(query));
	const popupOpen = $derived(suggestionsOpen && suggestions.length > 0 && !feedback);
	const activeOption = $derived(suggestions[activeIndex]);
	const correctCount = $derived(round?.answers.filter(({ outcome }) => outcome === 'correct').length ?? 0);
	const incorrectCount = $derived(round?.answers.filter(({ outcome }) => outcome === 'incorrect').length ?? 0);
	const skippedCount = $derived(round?.answers.filter(({ outcome }) => outcome === 'skipped').length ?? 0);
	const reviewWords = $derived(round ? wordsToReview(round) : []);
	const answeredCount = $derived(round?.answers.length ?? 0);
	const completeness = $derived(getCompleteness(frequencyWords, round?.progress ?? {}));
	const steps = ['recall', 'search', 'repeat'] as const;

	function poolProgress(count: number): string {
		return formatMessage(messages.poolProgress, {
			count: count.toLocaleString(language.current),
			total: completeness.totalItems.toLocaleString(language.current),
			percent: ((count / completeness.totalItems) * 100).toLocaleString(language.current, { maximumFractionDigits: 1 })
		});
	}

	async function beginRound() {
		if (round && (!round.complete || round.currentCard)) return;
		const previousRound = round;
		round = startRound(frequencyWords, previousRound?.progress, {
			previousWordId: previousRound?.answers.at(-1)?.word.id
		});
		roundNumber++;
		query = '';
		activeIndex = 0;
		suggestionsOpen = false;
		await tick();
		answerInput?.focus();
	}

	async function submitAnswer(value: string | null) {
		if (!round || !currentCard || feedback || round.complete) return;
		const answered = answerCard(round, currentCard.id, value);
		if (answered === round) return;
		round = answered;
		suggestionsOpen = false;
		await tick();
		nextButton?.focus();
	}

	async function nextCard() {
		if (!round || !currentCard || !feedback) return;
		round = advanceRound(round, currentCard.id);
		query = '';
		activeIndex = 0;
		suggestionsOpen = false;
		await tick();
		if (round.complete && !round.currentCard) summary?.focus();
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

<div class="vocabulary-practice">
	<noscript><p class="notice">{messages.javascriptRequired}</p></noscript>

	<section class="vocabulary-progress" aria-labelledby="vocabulary-progress-title">
		<Card.Root class="coverage-panel gap-0 p-5 text-base">
		<div class="pass-heading">
			<h2 id="vocabulary-progress-title">{messages.progressTitle}</h2>
			<Badge variant="outline" class="h-auto min-w-0 whitespace-normal px-[0.7rem] py-[0.35rem] text-[0.8rem] text-primary">{formatMessage(messages.currentPass, { pass: completeness.currentPass })}</Badge>
		</div>
		<dl class="coverage-stats">
			<div><dt>{messages.practiceCoverage}</dt><dd><strong>{completeness.practicedItems.toLocaleString(language.current)}</strong><span> / {completeness.totalItems.toLocaleString(language.current)}</span></dd></div>
			<div><dt>{messages.firstPassCoverage}</dt><dd><strong>{completeness.successfulItems.toLocaleString(language.current)}</strong><span> / {completeness.totalItems.toLocaleString(language.current)}</span></dd></div>
		</dl>
		<div class="pass-heading pass-progress-heading">
			<p>{messages.passProgressLabel}</p>
			<p>{poolProgress(completeness.currentPassCompletedItems)}</p>
		</div>
		<Progress
			class="my-[0.65rem] h-[0.3rem]"
			max={completeness.totalItems}
			value={completeness.currentPassCompletedItems}
			aria-label={messages.passProgressLabel}
			aria-valuetext={poolProgress(completeness.currentPassCompletedItems)}
		/>
		<p class="session-notice">{messages.sessionOnly}</p>
		</Card.Root>
	</section>


	<section class="practice-area" aria-label={round ? roundLabel : messages.readyTitle}>

		{#if round}
			<div class="round-heading">
				<div>
					<p class="eyebrow">{roundLabel}</p>
					<p class="card-progress">
						{round.complete
							? formatMessage(messages.answeredProgress, { answered: answeredCount, total: roundSize })
							: formatMessage(messages.cardProgress, { current: currentCard?.position ?? 1, total: roundSize })}
					</p>
				</div>
				<dl class="scoreboard">
					<div><dt>{messages.correctCount}</dt><dd>{correctCount}</dd></div>
					<div><dt>{messages.incorrectCount}</dt><dd>{incorrectCount}</dd></div>
					<div><dt>{messages.skippedCount}</dt><dd>{skippedCount}</dd></div>
				</dl>
			</div>
			<Progress
				class="round-progress mt-4 mb-6 h-[0.3rem]"
				max={roundSize}
				value={answeredCount}
				aria-label={messages.progressLabel}
				aria-valuetext={formatMessage(messages.answeredProgress, { answered: answeredCount, total: roundSize })}
			/>

			{#if round.complete && !currentCard}
				<section class="round-summary" tabindex="-1" bind:this={summary} aria-labelledby="round-complete-title">
					<Card.Root class="summary-panel gap-0 p-[clamp(1.25rem,4vw,2.5rem)] text-base">
					<div class="completion-icon" aria-hidden="true"><Check size={24} /></div>
					<h2 id="round-complete-title">{messages.completeTitle}</h2>
					<p class="summary-score">{formatMessage(messages.completeMessage, { correct: correctCount, total: roundSize })}</p>
					<p class="muted">{reviewWords.length ? messages.reviewMessage : messages.perfectMessage}</p>
					<div class="summary-actions">
						<Button class="next-round-button gap-3 px-4 py-3 font-bold" onclick={beginRound}>
							{messages.nextRound}<ArrowRight size={16} aria-hidden="true" />
						</Button>
					</div>
					{#if reviewWords.length}
						<div class="review-list">
							<h3>{messages.reviewList}</h3>
							<dl>
								{#each reviewWords as word (word.id)}
									<div><dt lang="en">{word.english}</dt><dd lang="es">{word.spanish}</dd></div>
								{/each}
							</dl>
						</div>
					{/if}
					</Card.Root>
				</section>
			{:else if currentCard && currentWord}
				<div class="study-layout">
					<div class="card-stack">
						<Card.Root class={`flashcard gap-0 ${feedback ? 'revealed' : ''} ${feedback?.outcome === 'correct' ? 'correct' : ''}`}>
							<div class="card-topline">
								<span>{feedback ? messages.spanishTranslation : messages.englishWord}</span>
								<span>{formatMessage(messages.frequencyRank, { rank: currentWord.rank })}</span>
							</div>
							{#key `${currentCard.id}-${feedback?.outcome ?? 'question'}`}
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
							<div class="card-bottomline" aria-hidden="true"><span>{messages.englishShort}</span><ArrowRight size={14} /><span>{messages.spanishShort}</span></div>
						</Card.Root>
					</div>

					<div class="answer-area">
						{#if feedback}
							<div class="feedback">
								<Alert.Root role="status" class={feedback.outcome === 'correct' ? 'gap-0 bg-accent p-5' : 'gap-0 p-5'}>
								<p class="feedback-label">
									<span aria-hidden="true">{feedback.outcome === 'correct' ? '✓' : '↺'}</span>
									{messages[feedback.outcome]}
								</p>
								{#if feedback.outcome === 'correct'}
									{#if otherAnswers.length}
										<p class="feedback-hint">
											{messages.otherWaysToSayIt}: <span lang="es">{otherAnswers.join(' · ')}</span>
										</p>
									{/if}
								{:else}
									<p class="feedback-hint">{feedback.outcome === 'incorrect' ? messages.incorrectHint : messages.skippedHint}</p>
								{/if}
								{#if feedback.value !== null}
									<p class="chosen-answer">{messages.yourAnswer}: <span lang="es">{feedback.value}</span></p>
								{/if}
								</Alert.Root>
							</div>

							<Button class="next-card-button mt-5 w-full justify-between gap-3 px-4 py-3 font-bold" bind:ref={nextButton} onclick={nextCard} aria-describedby="revealed-answer">
								{round.complete ? messages.finishRound : messages.nextCard}
								<span aria-hidden="true">→</span>
							</Button>
							<p id="revealed-answer" class="sr-only">
								{messages[feedback.outcome]}. <span lang="en">{currentWord.english}</span>: <span lang="es">{currentWord.spanish}</span>.
								{#if currentWord.alternatives?.length}
									{messages.alsoAccepted}: <span lang="es">{currentWord.alternatives.join(', ')}</span>.
								{/if}
							</p>
						{:else}
							<Label for="spanish-answer" class="block text-[0.9rem] font-bold">{messages.answerLabel}</Label>
							<p class="answer-hint" id="answer-hint">{messages.answerHint}</p>
							<Input
								id="spanish-answer"
								class="min-h-[3.25rem] px-4 py-[0.85rem]"
								bind:ref={answerInput}
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
							<span id="current-prompt" class="sr-only" lang="en">{currentWord.english}</span>
							<div class="search-results">
								<ul id="spanish-suggestions" role="listbox" aria-label={messages.suggestionsLabel} hidden={!popupOpen}>
									{#each suggestions as option, index (option)}
										<li role="presentation">
											<Button
												variant="ghost"
												id={`spanish-option-${index}`}
												class="w-full justify-between gap-4 px-3 py-[0.65rem] text-left [overflow-wrap:anywhere]"
												role="option"
												aria-selected={activeIndex === index}
												tabindex={-1}
												lang="es"
												onpointerdown={(event) => event.preventDefault()}
												onclick={() => submitAnswer(option)}
											>
												{option}<span class="text-secondary text-[0.8rem]" aria-hidden="true">↵</span>
											</Button>
										</li>
									{/each}
								</ul>
								{#if !query.trim()}<p class="search-empty">{messages.searchPrompt}</p>
								{:else if !suggestions.length}<p class="search-empty">{messages.noMatches}</p>{/if}
							</div>
							<p class="sr-only" role="status">
								{query.trim() ? (suggestions.length ? formatMessage(messages.suggestionCount, { count: suggestions.length }) : messages.noMatches) : ''}
							</p>
							<div class="answer-actions">
								<!-- Keep input focus until click: closing suggestions on blur would move these buttons before release. -->
								<Button
									class="check-answer-button gap-3 px-4 py-3 font-bold"
									disabled={!activeOption}
									onpointerdown={(event) => event.preventDefault()}
									onclick={() => { if (activeOption) void submitAnswer(activeOption); }}
								>{messages.checkAnswer}</Button>
								<Button
									variant="ghost"
									class="reveal-button px-3 py-2 text-muted-foreground"
									onpointerdown={(event) => event.preventDefault()}
									onclick={() => submitAnswer(null)}
								>{messages.dontKnow}</Button>
							</div>
						{/if}
					</div>
				</div>
			{/if}
		{:else}
			<div class="start-layout">
				<Card.Root class="start-panel gap-0">
					<div class="start-topline">
						<span class="deck-icon" aria-hidden="true"><BookOpen size={22} /></span>
						<Badge variant="outline" class="whitespace-normal text-secondary">{messages.untimed}</Badge>
					</div>

					<p class="eyebrow">{messages.sessionLabel}</p>
					<h2>{messages.setupTitle}</h2>
					<p class="setup-description">{messages.setupDescription}</p>
					<Button type="button" class="start-button mt-6 justify-between gap-4 px-5 py-3 font-bold" onclick={beginRound}>
						{messages.startRound}<ArrowRight size={18} aria-hidden="true" />
					</Button>
					<p class="start-hint">{formatMessage(messages.startHint, { count: roundSize })}</p>
				</Card.Root>
				<section class="method-panel" aria-labelledby="method-title">
					<p class="eyebrow" id="method-title">{messages.methodTitle}</p>
					<ol class="method-steps">
						{#each steps as step, index (step)}
							<li><span class="step-number" aria-hidden="true">0{index + 1}</span><div><h3>{messages.methodSteps[step].title}</h3><p>{messages.methodSteps[step].description}</p></div></li>
						{/each}
					</ol>
					<p class="keyboard-tip"><Keyboard size={16} aria-hidden="true" />{messages.keyboardTip}</p>
				</section>
			</div>
		{/if}
	</section>

</div>

<style>
	.vocabulary-practice { --practice-radius: 1rem; display: grid; grid-template-areas: 'session' 'coverage'; grid-template-columns: minmax(0, 1fr); gap: 1.5rem; align-items: start; }
	.practice-area { grid-area: session; min-width: 0; }
	.vocabulary-progress { grid-area: coverage; min-width: 0; }
	.eyebrow { margin: 0; color: var(--primary); font-size: 0.65rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }
	.start-layout { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 1.5rem; align-items: center; }
	.vocabulary-practice :global(.start-panel) { padding: clamp(1.25rem, 3vw, 2rem); border-radius: var(--practice-radius); box-shadow: none; }
	.start-topline { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 2rem; }
	.deck-icon { display: grid; place-items: center; width: 3rem; height: 3rem; border: 1px solid var(--border); border-radius: 0.8rem; background: var(--accent); color: var(--primary); }

	.start-layout h2 { max-width: 24rem; margin: 0.65rem 0 0; font-size: clamp(1.75rem, 2.5vw, 2.5rem); font-weight: 700; letter-spacing: -0.055em; line-height: 1.15; overflow-wrap: anywhere; }
	.setup-description { max-width: 27rem; margin-top: 1rem; color: var(--muted-foreground); font-size: 0.875rem; line-height: 1.75; }
	.start-hint { margin-top: 0.8rem; color: var(--muted-foreground); font-size: 0.7rem; }
	.method-panel { padding: 1.25rem; min-width: 0; }
	.method-panel > .eyebrow { color: var(--secondary); }
	.method-steps { list-style: none; padding: 0; margin: 1.25rem 0; }
	.method-steps li { display: flex; gap: 0.85rem; padding-block: 1.15rem; border-bottom: 1px solid var(--border); }
	.method-steps li:first-child { padding-top: 0; }
	.step-number { flex-shrink: 0; padding-top: 0.1rem; color: var(--secondary); font: 0.75rem var(--font-mono); }
	.method-steps h3 { font-size: 0.95rem; font-weight: 700; }
	.method-steps p { margin-top: 0.3rem; font-size: 0.8rem; line-height: 1.65; color: var(--muted-foreground); }
	.keyboard-tip { display: flex; align-items: flex-start; gap: 0.6rem; font-size: 0.7rem; line-height: 1.65; color: var(--muted-foreground); }
	.keyboard-tip :global(svg) { flex-shrink: 0; margin-top: 0.1rem; color: var(--secondary); }

	.vocabulary-practice :global(.coverage-panel) { border-radius: var(--practice-radius); box-shadow: none; }
	.pass-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem 1rem; }
	.pass-heading h2 { margin: 0; font-size: 0.85rem; font-weight: 700; }
	.coverage-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; margin: 1.25rem 0; }
	.coverage-stats dt { color: var(--muted-foreground); font-size: 0.7rem; }
	.coverage-stats dd { margin: 0.35rem 0 0; font-variant-numeric: tabular-nums; }
	.coverage-stats strong { color: var(--primary); font-size: 1.65rem; line-height: 1; font-weight: 500; }
	.coverage-stats dd span { color: var(--secondary); font-size: 0.8rem; }
	.pass-progress-heading p { margin: 0; color: var(--muted-foreground); font-size: 0.7rem; }
	.session-notice { margin-top: 0.65rem; color: var(--muted-foreground); font-size: 0.65rem; line-height: 1.7; }

	.round-heading { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
	.round-heading .eyebrow { margin-bottom: 0.3rem; }
	.card-progress { margin: 0; font-size: 0.8rem; color: var(--muted-foreground); }
	.scoreboard { display: flex; gap: 1.5rem; margin: 0; text-align: right; }
	.scoreboard dt { color: var(--muted-foreground); font-size: 0.65rem; }
	.scoreboard dd { margin: 0.2rem 0 0; font-size: 1.35rem; line-height: 1.3; font-variant-numeric: tabular-nums; }
	.scoreboard div:first-child dd { color: var(--primary); }
	.study-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 1.5rem; align-items: stretch; }
	.card-stack { position: relative; isolation: isolate; min-width: 0; }
	.vocabulary-practice :global(.flashcard) { display: flex; flex-direction: column; height: 100%; min-height: 22rem; padding: 1.5rem; border-radius: var(--practice-radius); background: var(--card); box-shadow: none; }
	.vocabulary-practice :global(.flashcard.revealed) { border-color: var(--secondary); }
	.vocabulary-practice :global(.flashcard.correct) { border-color: var(--primary); }
	.card-topline { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.5rem; color: var(--muted-foreground); font-size: 0.65rem; }
	.card-topline span:first-child { color: var(--secondary); }
	.card-face { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; min-width: 0; padding: 2rem 0; text-align: center; animation: reveal 180ms ease-out; }
	.english-word { max-width: 100%; margin: 0; font-size: clamp(2.5rem, 4.5vw, 4.5rem); font-weight: 700; line-height: 1.1; letter-spacing: -0.055em; overflow-wrap: anywhere; }
	.card-prompt { margin: 1.25rem 0 0; color: var(--muted-foreground); font-size: 0.8rem; }
	.original-word { max-width: 100%; margin: 0; font-size: 1.4rem; color: var(--muted-foreground); overflow-wrap: anywhere; }
	.translation-arrow { margin: 0.5rem 0; color: var(--secondary); }
	.translation { max-width: 100%; margin: 0; font-size: clamp(1.75rem, 3vw, 2.75rem); font-weight: 700; line-height: 1.25; letter-spacing: -0.03em; overflow-wrap: anywhere; color: var(--primary); }
	.alternative-answers { max-width: 100%; margin: 1rem 0 0; font-size: 0.8rem; color: var(--muted-foreground); overflow-wrap: anywhere; }
	.alternative-answers span:first-child { display: block; margin-bottom: 0.25rem; font-size: 0.7rem; color: var(--secondary); }
	.card-bottomline { display: flex; align-items: center; justify-content: center; gap: 1rem; color: var(--secondary); font-size: 0.65rem; font-weight: 700; letter-spacing: 0.1em; }
	.answer-area { min-width: 0; padding: 1.5rem; border: 1px solid var(--border); border-radius: var(--practice-radius); background: var(--card); }
	.answer-hint { margin: 0.5rem 0 1.25rem; font-size: 0.75rem; line-height: 1.7; color: var(--muted-foreground); }
	.search-results { min-height: 3.5rem; margin-top: 0.5rem; }
	ul { margin: 0; padding: 0.35rem; list-style: none; border: 1px solid var(--border); border-radius: 0.6rem; background: var(--background); }
	.search-results :global([aria-selected='true']) { background: var(--accent); color: var(--primary); }
	.search-empty { margin: 0; padding: 0.5rem 0.25rem; color: var(--muted-foreground); font-size: 0.75rem; line-height: 1.7; }
	.answer-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin-top: 1rem; }
	.answer-actions :global(button) { flex: 1 1 auto; }
	.feedback-label { display: flex; align-items: center; gap: 0.65rem; margin: 0; font-size: 1.15rem; font-weight: 700; }
	.feedback-label span { color: var(--primary); }
	.feedback-hint { margin: 0.6rem 0 0; color: var(--muted-foreground); font-size: 0.8rem; line-height: 1.7; }
	.chosen-answer { margin: 1rem 0 0; color: var(--muted-foreground); font-size: 0.8rem; overflow-wrap: anywhere; }
	.chosen-answer span { color: var(--foreground); }
	.round-summary { text-align: center; border-radius: var(--practice-radius); }
	.vocabulary-practice :global(.summary-panel) { border-radius: var(--practice-radius); box-shadow: none; }
	.completion-icon { display: grid; place-items: center; width: 3rem; height: 3rem; margin: 0 auto 1rem; border-radius: 50%; background: var(--accent); color: var(--primary); }
	.round-summary h2 { margin: 0; font-size: 1.75rem; font-weight: 700; letter-spacing: -0.04em; }
	.summary-score { margin: 0.5rem 0; font-size: 1rem; color: var(--primary); }
	.muted { color: var(--muted-foreground); font-size: 0.8rem; line-height: 1.7; }
	.summary-actions { display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 1rem; margin-top: 1.5rem; }
	.review-list { width: 100%; max-width: 40rem; margin: 2rem auto 0; text-align: left; }
	.review-list h3 { margin: 0; font-size: 0.8rem; color: var(--muted-foreground); }
	.review-list dl { margin: 0.5rem 0 0; }
	.review-list dl div { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 1rem; padding: 0.65rem 0; border-bottom: 1px solid var(--border); overflow-wrap: anywhere; font-size: 0.875rem; }
	.review-list dd { margin: 0; color: var(--primary); }


	noscript { grid-column: 1 / -1; }
	.notice { padding: 1rem; border: 1px solid var(--border); border-radius: 0.5rem; }
	@keyframes reveal { from { opacity: 0; transform: translateY(0.25rem); } to { opacity: 1; transform: translateY(0); } }
	@media (max-width: 75rem) and (min-width: 56.01rem), (max-width: 44rem) {
		.start-layout, .study-layout { grid-template-columns: minmax(0, 1fr); gap: 1rem; }
		.vocabulary-practice :global(.flashcard) { min-height: 15rem; }

		.method-panel { padding: 1rem 0.25rem; }
	}
	@media (max-width: 36rem) {
		.round-heading { align-items: flex-start; flex-wrap: wrap; }
		.scoreboard { justify-content: space-between; width: 100%; text-align: left; }
		.vocabulary-practice :global(.flashcard), .answer-area { padding: 1.25rem; }

		.card-topline { font-size: 0.6rem; }
		.card-face { padding-block: 1.5rem; }
		.answer-actions { align-items: stretch; flex-direction: column; }
		.review-list dl div { gap: 0.75rem; font-size: 0.8rem; }
	}
	@media (prefers-reduced-motion: reduce) { .card-face { animation: none; } }
</style>
