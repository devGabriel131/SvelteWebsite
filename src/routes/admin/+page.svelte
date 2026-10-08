<script lang="ts">
	import { asset, resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { tick } from 'svelte';
	import AdminIcon from '#lib/admin/AdminIcon.svelte';
	import AdminOverview from '#lib/admin/AdminOverview.svelte';
	import AdminStudents from '#lib/admin/AdminStudents.svelte';
	import AdminOperations from '#lib/admin/AdminOperations.svelte';

	import { resolveAdminSection } from '#lib/admin/navigation.ts';
	import LanguageSelector from '#lib/components/LanguageSelector.svelte';
	import SignInForm from '#lib/components/SignInForm.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import type { PageProps } from './$types';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import { type AdminSection } from '#lib/admin/demo.ts';
	import '#lib/admin/admin.css';

	let { data }: PageProps = $props();
	const language = useLanguage();
	const messages = $derived(language.messages.admin);
	const section = $derived(resolveAdminSection(page.url.searchParams.get('section')));
	const students = $derived(data.students);
	let title = $state<HTMLHeadingElement>();
	const intro = $derived(messages.intro[section]);

	async function navigate(next: AdminSection) {
		await goto(next === 'overview' ? resolve('/admin') : resolve('/admin') + '?section=' + next, { reset: false });
		await tick();
		title?.focus();
	}
</script>

<svelte:head>
	<title>{data.isAdmin ? section === 'invitations' ? messages.studentImport.pageTitle : messages.pageTitle : language.messages.auth.admin.pageTitle}</title>
	<meta name="description" content={data.isAdmin ? section === 'invitations' ? messages.studentImport.description : messages.description : language.messages.auth.admin.description} />
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

{#if !data.isAdmin}
	<div class="admin-console admin-sign-in" lang={language.current}>
		<header class="sign-in-header">
			<a class="console-brand" href={resolve('/')} aria-label={language.messages.auth.studentWorkspace}>
				<img src={asset('logo.png')} alt="" width="42" height="42" />
				<span><strong>{language.messages.header.brand}</strong><small>{language.messages.header.brandDescription}</small></span>
			</a>
			<LanguageSelector />
		</header>
		<section class="sign-in-panel" aria-labelledby="sign-in-title">
			<Card.Root class="gap-0 p-[clamp(1.25rem,4vw,2.5rem)] text-base">
				<p class="eyebrow">{language.messages.auth.admin.eyebrow}</p>
				<h1 id="sign-in-title">{language.messages.auth.admin.title}</h1>
				<p class="sign-in-introduction">{language.messages.auth.admin.introduction}</p>
				<SignInForm audience="admin" localAdmin={data.localAdmin} />
			</Card.Root>
		</section>
	</div>
{:else}
	<div class="admin-overview">
		<Alert.Root role="note" class={`preview-banner text-muted-foreground ${section === 'invitations' ? 'border-primary/30 bg-primary/10' : 'border-warning/30 bg-warning/10'}`}>
			<span class="preview-light" class:connected={section === 'invitations'} aria-hidden="true"></span>
			<strong class={`mono shrink-0 text-[0.59rem] font-medium uppercase tracking-[0.05em] ${section === 'invitations' ? 'text-primary' : 'text-warning'}`}>{section === 'invitations' ? messages.roster.connected : messages.prototype}</strong>
			{#if section !== 'invitations'}<span class="preview-copy">{messages.roster.workspaceNote}</span>{/if}
		</Alert.Root>

		<section class="page-intro" aria-labelledby="console-title">
			<div class="intro-copy"><p class="eyebrow">{intro.eyebrow}</p><h1 id="console-title" tabindex="-1" bind:this={title}>{intro.title}<span aria-hidden="true">.</span></h1><p class="intro-description">{intro.description}</p></div>
			<div class="intro-instrument" aria-hidden="true"><svg viewBox="0 0 160 120" fill="none"><circle cx="80" cy="60" r="44" /><circle cx="80" cy="60" r="28" /><path class="instrument-guides" d="M80 0v120M0 60h160M7 16h20M17 6v20M133 104h20M143 94v20" /><path class="jet" d="M80 17l5 31 34 25v8L85 69l-1 24 10 9v4l-14-5-14 5v-4l10-9-1-24-34 12v-8l34-25z" /></svg></div>
		</section>

		{#if section === 'overview'}
			<div class="quick-controls" role="group" aria-label={messages.overview.quickActions}><span class="quick-label mono">{messages.overview.quickActions}<span aria-hidden="true">/</span></span><Button variant="ghost" type="button" onclick={() => navigate('payments')}><AdminIcon name="payments" size={16} />{messages.overview.createPayment}<AdminIcon name="arrow" size={14} /></Button><Button variant="ghost" type="button" onclick={() => navigate('invitations')}><AdminIcon name="invitations" size={16} />{messages.overview.inviteStudent}<AdminIcon name="arrow" size={14} /></Button><Button variant="ghost" type="button" onclick={() => navigate('reports')}><AdminIcon name="upload" size={16} />{messages.overview.uploadGrades}<AdminIcon name="arrow" size={14} /></Button></div>
		{/if}

		<div id="console-view">
			{#if section === 'overview'}<AdminOverview {students} />
			{:else if section === 'students'}<AdminStudents {students} />{/if}
			<AdminOperations {section} {students} invitations={data.invitations} invitationPage={data.invitationPage} hasMoreInvitations={data.hasMoreInvitations} />
		</div>
	</div>
{/if}

<style>
	.admin-sign-in { display: flex; flex-direction: column; padding: clamp(1rem, 4vw, 3rem); }
	.sign-in-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1.5rem; }
	.sign-in-panel { width: min(100%, 30rem); margin: clamp(3rem, 10vh, 7rem) auto; }
	.sign-in-panel h1 { font-size: clamp(1.75rem, 4vw, 2.3rem); }
	.sign-in-introduction { margin: 1rem 0 2rem; color: var(--muted-foreground); line-height: 1.7; }
	.console-brand { display: flex; align-items: center; gap: 0.6rem; color: var(--foreground); text-decoration: none; }
	.console-brand img { flex-shrink: 0; width: 2.65rem; height: 2.65rem; object-fit: contain; }
	.console-brand span { display: grid; gap: 0.4rem; }
	.console-brand strong { font-family: var(--font-display); font-size: 0.7rem; letter-spacing: -0.04em; }
	.console-brand small { color: var(--primary); font-family: var(--font-mono); font-size: 0.56rem; letter-spacing: 0.1em; text-transform: uppercase; }
	.admin-overview > :global(.preview-banner) { display: flex; align-items: center; gap: 0.7rem; padding: 0.7rem 0.9rem; font-size: 0.63rem; line-height: 1.6; }
	.preview-light { flex-shrink: 0; width: 5px; height: 5px; border-radius: 50%; background: var(--warning); }
	.preview-light.connected { background: var(--primary); }
	.page-intro { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 1rem; min-height: 10rem; padding: 1.7rem 0 1.5rem; }
	.intro-copy { z-index: 1; max-width: 45rem; }
	.page-intro .eyebrow { font-size: 0.62rem; }
	h1 { margin: 0.6rem 0 0; font-size: clamp(2.1rem, 3.9vw, 3.3rem); font-weight: 700; line-height: 1.15; letter-spacing: -0.055em; }
	h1 span { color: var(--primary); }
	.intro-description { margin: 0.75rem 0 0; color: var(--muted-foreground); font-size: 0.78rem; }
	.intro-instrument { position: absolute; top: 0.5rem; right: 7rem; width: 12rem; color: var(--primary); opacity: 0.12; pointer-events: none; }
	.intro-instrument svg { width: 100%; stroke: currentColor; stroke-width: 0.8; }
	.instrument-guides { stroke-dasharray: 3 5; }
	.intro-instrument .jet { fill: #bed29c20; stroke-width: 1.5; }
	.quick-controls { display: flex; align-items: center; flex-wrap: wrap; gap: 0.6rem; margin-bottom: 1.5rem; }
	.quick-label { display: flex; align-items: center; gap: 1rem; margin-right: 0.4rem; color: var(--muted-foreground); font-size: 0.57rem; text-transform: uppercase; letter-spacing: 0.06em; }
	.quick-label span { color: #71826d; }
	.quick-controls :global([data-slot='button']) { display: flex; gap: 0.6rem; padding: 0.5rem 0.8rem; font-size: 0.68rem; }

	@media (max-width: 70rem) {
		.console-brand { gap: 0.4rem; } .console-brand strong { font-size: 0.6rem; }
		.console-brand img { width: 2.2rem; height: 2.2rem; }
		.admin-overview > :global(.preview-banner) { flex-wrap: wrap; gap: 0.4rem 0.6rem; }
		.preview-copy { flex-basis: 100%; }
	}
	@media (max-width: 52rem) {
		.console-brand strong { font-size: 0.8rem; }
		.console-brand img { width: 2.5rem; height: 2.5rem; }
		.page-intro { flex-wrap: wrap; gap: 1.2rem; padding: 1.8rem 0; }
		.page-intro :global(.hero-action) { margin-left: auto; }
		.intro-instrument { right: 0; }
	}
	@media (max-width: 35rem) {
		.page-intro :global(.hero-action) { margin-left: 0; }
		.quick-label { width: 100%; margin-bottom: 0.2rem; }
		.quick-controls { gap: 0.45rem; }
		.quick-controls :global([data-slot='button']) { flex: 1 1 auto; justify-content: space-between; }
	}
</style>
