
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { ArrowRight, Check, CircleCheck, Keyboard, RotateCcw, Timer, Zap } from '@lucide/svelte';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import { formatMessage } from '#lib/i18n/translations.ts';
	import { Button, buttonVariants } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Progress } from '#lib/components/ui/progress/index.js';
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
	let answerInput = $state<HTMLElement | null>(null);
	let resultsElement = $state<HTMLElement>();
	let setupHeading = $state<HTMLHeadingElement>();

	const phase = $derived(session?.status ?? 'setup');
	const stats = $derived(session ? getSessionStats(session, now) : null);
	const locale = $derived(language.current === 'es' ? 'es-PR' : 'en-US');
	const number = $derived(new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }));
	const percent = $derived(new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }));
	const challengeLabel = $derived(session ? formatMessage(messages.challengeLabel, {
		operation: messages.operations[session.operation], minutes: session.duration
	}) : '');
	const spokenQuestion = $derived(session ? formatMessage(messages.question, {
		left: session.question.left, right: session.question.right,
		operation: messages.spokenOperations[session.operation]
	}) : '');
	const feedbackMessage = $derived(feedback ? formatMessage(
		feedback.correct ? messages.feedbackCorrect : messages.feedbackIncorrect,
		{ ...feedback.question, operation: messages.spokenOperations[feedback.question.operation] }
	) : '');

	onMount(() => { ready = true; });

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
		// Reconcile against the deadline, rather than counting ticks in background tabs.
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

<div class="math-game">
	{#if !session}
		<form class="setup-layout" onsubmit={(event) => { event.preventDefault(); start(); }}>
			<Card.Root class="settings-panel panel">
				<div class="panel-heading">
					<span class="panel-icon" aria-hidden="true"><Zap size={19} /></span>
					<div><h2 tabindex="-1" bind:this={setupHeading}>{messages.setupTitle}</h2><p>{messages.setupHint}</p></div>
				</div>
				<fieldset class="operation-field" aria-describedby="operation-hint">
					<legend><span class="step" aria-hidden="true">01</span>{messages.operation}</legend>
					<div class="operation-options">
						{#each operations as choice (choice)}
							<Label class={buttonVariants({ variant: 'outline', class: 'operation-choice relative min-w-0 cursor-pointer' })}>
								<input class="sr-only" type="radio" name="operation" value={choice} bind:group={operation} />
								<span class="operation-symbol" aria-hidden="true">{operationSymbols[choice]}</span>
								<span class="choice-name">{messages.operations[choice]}</span>
								<span class="choice-check" aria-hidden="true">{#if operation === choice}<Check size={14} />{/if}</span>
							</Label>
						{/each}
					</div>
					<p class="hint" id="operation-hint">{messages.operationHints[operation]}</p>
				</fieldset>
				<fieldset class="duration-field">
					<legend><span class="step" aria-hidden="true">02</span>{messages.duration}</legend>
					<div class="duration-options">
						{#each durations as minutes (minutes)}
							<Label class={buttonVariants({ variant: 'outline', class: 'duration-choice relative min-w-0 cursor-pointer' })}>
								<input class="sr-only" type="radio" name="duration" value={minutes} bind:group={duration} />
								<span class="duration-number" aria-hidden="true">{number.format(minutes)}</span>
								<span aria-hidden="true">{messages.minuteUnit}</span>
								<span class="sr-only">{formatMessage(messages.minutes, { minutes })}</span>
							</Label>
						{/each}
					</div>
				</fieldset>
				<div class="setup-actions">
					<Button class="start-button min-h-12 w-full justify-between gap-3 px-5 font-bold" type="submit" disabled={!ready}>
						{messages.start}<ArrowRight aria-hidden="true" />
					</Button>
					<p class="keyboard-note"><Keyboard size={15} aria-hidden="true" />{messages.keyboardHint}</p>
					<noscript><p class="error" role="alert">{messages.javascriptRequired}</p></noscript>
				</div>
			</Card.Root>

			<aside class="briefing-panel" aria-labelledby="briefing-title">
				<p class="eyebrow"><span class="status-dot" aria-hidden="true"></span>{messages.ready}</p>
				<div class="session-visual">

					<div class="session-duration"><span>{formatTime(duration * 60)}</span><span>{messages.operations[operation]}</span></div>
				</div>
				<h2 id="briefing-title">{messages.briefingTitle}</h2>
				<p class="timer-hint">{messages.timerHint}</p>
				<details class="rules" open><summary>{messages.rulesTitle}</summary><p>{messages.rules}</p></details>
				<p class="accuracy-note"><CircleCheck size={16} aria-hidden="true" />{messages.accuracyFirst}</p>
			</aside>
		</form>
	{:else if session.status === 'running' && stats}
		<section class="challenge-layout" aria-label={challengeLabel}>
			<div class="challenge-topline">
				<div><p class="eyebrow"><span class="status-dot" aria-hidden="true"></span>{messages.live}</p><p class="challenge-label">{challengeLabel}</p></div>
				<Button variant="outline" class="px-4" type="button" onclick={finish}>{messages.end}</Button>
			</div>
			<Card.Root class="stats-panel panel">
				<p class="eyebrow stats-heading">{messages.sessionTitle}</p>
				<div class="timer" class:low-time={stats.remainingSeconds <= 30}>

					<div class="timer-value"><span class="stat-label"><Timer size={14} aria-hidden="true" />{messages.timeRemaining}</span><strong role="timer" aria-live="off" aria-label={messages.timeRemaining}>{formatTime(stats.remainingSeconds)}</strong></div>
				</div>
				<div class="time-progress"><Progress class="h-1" aria-label={messages.timeRemaining} max={session.duration * 60} value={stats.remainingSeconds} /></div>
				<p class="sr-only" role="status">{stats.remainingSeconds <= 30 ? messages.lowTime : ''}</p>
				<dl class="live-stats">
					<div><dt>{messages.correct}</dt><dd class="correct-count">{number.format(session.correct)}</dd></div>
					<div><dt>{messages.incorrect}</dt><dd>{number.format(session.incorrect)}</dd></div>
					<div><dt>{messages.accuracy}</dt><dd>{percent.format(stats.accuracy / 100)}</dd></div>
				</dl>
			</Card.Root>
			<Card.Root class="question-panel panel">
				<p class="eyebrow question-number">{formatMessage(messages.questionNumber, { number: stats.total + 1 })}</p>
				<h2 class="equation" id="question" aria-label={spokenQuestion}>
					<span aria-hidden="true">{session.question.left} <span class="equation-symbol">{operationSymbols[session.operation]}</span> {session.question.right} <span class="equation-symbol">=</span> <span class="unknown">?</span></span>
				</h2>
				<form class="answer-form" onsubmit={checkAnswer} novalidate>
					<Label class="mb-2 block text-left text-sm" for="math-answer">{messages.answer}</Label>
					<div class="answer-controls">
						<Input class="h-14 min-w-0 bg-background px-4 text-xl tabular-nums placeholder:text-sm md:text-xl"
							id="math-answer" name="answer" type="text" inputmode="numeric" enterkeyhint="send"
							bind:value={answer} bind:ref={answerInput} autocomplete="off" spellcheck="false"
							placeholder={messages.answerPlaceholder} aria-invalid={invalidAnswer}
							aria-describedby={`question answer-hint${invalidAnswer ? ' answer-error' : ''}`}
							oninput={() => { invalidAnswer = false; }} />
						<Button class="min-h-14 gap-3 px-5 font-bold" type="submit">{messages.submit}<ArrowRight aria-hidden="true" /></Button>
					</div>
					<p class="hint" id="answer-hint">{messages.answerHint}</p>
					{#if invalidAnswer}<p class="error" id="answer-error" role="alert">{messages.invalidAnswer}</p>{/if}
				</form>
				<div class="feedback" class:correct-feedback={feedback?.correct} class:incorrect-feedback={feedback && !feedback.correct} role="status" aria-atomic="true">
					{#if feedback}<p>{feedbackMessage}</p><span class="sr-only">{spokenQuestion}</span>{/if}
				</div>
			</Card.Root>
		</section>
	{:else if stats}
		<section class="results-panel" aria-labelledby="results-title" tabindex="-1" bind:this={resultsElement}>
			<Card.Root class="results-card panel">
				<div class="results-heading"><span class="result-icon"><CircleCheck size={24} aria-hidden="true" /></span><p class="eyebrow">{session.endedAt === session.endsAt ? messages.timeUp : messages.ended}</p><h2 id="results-title">{messages.resultsTitle}</h2><p class="hint">{challengeLabel}</p></div>
				<div class="result-summary">
					<div class="score"><strong>{number.format(session.correct)}</strong><span>{messages.correctAnswers}</span></div>
					<div><p class="results-message">{stats.total === 0 ? messages.noAnswers : formatMessage(messages.resultsMessage, { correct: session.correct, total: stats.total })}</p><p class="hint">{messages.resultsHint}</p></div>
				</div>
				<dl class="result-stats">
					<div><dt>{messages.totalAnswered}</dt><dd>{number.format(stats.total)}</dd></div>
					<div><dt>{messages.incorrect}</dt><dd>{number.format(session.incorrect)}</dd></div>
					<div><dt>{messages.accuracy}</dt><dd>{percent.format(stats.accuracy / 100)}</dd></div>
					<div><dt>{messages.correctPerMinute}</dt><dd>{number.format(stats.correctPerMinute)}</dd></div>
					<div><dt>{messages.elapsed}</dt><dd>{formatTime(stats.elapsedSeconds)}</dd></div>
				</dl>
				<div class="result-actions"><Button class="gap-3 px-5" type="button" onclick={start}><RotateCcw aria-hidden="true" />{messages.playAgain}</Button><Button variant="outline" class="px-5" type="button" onclick={changeSettings}>{messages.changeSettings}</Button></div>
			</Card.Root>
		</section>
	{/if}
	<p class="session-note">{messages.timerNote}</p>
</div>

<style>
	.math-game { min-width: 0; }
	.math-game :global(.panel) { min-width: 0; gap: 0; border-radius: 1rem; padding: clamp(1.25rem, 2.5vw, 2rem); box-shadow: none; }
	.setup-layout { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(15rem, 1fr); gap: 1.25rem; }
	.panel-heading { display: flex; gap: 0.85rem; align-items: flex-start; }
	.panel-icon, .result-icon { display: grid; flex-shrink: 0; place-items: center; width: 2.6rem; height: 2.6rem; border: 1px solid var(--border); border-radius: 0.75rem; background: var(--accent); color: var(--primary); }
	h2 { font-size: 1.2rem; font-weight: 700; letter-spacing: -0.025em; }
	.panel-heading p { margin-top: 0.3rem; color: var(--muted-foreground); font-size: 0.8rem; line-height: 1.6; }
	fieldset { min-width: 0; margin-top: 1.75rem; padding: 0; border: 0; }
	legend { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.8rem; font-size: 0.8rem; font-weight: 700; }
	.step { color: var(--secondary); font-family: var(--font-mono); font-size: 0.65rem; }
	.operation-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.65rem; }
	.operation-options :global(.operation-choice) { justify-content: flex-start; min-height: 4rem; gap: 0.75rem; padding: 0.8rem; text-align: left; }
	.operation-symbol { display: grid; place-items: center; flex-shrink: 0; width: 1.5rem; color: var(--secondary); font-size: 1.6rem; line-height: 1; }
	.choice-name { font-size: 0.8rem; overflow-wrap: anywhere; }
	.choice-check { display: grid; place-items: center; flex-shrink: 0; width: 0.875rem; margin-left: auto; }
	.hint { margin-top: 0.6rem; color: var(--muted-foreground); font-size: 0.75rem; line-height: 1.65; }
	.duration-options { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.65rem; }
	.duration-options :global(.duration-choice) { min-height: 3.5rem; gap: 0.4rem; padding: 0.7rem; font-size: 0.75rem; }
	.duration-number { font-size: 1.2rem; font-weight: 700; }
	.setup-actions { margin-top: 1.75rem; }
	.keyboard-note { display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-top: 0.8rem; color: var(--muted-foreground); font-size: 0.7rem; }
	.briefing-panel { display: flex; flex-direction: column; min-width: 0; padding: clamp(1.25rem, 2.5vw, 2rem); border: 1px solid var(--border); border-radius: 1rem; background: color-mix(in srgb, var(--brand-slate) 5%, var(--background)); }
	.eyebrow { display: flex; align-items: center; gap: 0.5rem; font-size: 0.65rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--primary); }
	.status-dot { width: 0.4rem; height: 0.4rem; flex-shrink: 0; border-radius: 50%; background: var(--primary); }
	.session-visual { position: relative; display: grid; place-items: center; width: 100%; min-height: 9rem; margin-block: 1rem; }

	.session-duration { display: grid; gap: 0.3rem; text-align: center; }
	.session-duration > span:first-child { font-size: clamp(3rem, 4.5vw, 4.5rem); font-weight: 700; line-height: 1.1; letter-spacing: -0.07em; font-variant-numeric: tabular-nums; }
	.session-duration > span:last-child { color: var(--secondary); font-size: 0.8rem; }
	.briefing-panel h2 { max-width: 16ch; font-size: clamp(1.4rem, 2.2vw, 1.85rem); line-height: 1.25; letter-spacing: -0.04em; }
	.timer-hint { margin-top: 0.6rem; color: var(--muted-foreground); font-size: 0.8rem; }
	.rules { margin-top: 1.5rem; padding-top: 1.25rem; border-top: 1px solid var(--border); }
	.rules summary { min-height: 2.75rem; align-content: center; cursor: pointer; font-size: 0.8rem; font-weight: 700; }
	.rules summary::marker { color: var(--secondary); }
	.rules p { margin-top: 0.5rem; color: var(--muted-foreground); font-size: 0.75rem; line-height: 1.8; }
	.accuracy-note { display: flex; align-items: center; gap: 0.5rem; margin-top: auto; padding-top: 1.5rem; font-size: 0.7rem; color: var(--primary); }
	.accuracy-note :global(svg) { flex-shrink: 0; }
	.session-note { max-width: 50rem; margin: 1.25rem auto 0; color: var(--muted-foreground); font-size: 0.7rem; line-height: 1.7; text-align: center; }
	.challenge-layout { display: grid; grid-template-columns: 14rem minmax(0, 1fr); gap: 1rem; grid-template-areas: 'heading heading' 'stats question'; }
	.challenge-layout :global(.panel), .results-panel :global(.panel) { border-radius: 0.4rem; }
	.challenge-topline { grid-area: heading; display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
	.challenge-label { margin-top: 0.4rem; color: var(--muted-foreground); font-size: 0.8rem; }
	.math-game :global(.stats-panel) { grid-area: stats; }
	.stats-heading { color: var(--muted-foreground); }
	.timer { position: relative; margin-block: 1.5rem 1.25rem; }
	.timer-value { display: flex; flex-direction: column; gap: 0.25rem; }
	.stat-label { display: flex; align-items: center; gap: 0.5rem; color: var(--muted-foreground); font-size: 0.75rem; }
	.timer strong { font-size: 2.6rem; line-height: 1.2; font-variant-numeric: tabular-nums; letter-spacing: -0.045em; }
	.low-time strong { color: var(--warning); }
	.live-stats { display: grid; gap: 1rem; margin-top: 1.5rem; }
	.live-stats > div { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 0.25rem 0.5rem; border-top: 1px solid var(--border); padding-top: 0.9rem; }
	dt { color: var(--muted-foreground); font-size: 0.75rem; }
	dd { font-size: 1.4rem; font-weight: 700; font-variant-numeric: tabular-nums; }
	.correct-count { color: var(--primary); }
	.math-game :global(.question-panel) { grid-area: question; display: flex; justify-content: center; min-height: 26rem; text-align: center; background-image: linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px); background-size: 2rem 2rem; background-color: var(--background); }
	.question-number { justify-content: center; align-self: center; padding: 0.4rem 0.75rem; color: var(--muted-foreground); background: var(--card); border: 1px solid var(--border); border-radius: 0.25rem; }
	.equation { margin-block: 1.5rem; font-family: var(--font-mono); font-size: clamp(2rem, 4.5vw, 4.5rem); font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -0.04em; line-height: 1.4; }
	.timer strong, dd, .score strong { font-family: var(--font-mono); }
	.equation-symbol { color: var(--secondary); }
	.unknown { color: var(--primary); }
	.answer-form { width: 100%; max-width: 28rem; margin-inline: auto; padding: 1rem; background: var(--card); border: 1px solid var(--border); border-radius: 0.4rem; }
	.answer-controls { display: flex; gap: 0.65rem; }
	.feedback { min-height: 3.5rem; padding-top: 1.2rem; font-size: 0.8rem; }
	.feedback p { display: inline; padding: 0.25rem; background: var(--background); box-decoration-break: clone; }
	.correct-feedback { color: var(--primary); }
	.incorrect-feedback, .error { color: var(--destructive); }
	.error { margin-top: 0.65rem; font-size: 0.8rem; }
	.results-panel { max-width: 60rem; margin-inline: auto; border-radius: 1rem; }
	.results-heading { position: relative; padding-right: 3.5rem; }
	.result-icon { position: absolute; right: 0; top: 0; }
	.results-heading h2 { margin-top: 0.5rem; font-size: 1.75rem; }
	.result-summary { display: flex; align-items: center; gap: 2rem; margin-block: 2rem; }
	.score { display: flex; flex-direction: column; flex-shrink: 0; color: var(--primary); font-size: 0.75rem; }
	.score strong { font-size: 4.5rem; line-height: 1.1; font-variant-numeric: tabular-nums; letter-spacing: -0.06em; }
	.results-message { font-size: 1rem; }
	.result-stats { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 1rem; padding-block: 1.5rem; border-block: 1px solid var(--border); }
	.result-stats dd { margin-top: 0.4rem; }
	.result-actions { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 1.5rem; }


	@media (max-width: 75rem) and (min-width: 56.01rem), (max-width: 44rem) {
		.setup-layout { grid-template-columns: minmax(0, 1fr); }
		.briefing-panel { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 0.6rem 1.5rem; }
		.briefing-panel > .eyebrow { grid-column: 1 / -1; }
		.session-visual { grid-row: 2 / 5; margin: 0; }
		.rules { grid-column: 1 / -1; margin-top: 0.5rem; }
		.accuracy-note { grid-column: 1 / -1; padding-top: 0.5rem; }
		.challenge-layout { grid-template-columns: minmax(0, 1fr); grid-template-areas: 'heading' 'stats' 'question'; }
		.math-game :global(.stats-panel) { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); align-items: center; gap: 1rem; }
		.stats-heading { display: none; }
		.timer { margin: 0; }
		.timer strong { font-size: 2rem; }
		.time-progress { grid-column: 1 / -1; grid-row: 2; }
		.live-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.5rem; margin: 0; }
		.live-stats > div { display: block; padding: 0; border: 0; text-align: center; }
		.live-stats dd { margin-top: 0.4rem; }

	}
	@media (max-width: 40rem) {
		.result-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
		.result-summary { flex-direction: column; align-items: flex-start; gap: 1rem; }

	}
	@media (max-width: 30rem) {
		.operation-options { grid-template-columns: minmax(0, 1fr); }
		.duration-options { gap: 0.4rem; }
		.duration-options :global(.duration-choice) { padding: 0.5rem; }
		.briefing-panel { display: flex; }
		.session-visual { margin-block: 0.75rem; }
		.math-game :global(.stats-panel) { grid-template-columns: minmax(0, 1fr); }
		.timer { text-align: center; }
		.stat-label { justify-content: center; }
		.live-stats { grid-row: 3; }
		.challenge-topline { flex-wrap: wrap; }
		.answer-controls { flex-direction: column; }
		.equation { font-size: 1.9rem; }
		.answer-form { padding: 0.75rem; }
		.result-actions :global(button) { width: 100%; }
	}
</style>
