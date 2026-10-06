<script lang="ts">
	import { asset, resolve } from '$app/paths';
	import { tick } from 'svelte';
	import AdminIcon from '#lib/admin/AdminIcon.svelte';
	import AdminOverview from '#lib/admin/AdminOverview.svelte';
	import AdminStudents from '#lib/admin/AdminStudents.svelte';
	import AdminOperations from '#lib/admin/AdminOperations.svelte';
	import LanguageSelector from '#lib/components/LanguageSelector.svelte';
	import SignInForm from '#lib/components/SignInForm.svelte';
	import SignOutButton from '#lib/components/SignOutButton.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import type { PageProps } from './$types';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import { sampleStudents, studentMetrics, type AdminSection, type AdminStudent } from '#lib/admin/demo.ts';
	import '#lib/admin/admin.css';

	let { data }: PageProps = $props();
	const language = useLanguage();
	const messages = $derived(language.messages.admin);
	const sections: AdminSection[] = ['overview', 'students', 'payments', 'invitations', 'reports', 'events'];
	let section = $state<AdminSection>('overview');
	let students = $state<AdminStudent[]>(sampleStudents.map((student) => ({ ...student })));
	let openAdd = $state(false);
	let title = $state<HTMLHeadingElement>();
	const metrics = $derived(studentMetrics(students));
	const intro = $derived(messages.intro[section]);

	async function navigate(next: AdminSection) {
		section = next;
		await tick();
		title?.focus();
	}
</script>

<svelte:head>
	<title>{data.isAdmin ? messages.pageTitle : language.messages.auth.admin.pageTitle}</title>
	<meta name="description" content={data.isAdmin ? messages.description : language.messages.auth.admin.description} />
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
			<SignInForm audience="admin" />
			</Card.Root>
		</section>
	</div>
{:else}
<div class="admin-console" lang={language.current}>
	<aside class="command-rail">
		<a class="console-brand" href={resolve('/')} aria-label={language.messages.auth.studentWorkspace}>
			<img src={asset('logo.png')} alt="" width="42" height="42" />
			<span><strong>{language.messages.header.brand}</strong><small>{messages.console}</small></span>
		</a>
		<div class="rail-divider"><span class="mono">{messages.workspace}</span><span aria-hidden="true">//</span></div>
		<nav aria-label={messages.navigation}>
			{#each sections as item, index}
				<Button variant="ghost" type="button" class="nav-control" aria-current={section === item ? 'true' : undefined} aria-controls="console-view" onclick={() => navigate(item)}>
					<AdminIcon name={item} size={18} /><span>{messages.sections[item]}</span>
					{#if item === 'students'}<Badge variant="outline" class="nav-count mono ml-auto min-w-[1.4rem] px-[0.2rem] py-[0.1rem] text-[0.61rem] text-primary">{metrics.total}</Badge>
					{:else if item === 'events'}<span class="pending-dot" aria-hidden="true"></span>
					{:else}<span class="nav-index mono" aria-hidden="true">{String(index).padStart(2, '0')}</span>{/if}
				</Button>
			{/each}
		</nav>
		<div class="rail-bottom">
			<Card.Root class="connection-panel mb-4 gap-0 rounded p-4 px-[0.7rem]">
				<p class="eyebrow">{messages.overview.systems}</p>
				{#each ['database', 'billing', 'scheduling'] as connection}
					<div class="connection-row"><span class="connection-light" aria-hidden="true"></span><span>{messages.overview[connection as 'database' | 'billing' | 'scheduling']}</span><span class="connection-dash" title={messages.overview.awaiting} aria-label={messages.overview.awaiting}>—</span></div>
				{/each}
				<p class="connection-note">{messages.overview.awaiting}</p>
			</Card.Root>
			<Button variant="ghost" class="workspace-link" href={resolve('/')}><AdminIcon name="logout" size={17} />{messages.backToStudents}<AdminIcon name="arrow" size={14} /></Button>
			<div class="rail-signature mono"><span>{messages.version}</span><span aria-hidden="true">MM / 01</span></div>
		</div>
	</aside>

	<div class="console-main">
		<header class="console-header">
			<div class="breadcrumb"><span class="breadcrumb-mark" aria-hidden="true">+</span><span>{messages.topLabel}</span><span class="slash" aria-hidden="true">/</span><strong>{messages.sections[section]}</strong></div>
			<div class="header-controls">
				<LanguageSelector />
				<span class="header-divider" aria-hidden="true"></span>
				{#if data.viewer}
					<div class="operator" role="group" aria-label={language.messages.auth.accountLabel}>
						<span class="operator-icon" aria-hidden="true"><AdminIcon name="shield" size={17} /></span>
						<span><strong>{data.viewer.name}</strong><small>{data.viewer.email}</small></span>
					</div>
				{/if}
				<SignOutButton redirectTo="/admin" />
			</div>
		</header>

		<div class="console-content">
			<Alert.Root role="note" class="preview-banner border-warning/30 bg-warning/10 text-muted-foreground"><span class="preview-light" aria-hidden="true"></span><strong class="mono shrink-0 text-[0.59rem] font-medium uppercase tracking-[0.05em] text-warning">{messages.prototype}</strong><span class="preview-copy">{messages.prototypeNote}</span></Alert.Root>

			<section class="page-intro" aria-labelledby="console-title">
				<div class="intro-copy"><p class="eyebrow">{intro.eyebrow}</p><h1 id="console-title" tabindex="-1" bind:this={title}>{intro.title}<span aria-hidden="true">.</span></h1><p class="intro-description">{intro.description}</p></div>
				<div class="intro-instrument" aria-hidden="true"><svg viewBox="0 0 160 120" fill="none"><circle cx="80" cy="60" r="44" /><circle cx="80" cy="60" r="28" /><path class="instrument-guides" d="M80 0v120M0 60h160M7 16h20M17 6v20M133 104h20M143 94v20" /><path class="jet" d="M80 17l5 31 34 25v8L85 69l-1 24 10 9v4l-14-5-14 5v-4l10-9-1-24-34 12v-8l34-25z" /></svg></div>
				{#if section === 'overview'}<Button class="hero-action z-10 shrink-0 text-[0.76rem] font-bold" type="button" onclick={() => openAdd = true}><AdminIcon name="plus" size={17} />{messages.overview.addStudent}</Button>{/if}
			</section>

			{#if section === 'overview'}
				<div class="quick-controls" role="group" aria-label={messages.overview.quickActions}><span class="quick-label mono">{messages.overview.quickActions}<span aria-hidden="true">/</span></span><Button variant="ghost" type="button" onclick={() => navigate('payments')}><AdminIcon name="payments" size={16} />{messages.overview.createPayment}<AdminIcon name="arrow" size={14} /></Button><Button variant="ghost" type="button" onclick={() => navigate('invitations')}><AdminIcon name="invitations" size={16} />{messages.overview.inviteStudent}<AdminIcon name="arrow" size={14} /></Button><Button variant="ghost" type="button" onclick={() => navigate('reports')}><AdminIcon name="upload" size={16} />{messages.overview.uploadGrades}<AdminIcon name="arrow" size={14} /></Button></div>
			{/if}

			<div id="console-view">
				{#if section === 'overview'}<AdminOverview bind:students bind:openAdd onNavigate={navigate} />
				{:else if section === 'students'}<AdminStudents bind:students bind:openAdd />{/if}
				<AdminOperations {section} {students} />
			</div>

			<footer class="console-footer mono"><span><span class="footer-cross" aria-hidden="true">+</span>{messages.footer}</span><Button variant="ghost" class="mobile-workspace-link" href={resolve('/')}><AdminIcon name="logout" size={14} />{messages.backToStudents}</Button><span>{messages.common.localOnly}<span class="footer-cross" aria-hidden="true">+</span></span></footer>
		</div>
	</div>
</div>
{/if}

<style>
	.admin-console { display: grid; grid-template-columns: 14.5rem minmax(0, 1fr); }
	.admin-sign-in { display: flex; flex-direction: column; padding: clamp(1rem, 4vw, 3rem); }
	.sign-in-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1.5rem; }
	.sign-in-header .console-brand { margin: 0; }
	.sign-in-panel { width: min(100%, 30rem); margin: clamp(3rem, 10vh, 7rem) auto; }
	.sign-in-panel h1 { font-size: clamp(1.75rem, 4vw, 2.3rem); }
	.sign-in-introduction { margin: 1rem 0 2rem; color: var(--muted-foreground); line-height: 1.7; }
	.command-rail { position: sticky; top: 0; display: flex; flex-direction: column; align-self: start; height: 100dvh; min-height: 42rem; padding: 1.7rem 1rem 1rem; border-right: 1px solid var(--border); background: #141b20; }
	.console-brand { display: flex; align-items: center; gap: 0.6rem; margin: 0 0.35rem 2.6rem; color: var(--foreground); text-decoration: none; }
	.console-brand img { flex-shrink: 0; width: 2.65rem; height: 2.65rem; object-fit: contain; }
	.console-brand span { display: grid; gap: 0.4rem; }
	.console-brand strong { font-family: var(--font-display); font-size: 0.7rem; letter-spacing: -0.04em; }
	.console-brand small { color: var(--primary); font-family: var(--font-mono); font-size: 0.56rem; letter-spacing: 0.1em; text-transform: uppercase; }
	.rail-divider { display: flex; justify-content: space-between; margin: 0 0.6rem 1rem; color: var(--muted-foreground); font-size: 0.54rem; letter-spacing: 0.1em; text-transform: uppercase; }
	nav { display: grid; gap: 0.4rem; }
	nav :global(.nav-control) { position: relative; display: flex; justify-content: flex-start; gap: 0.8rem; width: 100%; min-height: 2.95rem; padding: 0.7rem 0.85rem; text-align: left; font-size: 0.78rem; }
	.nav-index { margin-left: auto; font-size: 0.61rem; }
	.nav-index { color: #7b8985; }
	.pending-dot { width: 5px; height: 5px; margin-left: auto; border-radius: 50%; background: var(--warning); }
	.rail-bottom { margin-top: auto; padding-top: 3rem; }
	.rail-bottom .eyebrow { margin-bottom: 1.1rem; font-size: 0.54rem; }
	.connection-row { display: flex; align-items: center; gap: 0.5rem; margin: 0.7rem 0; color: var(--muted-foreground); font-size: 0.65rem; }
	.connection-light { flex-shrink: 0; width: 5px; height: 5px; border: 1px solid #78837e; border-radius: 50%; }
	.connection-dash { margin-left: auto; color: #84938c; }
	.connection-note { margin: 1.1rem 0 0; padding-top: 0.7rem; border-top: 1px dashed var(--border); color: var(--warning); font-family: var(--font-mono); font-size: 0.51rem; }
	.rail-bottom :global(.workspace-link) { display: flex; justify-content: space-between; gap: 0.6rem; width: 100%; padding: 0.8rem 0.6rem; font-size: 0.7rem; }
	.rail-signature { display: flex; justify-content: space-between; margin: 1rem 0.6rem 0; padding-top: 1rem; border-top: 1px solid var(--border); color: var(--muted-foreground); font-size: 0.48rem; letter-spacing: 0.06em; }
	.console-main { min-width: 0; background-image: radial-gradient(#778f6920 0.6px, transparent 0.6px); background-size: 16px 16px; }
	.console-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem; min-height: 5.5rem; padding: 1rem clamp(1.25rem, 3vw, 2.6rem); border-bottom: 1px solid var(--border); background: #131a1ee8; }
	.breadcrumb { display: flex; align-items: center; gap: 0.75rem; color: var(--muted-foreground); font-size: 0.7rem; }
	.breadcrumb-mark { color: var(--primary); font-size: 1.3rem; }
	.breadcrumb strong { color: var(--foreground); font-weight: 500; }
	.slash { color: #75827d; }
	.header-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 1.2rem; min-width: 0; max-width: 100%; }
	.header-divider { width: 1px; height: 1.6rem; background: var(--border); }
	.operator { display: flex; align-items: center; gap: 0.65rem; min-width: 0; max-width: 100%; }
	.operator-icon { display: grid; flex-shrink: 0; place-items: center; width: 2.2rem; height: 2.2rem; border: 1px solid #435044; border-radius: 4px; background: #253027; color: var(--primary); }
	.operator > span:last-child { display: grid; gap: 0.15rem; min-width: 0; overflow-wrap: anywhere; }
	.operator strong { font-size: 0.73rem; }
	.operator small { color: var(--muted-foreground); font-family: var(--font-mono); font-size: 0.52rem; }
	.console-content { max-width: 96rem; margin: 0 auto; padding: 1.5rem clamp(1.25rem, 3vw, 2.6rem) 1rem; }
	.console-content > :global(.preview-banner) { display: flex; align-items: center; gap: 0.7rem; padding: 0.7rem 0.9rem; font-size: 0.63rem; line-height: 1.6; }
	.preview-light { flex-shrink: 0; width: 5px; height: 5px; border-radius: 50%; background: var(--warning); }
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
	.console-footer { display: flex; justify-content: space-between; gap: 1rem; margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--border); color: var(--muted-foreground); font-size: 0.52rem; letter-spacing: 0.06em; }
	.console-footer > span { display: flex; align-items: center; gap: 0.8rem; }
	.footer-cross { color: var(--primary); font-size: 1rem; }
	.console-footer :global(.mobile-workspace-link) { display: none; gap: 0.4rem; font-size: inherit; }

	@media (min-width: 110rem) { .admin-console { grid-template-columns: 16rem minmax(0, 1fr); } }
	@media (max-width: 70rem) {
		.admin-console { grid-template-columns: 12.5rem minmax(0, 1fr); }
		.console-brand { gap: 0.4rem; } .console-brand strong { font-size: 0.6rem; }
		.console-brand img { width: 2.2rem; height: 2.2rem; }
		nav :global(.nav-control) { gap: 0.6rem; padding-inline: 0.65rem; font-size: 0.73rem; }
		.header-controls { gap: 0.75rem; }
		.console-content > :global(.preview-banner) { flex-wrap: wrap; gap: 0.4rem 0.6rem; }
		.preview-copy { flex-basis: 100%; }
	}
	@media (max-width: 52rem) {
		.admin-console { grid-template-columns: minmax(0, 1fr); }
		.command-rail { position: static; height: auto; min-height: 0; padding: 1rem 1.25rem 0.8rem; border-right: 0; border-bottom: 1px solid var(--border); }
		.console-brand { margin: 0 0 1rem; } .console-brand strong { font-size: 0.8rem; }
		.console-brand img { width: 2.5rem; height: 2.5rem; }
		.rail-divider, .rail-bottom { display: none; }
		.console-footer :global(.mobile-workspace-link) { display: inline-flex; }
		nav { display: flex; gap: 0.4rem; overflow-x: auto; padding-bottom: 0.3rem; }
		nav :global(.nav-control) { flex-shrink: 0; width: auto; min-height: 2.75rem; padding: 0.6rem 0.85rem; }
		.nav-index, .pending-dot, nav :global(.nav-count) { display: none; }
		.console-header { min-height: 4.5rem; padding: 0.8rem 1.25rem; }
		.page-intro { flex-wrap: wrap; gap: 1.2rem; padding: 1.8rem 0; }
		.page-intro :global(.hero-action) { margin-left: auto; }
		.intro-instrument { right: 0; }
	}
	@media (max-width: 35rem) {
		.console-header { gap: 0.6rem; }
		.header-controls { margin-left: auto; } .header-divider { display: none; }
		.breadcrumb { gap: 0.4rem; font-size: 0.61rem; }
		.console-content { padding: 1rem; }
		.page-intro :global(.hero-action) { margin-left: 0; }
		.quick-label { width: 100%; margin-bottom: 0.2rem; }
		.quick-controls { gap: 0.45rem; }
		.quick-controls :global([data-slot='button']) { flex: 1 1 auto; justify-content: space-between; }
		.console-footer { flex-wrap: wrap; }
	}
</style>
