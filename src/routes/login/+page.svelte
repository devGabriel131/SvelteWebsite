<script lang="ts">
	import { resolve } from '$app/paths';
	import SignInForm from '#lib/components/SignInForm.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
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

<section class="sign-in-panel" aria-labelledby="sign-in-title">
	<Card.Root class="gap-0 p-[clamp(1.25rem,4vw,2.5rem)] text-base">
		<p class="eyebrow">{messages.student.eyebrow}</p>
		{#if data.viewer}
			<h1 id="sign-in-title">{messages.signedInTitle}</h1>
			<p class="introduction">{messages.signedInDescription}</p>
			<Button href={resolve('/')} class="min-h-12 self-start px-4 py-3 text-base font-bold">
				{messages.openDashboard}
			</Button>
		{:else}
			<h1 id="sign-in-title">{messages.student.title}</h1>
			<p class="introduction">{messages.student.introduction}</p>
			<SignInForm audience="student" />
		{/if}
	</Card.Root>
</section>

<style>
	.sign-in-panel { width: min(100%, 30rem); margin: 1rem auto; }
	.eyebrow { margin: 0 0 0.75rem; color: var(--brand-slate); font-size: 0.75rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
	h1 { margin: 0; font-size: clamp(1.75rem, 4vw, 2.3rem); line-height: 1.2; letter-spacing: -0.04em; }
	.introduction { margin: 1rem 0 2rem; color: var(--muted-foreground); line-height: 1.7; }
</style>
