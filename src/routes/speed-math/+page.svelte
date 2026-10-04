<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';

	import {
		durations, operations, operationSymbols, startSession, submitAnswer,
		updateSessionTime, endSession, getSessionStats,
		type Duration, type Operation, type Question, type Session
	} from '#lib/speed-math/game.ts';

	const language = useLanguage();
	const messages = $derived(language.messages.speedMath);
	let duration = $state<Duration>(5);
	let operation = $state<Operation>('addition');
	let session = $state<Session | null>(null);
	let now = $state(0);
	let ready = $state(false);
	let answer = $state('');
	let invalidAnswer = $state(false);
	let feedback = $state<{ correct: boolean; question: Question } | null>(null);
	let answerInput = $state<HTMLInputElement>();
	let resultsElement = $state<HTMLElement>();
	let setupHeading = $state<HTMLHeadingElement>();

	const phase = $derived(session?.status ?? 'setup');
	const stats = $derived(session ? getSessionStats(session, now) : null);
	const locale = $derived(language.current === 'es' ? 'es-PR' : 'en-US');
	const number = $derived(new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }));
	const percent = $derived(new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }));
	const spokenQuestion = $derived(session ? formatMessage(messages.question, {
		left: session.question.left,
		right: session.question.right,
		operation: messages.spokenOperations[session.operation]
	}) : '');
	const feedbackMessage = $derived(feedback ? formatMessage(
		feedback.correct ? messages.feedbackCorrect : messages.feedbackIncorrect,
		{ ...feedback.question, operation: messages.spokenOperations[feedback.question.operation] }
	) : '');

	onMount(() => { ready = true; });

	function formatMessage(message: string, values: Record<string, string | number>): string {
		return message.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
			values[key] === undefined ? placeholder : String(values[key])
		);
	}

	function formatTime(seconds: number): string {
		const wholeSeconds = Math.max(0, Math.floor(seconds));
		return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, '0')}`;
	}

	function syncClock() {
		if (session?.status !== 'running') return;
		now = Date.now();
		session = updateSessionTime(session, now);
	}

	$effect(() => {
		if (phase !== 'running') return;
		// Reconcile against the deadline, rather than counting interval ticks in background tabs.
		const timer = window.setInterval(syncClock, 200);
		window.addEventListener('focus', syncClock);
		document.addEventListener('visibilitychange', syncClock);
		return () => {
			window.clearInterval(timer);
			window.removeEventListener('focus', syncClock);
			document.removeEventListener('visibilitychange', syncClock);
		};
	});

	$effect(() => {
		if (phase === 'running') void tick().then(() => answerInput?.focus());
		if (phase === 'finished') void tick().then(() => resultsElement?.focus());
	});

	function start() {
		now = Date.now();
		answer = '';
		invalidAnswer = false;
		feedback = null;
		session = startSession(duration, operation, now);
	}

	function checkAnswer(event: SubmitEvent) {
		event.preventDefault();
		if (!session) return;
		now = Date.now();
		const previousQuestion = session.question;
		const result = submitAnswer(session, answer, now);
		session = result.session;
		invalidAnswer = result.outcome === 'invalid';
		if (result.outcome === 'correct' || result.outcome === 'incorrect') {
			feedback = { correct: result.outcome === 'correct', question: previousQuestion };
			answer = '';
		}
		if (session.status === 'running') answerInput?.focus();
	}

	function finish() {
		if (!session) return;
		now = Date.now();
		session = endSession(session, now);
	}

	async function changeSettings() {
		session = null;
		answer = '';
		invalidAnswer = false;
		feedback = null;
		await tick();
		setupHeading?.focus();
	}
</script>

<svelte:head>
	<title>{messages.pageTitle}</title>
	<meta name="description" content={messages.description} />
</svelte:head>

<div class="speed-math-page">
	<header class="page-heading">
		<p class="eyebrow">{messages.eyebrow}</p>
		<h1>{messages.title}</h1>
		<p class="introduction">{messages.introduction}</p>
	</header>

	{#if !session}
		<form class="panel setup-panel" onsubmit={(event) => { event.preventDefault(); start(); }}>
			<div class="panel-heading">
				<h2 tabindex="-1" bind:this={setupHeading}>{messages.setupTitle}</h2>
				<p>{messages.setupHint}</p>
			</div>
			<fieldset>
				<legend><span class="step" aria-hidden="true">1</span>{messages.duration}</legend>
				<div class="duration-options">
					{#each durations as minutes (minutes)}
						<label class="choice duration-choice">
							<input type="radio" name="duration" value={minutes} bind:group={duration} />
							<span>{formatMessage(messages.minutes, { minutes })}</span>
						</label>
					{/each}
				</div>
			</fieldset>
			<fieldset aria-describedby="operation-hint">
				<legend><span class="step" aria-hidden="true">2</span>{messages.operation}</legend>
				<div class="operation-options">
					{#each operations as choice (choice)}
						<label class="choice operation-choice">
							<input type="radio" name="operation" value={choice} bind:group={operation} />
							<span>
								<span class="operation-symbol" aria-hidden="true">{operationSymbols[choice]}</span>
								{messages.operations[choice]}
							</span>
						</label>
					{/each}
				</div>
				<p class="hint" id="operation-hint">{messages.operationHints[operation]}</p>
			</fieldset>
			<div class="rules">
				<h3>{messages.rulesTitle}</h3>
				<p>{messages.rules}</p>
			</div>
			<button class="primary-button start-button" type="submit" disabled={!ready}>
				{messages.start}
				<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
			</button>
			<p class="session-note">{messages.timerNote}</p>
			<noscript><p class="error" role="alert">{messages.javascriptRequired}</p></noscript>
		</form>
	{:else if session.status === 'running' && stats}
		<section class="panel challenge-panel" aria-label={formatMessage(messages.challengeLabel, {
			operation: messages.operations[session.operation], minutes: session.duration
		})}>
			<div class="challenge-topline">
				<p class="challenge-label">{formatMessage(messages.challengeLabel, {
					operation: messages.operations[session.operation], minutes: session.duration
				})}</p>
				<button class="text-button" type="button" onclick={finish}>{messages.end}</button>
			</div>
			<dl class="live-stats">
				<div class="timer" class:low-time={stats.remainingSeconds <= 30}>
					<dt>{messages.timeRemaining}</dt>
					<dd role="timer" aria-live="off">{formatTime(stats.remainingSeconds)}</dd>
				</div>
				<div><dt>{messages.correct}</dt><dd class="correct-count">{number.format(session.correct)}</dd></div>
				<div><dt>{messages.incorrect}</dt><dd>{number.format(session.incorrect)}</dd></div>
				<div><dt>{messages.accuracy}</dt><dd>{percent.format(stats.accuracy / 100)}</dd></div>
			</dl>
			<progress aria-label={messages.timeRemaining} max={session.duration * 60} value={stats.remainingSeconds}></progress>
			<p class="visually-hidden" role="status">{stats.remainingSeconds <= 30 ? messages.lowTime : ''}</p>
			<div class="question-area">
				<p class="eyebrow">{formatMessage(messages.questionNumber, { number: stats.total + 1 })}</p>
				<h2 class="equation" id="question" aria-label={spokenQuestion}>
					<span aria-hidden="true">{session.question.left} <span class="equation-symbol">{operationSymbols[session.operation]}</span> {session.question.right} <span class="equation-symbol">=</span> ?</span>
				</h2>
				<form class="answer-form" onsubmit={checkAnswer} novalidate>
					<label for="math-answer">{messages.answer}</label>
					<div class="answer-controls">
						<input id="math-answer" name="answer" type="text" inputmode="numeric" enterkeyhint="send"
							bind:value={answer} bind:this={answerInput} autocomplete="off" spellcheck="false"
							placeholder={messages.answerPlaceholder} aria-invalid={invalidAnswer}
							aria-describedby={`question answer-hint${invalidAnswer ? ' answer-error' : ''}`}
							oninput={() => { invalidAnswer = false; }} />
						<button class="primary-button" type="submit">{messages.submit}</button>
					</div>
					<p class="hint" id="answer-hint">{messages.answerHint}</p>
					{#if invalidAnswer}<p class="error" id="answer-error" role="alert">{messages.invalidAnswer}</p>{/if}
				</form>
				<div class="feedback" class:correct-feedback={feedback?.correct} class:incorrect-feedback={feedback && !feedback.correct}
					role="status" aria-atomic="true">
					{#if feedback}
						<p>{feedbackMessage}</p>
						<span class="visually-hidden">{spokenQuestion}</span>
					{/if}
				</div>
			</div>
		</section>
	{:else if stats}
		<section class="panel results-panel" aria-labelledby="results-title" tabindex="-1" bind:this={resultsElement}>
			<p class="eyebrow">{session.endedAt === session.endsAt ? messages.timeUp : messages.ended}</p>
			<h2 id="results-title">{messages.resultsTitle}</h2>
			<p class="challenge-label">{formatMessage(messages.challengeLabel, {
				operation: messages.operations[session.operation], minutes: session.duration
			})}</p>
			<div class="score">
				<span class="score-number">{number.format(session.correct)}</span>
				<span>{messages.correctAnswers}</span>
			</div>
			<p class="results-message">{stats.total === 0 ? messages.noAnswers : formatMessage(messages.resultsMessage, {
				correct: session.correct, total: stats.total
			})}</p>
			<dl class="result-stats">
				<div><dt>{messages.totalAnswered}</dt><dd>{number.format(stats.total)}</dd></div>
				<div><dt>{messages.incorrect}</dt><dd>{number.format(session.incorrect)}</dd></div>
				<div><dt>{messages.accuracy}</dt><dd>{percent.format(stats.accuracy / 100)}</dd></div>
				<div><dt>{messages.correctPerMinute}</dt><dd>{number.format(stats.correctPerMinute)}</dd></div>
				<div><dt>{messages.elapsed}</dt><dd>{formatTime(stats.elapsedSeconds)}</dd></div>
			</dl>
			<div class="result-actions">
				<button class="primary-button" type="button" onclick={start}>{messages.playAgain}</button>
				<button class="secondary-button" type="button" onclick={changeSettings}>{messages.changeSettings}</button>
			</div>
		</section>
	{/if}
</div>

<style>
	.speed-math-page { max-width: 58rem; margin-inline: auto; }
	.page-heading { margin-bottom: 1.75rem; }
	.eyebrow { margin: 0 0 0.6rem; color: var(--color-accent); font-size: 0.75rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
	h1 { margin: 0; font-family: var(--font-display); font-size: clamp(1.4rem, 3vw, 2.1rem); line-height: 1.3; text-transform: uppercase; overflow-wrap: anywhere; }
	.introduction { max-width: 42rem; margin: 0.9rem 0 0; color: var(--color-muted); font-size: 0.9375rem; }
	.panel { padding: clamp(1.25rem, 3vw, 2rem); border: 1px solid var(--color-border); border-radius: 1rem; background: var(--color-surface); }
	h2 { margin: 0; font-size: 1.25rem; }
	.panel-heading p { margin: 0.4rem 0 0; color: var(--color-muted); font-size: 0.875rem; }
	fieldset { min-width: 0; margin: 1.75rem 0 0; padding: 0; border: 0; }
	legend { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.85rem; padding: 0; font-size: 0.875rem; font-weight: 700; }
	.step { display: grid; place-items: center; width: 1.5rem; height: 1.5rem; border-radius: 50%; background: var(--color-accent-soft); color: var(--color-accent); font-size: 0.75rem; }
	.duration-options { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.75rem; }
	.operation-options { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.75rem; }
	.choice { position: relative; min-width: 0; cursor: pointer; }
	.choice input { position: absolute; width: 1px; height: 1px; margin: 0; opacity: 0; }
	.choice > span { display: flex; align-items: center; justify-content: center; gap: 0.4rem; min-height: 3.5rem; padding: 0.75rem; border: 1px solid var(--color-border); border-radius: 0.65rem; color: var(--color-muted); font-size: 0.875rem; font-weight: 700; text-align: center; }
	.choice input:checked + span { border-color: var(--color-accent); background: var(--color-accent-soft); color: var(--color-accent); }
	.choice input:focus-visible + span { outline: 2px solid var(--color-accent); outline-offset: 4px; }
	.choice:hover > span { border-color: var(--color-accent-secondary); }
	.operation-choice > span { flex-direction: column; min-height: 6rem; }
	.operation-symbol { font-size: 1.75rem; line-height: 1; }
	.hint { margin: 0.65rem 0 0; color: var(--color-muted); font-size: 0.8125rem; }
	.rules { margin: 1.5rem 0; padding: 1rem; border-radius: 0.65rem; background: var(--color-background); }
	h3 { margin: 0; font-size: 0.875rem; }
	.rules p { margin: 0.35rem 0 0; color: var(--color-muted); font-size: 0.8125rem; line-height: 1.7; }
	.primary-button, .secondary-button { display: inline-flex; align-items: center; justify-content: center; gap: 0.6rem; min-height: 2.9rem; padding: 0.75rem 1.25rem; border: 1px solid var(--color-accent); border-radius: 0.5rem; font-size: 0.875rem; font-weight: 700; cursor: pointer; }
	.primary-button { background: var(--color-accent); color: var(--color-background); }
	.primary-button:hover { filter: brightness(1.08); }
	.primary-button:disabled { cursor: not-allowed; opacity: 0.5; }
	.secondary-button { background: var(--color-accent-soft); color: var(--color-accent); }
	.secondary-button:hover { background: var(--color-background); }
	.start-button { width: 100%; }
	svg { width: 1.1rem; height: 1.1rem; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
	.session-note { margin: 0.85rem 0 0; color: var(--color-muted); font-size: 0.75rem; }
	.challenge-topline { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
	.challenge-label { margin: 0; color: var(--color-muted); font-size: 0.8125rem; }
	.text-button { padding: 0.3rem 0; border: 0; background: none; color: var(--color-muted); font-size: 0.8125rem; text-decoration: underline; text-underline-offset: 0.2rem; cursor: pointer; }
	.text-button:hover { color: var(--color-text); }
	.live-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1rem; margin: 1.5rem 0; }
	dt { color: var(--color-muted); font-size: 0.75rem; }
	dd { margin: 0.25rem 0 0; font-size: clamp(1.25rem, 3vw, 1.8rem); font-weight: 700; font-variant-numeric: tabular-nums; }
	.timer dd, .correct-count { color: var(--color-accent); }
	.low-time dd { color: #f0c489; }
	progress { display: block; width: 100%; height: 0.35rem; overflow: hidden; border: 0; border-radius: 1rem; appearance: none; background: var(--color-background); color: var(--color-accent); }
	progress::-webkit-progress-bar { background: var(--color-background); }
	progress::-webkit-progress-value { background: var(--color-accent); }
	progress::-moz-progress-bar { background: var(--color-accent); }
	.question-area { padding-top: 2.5rem; text-align: center; }
	.equation { font-size: clamp(2rem, 7vw, 4.5rem); font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.4; }
	.equation-symbol { color: var(--color-accent-secondary); }
	.answer-form { max-width: 28rem; margin: 1.5rem auto 0; }
	.answer-form label { display: block; margin-bottom: 0.5rem; font-size: 0.8125rem; text-align: left; }
	.answer-controls { display: flex; gap: 0.65rem; }
	.answer-controls input { min-width: 0; width: 100%; padding: 0.75rem 1rem; border: 1px solid var(--color-border); border-radius: 0.5rem; background: var(--color-background); color: var(--color-text); font-size: 1.25rem; font-variant-numeric: tabular-nums; }
	.answer-controls input::placeholder { color: var(--color-muted); font-size: 0.9375rem; }
	.answer-controls input[aria-invalid='true'] { border-color: #f0a6a6; }
	.feedback { min-height: 4.5rem; padding-top: 1.25rem; font-size: 0.875rem; }
	.feedback p { margin: 0; }
	.correct-feedback { color: var(--color-accent); }
	.incorrect-feedback, .error { color: #f0a6a6; }
	.error { margin: 0.65rem 0 0; font-size: 0.8125rem; }
	.results-panel { text-align: center; }
	.results-panel .challenge-label { margin-top: 0.5rem; }
	.score { display: flex; flex-direction: column; margin-top: 1.5rem; color: var(--color-accent); font-size: 0.875rem; }
	.score-number { font-size: clamp(4rem, 10vw, 6rem); font-weight: 700; line-height: 1.15; font-variant-numeric: tabular-nums; }
	.results-message { margin: 1rem 0 0; color: var(--color-muted); font-size: 0.9375rem; }
	.result-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1.5rem 1rem; margin: 2rem 0; padding: 1.5rem 0; border-top: 1px solid var(--color-border); border-bottom: 1px solid var(--color-border); }
	.result-actions { display: flex; justify-content: center; flex-wrap: wrap; gap: 0.75rem; }
	.visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
	@media (max-width: 50rem) { .operation-options { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
	@media (max-width: 30rem) {
		.duration-options { gap: 0.5rem; }
		.duration-choice > span { padding: 0.65rem 0.3rem; font-size: 0.8125rem; }
		.live-stats, .result-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
		.answer-controls { flex-direction: column; }
		.result-actions > button { width: 100%; }
		.question-area { padding-top: 1.75rem; }
	}
</style>
