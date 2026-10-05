<script lang="ts">
	import { resolve } from '$app/paths';
	import SignInForm from '#lib/components/SignInForm.svelte';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const language = useLanguage();
	const messages = $derived(language.messages.auth);
</script>

<svelte:head>
	<title>{messages.student.pageTitle}</title>
	<meta name="description" content={messages.student.description} />
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<section class="sign-in-panel" aria-labelledby="sign-in-title" lang={language.current}>
	<p class="eyebrow">{messages.student.eyebrow}</p>
	{#if data.viewer}
		<h1 id="sign-in-title">{messages.signedInTitle}</h1>
		<p class="introduction">{messages.signedInDescription}</p>
		<a class="dashboard-link" href={resolve('/')}>{messages.openDashboard}</a>
	{:else}
		<h1 id="sign-in-title">{messages.student.title}</h1>
		<p class="introduction">{messages.student.introduction}</p>
		<SignInForm audience="student" />
	{/if}
</section>

<style>
	.sign-in-panel { width: min(100%, 30rem); margin: 1rem auto; padding: clamp(1.25rem, 4vw, 2.5rem); border: 1px solid var(--color-border); border-radius: 0.75rem; background: var(--color-surface); }
	.eyebrow { margin: 0 0 0.75rem; color: var(--color-accent-secondary); font-size: 0.75rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
	h1 { margin: 0; font-size: clamp(1.75rem, 4vw, 2.3rem); line-height: 1.2; letter-spacing: -0.04em; }
	.introduction { margin: 1rem 0 2rem; color: var(--color-muted); line-height: 1.7; }
	.dashboard-link { display: inline-flex; align-items: center; justify-content: center; min-height: 3rem; padding: 0.75rem 1rem; border: 1px solid var(--color-accent); border-radius: 0.5rem; background: var(--color-accent); color: var(--color-background); font-weight: 700; text-decoration: none; }
	.dashboard-link:hover { background: var(--brand-cream); }
</style>
