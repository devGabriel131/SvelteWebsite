<script lang="ts">
	import StudentShell from '#lib/components/StudentShell.svelte';
	import SpeedMathGame from '#lib/components/SpeedMathGame.svelte';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';

	const language = useLanguage();
	const messages = $derived(language.messages.speedMath);
</script>

<svelte:head>
	<title>{messages.pageTitle}</title>
	<meta name="description" content={messages.description} />
</svelte:head>

<StudentShell activePage="speed-math">
	<div class="page-heading">
		<p class="eyebrow">{messages.eyebrow}</p>
		<h1>{messages.title}</h1>
		<p class="introduction">{messages.introduction}</p>
	</div>

	<SpeedMathGame />
</StudentShell>

<style>
	.page-heading { margin-bottom: 1.75rem; }
	.eyebrow { color: var(--primary); font-size: 0.65rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }
	h1 { margin-top: 0.45rem; font-size: clamp(2rem, 3.5vw, 3rem); font-weight: 700; line-height: 1.15; letter-spacing: -0.05em; overflow-wrap: anywhere; }
	.introduction { max-width: 42rem; margin-top: 0.75rem; color: var(--muted-foreground); font-size: 0.875rem; line-height: 1.7; }
</style>
