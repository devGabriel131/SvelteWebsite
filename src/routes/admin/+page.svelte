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
			<p class="eyebrow">{language.messages.auth.admin.eyebrow}</p>
			<h1 id="sign-in-title">{language.messages.auth.admin.title}</h1>
			<p class="sign-in-introduction">{language.messages.auth.admin.introduction}</p>
			<SignInForm audience="admin" />
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
				<button type="button" class="nav-control" class:selected={section === item} aria-current={section === item ? 'true' : undefined} aria-controls="console-view" onclick={() => navigate(item)}>
					<AdminIcon name={item} size={18} /><span>{messages.sections[item]}</span>
					{#if item === 'students'}<span class="nav-count mono">{metrics.total}</span>
					{:else if item === 'events'}<span class="pending-dot" aria-hidden="true"></span>
					{:else}<span class="nav-index mono" aria-hidden="true">{String(index).padStart(2, '0')}</span>{/if}
				</button>
			{/each}
		</nav>
		<div class="rail-bottom">
			<div class="connection-panel">
				<p class="eyebrow">{messages.overview.systems}</p>
				{#each ['database', 'billing', 'scheduling'] as connection}
					<div class="connection-row"><span class="connection-light" aria-hidden="true"></span><span>{messages.overview[connection as 'database' | 'billing' | 'scheduling']}</span><span class="connection-dash" title={messages.overview.awaiting} aria-label={messages.overview.awaiting}>—</span></div>
				{/each}
				<p class="connection-note">{messages.overview.awaiting}</p>
			</div>
			<a class="workspace-link" href={resolve('/')}><AdminIcon name="logout" size={17} />{messages.backToStudents}<AdminIcon name="arrow" size={14} /></a>
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
			<div class="preview-banner"><span class="preview-light" aria-hidden="true"></span><strong class="mono">{messages.prototype}</strong><span>{messages.prototypeNote}</span></div>

			<section class="page-intro" aria-labelledby="console-title">
				<div class="intro-copy"><p class="eyebrow">{intro.eyebrow}</p><h1 id="console-title" tabindex="-1" bind:this={title}>{intro.title}<span aria-hidden="true">.</span></h1><p class="intro-description">{intro.description}</p></div>
				<div class="intro-instrument" aria-hidden="true"><svg viewBox="0 0 160 120" fill="none"><circle cx="80" cy="60" r="44" /><circle cx="80" cy="60" r="28" /><path class="instrument-guides" d="M80 0v120M0 60h160M7 16h20M17 6v20M133 104h20M143 94v20" /><path class="jet" d="M80 17l5 31 34 25v8L85 69l-1 24 10 9v4l-14-5-14 5v-4l10-9-1-24-34 12v-8l34-25z" /></svg></div>
				{#if section === 'overview'}<button class="button-primary hero-action" type="button" onclick={() => openAdd = true}><AdminIcon name="plus" size={17} />{messages.overview.addStudent}</button>{/if}
			</section>

			{#if section === 'overview'}
				<div class="quick-controls" role="group" aria-label={messages.overview.quickActions}><span class="quick-label mono">{messages.overview.quickActions}<span aria-hidden="true">/</span></span><button type="button" onclick={() => navigate('payments')}><AdminIcon name="payments" size={16} />{messages.overview.createPayment}<AdminIcon name="arrow" size={14} /></button><button type="button" onclick={() => navigate('invitations')}><AdminIcon name="invitations" size={16} />{messages.overview.inviteStudent}<AdminIcon name="arrow" size={14} /></button><button type="button" onclick={() => navigate('reports')}><AdminIcon name="upload" size={16} />{messages.overview.uploadGrades}<AdminIcon name="arrow" size={14} /></button></div>
			{/if}

			<div id="console-view">
				{#if section === 'overview'}<AdminOverview bind:students bind:openAdd onNavigate={navigate} />
				{:else if section === 'students'}<AdminStudents bind:students bind:openAdd />{/if}
				<AdminOperations {section} {students} />
			</div>

			<footer class="console-footer mono"><span><span class="footer-cross" aria-hidden="true">+</span>{messages.footer}</span><a class="mobile-workspace-link" href={resolve('/')}><AdminIcon name="logout" size={14} />{messages.backToStudents}</a><span>{messages.common.localOnly}<span class="footer-cross" aria-hidden="true">+</span></span></footer>
		</div>
	</div>
</div>
{/if}

<style>
	.admin-console { display: grid; grid-template-columns: 14.5rem minmax(0, 1fr); }
	.admin-sign-in { display: flex; flex-direction: column; padding: clamp(1rem, 4vw, 3rem); }
	.sign-in-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1.5rem; }
	.sign-in-header .console-brand { margin: 0; }
	.sign-in-panel { width: min(100%, 30rem); margin: clamp(3rem, 10vh, 7rem) auto; padding: clamp(1.25rem, 4vw, 2.5rem); border: 1px solid var(--console-border); border-radius: 0.75rem; background: var(--console-panel); }
	.sign-in-panel h1 { font-size: clamp(1.75rem, 4vw, 2.3rem); }
	.sign-in-introduction { margin: 1rem 0 2rem; color: var(--console-muted); line-height: 1.7; }
	.command-rail { position: sticky; top: 0; display: flex; flex-direction: column; align-self: start; height: 100dvh; min-height: 42rem; padding: 1.7rem 1rem 1rem; border-right: 1px solid var(--console-border); background: #141b20; }
	.console-brand { display: flex; align-items: center; gap: 0.6rem; margin: 0 0.35rem 2.6rem; color: var(--console-text); text-decoration: none; }
	.console-brand img { flex-shrink: 0; width: 2.65rem; height: 2.65rem; object-fit: contain; }
	.console-brand span { display: grid; gap: 0.4rem; }
	.console-brand strong { font-family: var(--font-display); font-size: 0.7rem; letter-spacing: -0.04em; }
	.console-brand small { color: var(--console-sage); font-family: var(--font-mono); font-size: 0.56rem; letter-spacing: 0.1em; text-transform: uppercase; }
	.rail-divider { display: flex; justify-content: space-between; margin: 0 0.6rem 1rem; color: var(--console-muted); font-size: 0.54rem; letter-spacing: 0.1em; text-transform: uppercase; }
	nav { display: grid; gap: 0.4rem; }
	.nav-control { position: relative; display: flex; align-items: center; gap: 0.8rem; width: 100%; min-height: 2.95rem; padding: 0.7rem 0.85rem; border: 1px solid transparent; border-radius: 4px; background: transparent; color: var(--console-muted); text-align: left; font-size: 0.78rem; }
	.nav-control:hover { background: #202b27; color: var(--console-text); }
	.nav-control.selected { border-color: #485341; background: linear-gradient(100deg, #2c382c, #202b25); color: var(--console-sage); }
	.nav-control.selected::before { position: absolute; top: 0.8rem; bottom: 0.8rem; left: -1rem; width: 2px; content: ''; background: var(--console-sage); box-shadow: 0 0 12px #bed29c40; }
	.nav-count, .nav-index { margin-left: auto; font-size: 0.61rem; }
	.nav-count { min-width: 1.4rem; padding: 0.1rem 0.2rem; border: 1px solid #475544; border-radius: 3px; text-align: center; color: var(--console-sage); }
	.nav-index { color: #7b8985; }
	.pending-dot { width: 5px; height: 5px; margin-left: auto; border-radius: 50%; background: var(--console-amber); }
	.rail-bottom { margin-top: auto; padding-top: 3rem; }
	.connection-panel { margin-bottom: 1rem; padding: 1rem 0.7rem; border: 1px solid var(--console-border); border-radius: 4px; background: #10171b; }
	.connection-panel .eyebrow { margin-bottom: 1.1rem; color: var(--console-muted); font-size: 0.54rem; }
	.connection-row { display: flex; align-items: center; gap: 0.5rem; margin: 0.7rem 0; color: var(--console-muted); font-size: 0.65rem; }
	.connection-light { flex-shrink: 0; width: 5px; height: 5px; border: 1px solid #78837e; border-radius: 50%; }
	.connection-dash { margin-left: auto; color: #84938c; }
	.connection-note { margin: 1.1rem 0 0; padding-top: 0.7rem; border-top: 1px dashed var(--console-border); color: var(--console-amber); font-family: var(--font-mono); font-size: 0.51rem; }
	.workspace-link { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; padding: 0.8rem 0.6rem; color: var(--console-muted); font-size: 0.7rem; text-decoration: none; }
	.workspace-link:hover { color: var(--console-sage); }
	.rail-signature { display: flex; justify-content: space-between; margin: 1rem 0.6rem 0; padding-top: 1rem; border-top: 1px solid var(--console-border); color: var(--console-muted); font-size: 0.48rem; letter-spacing: 0.06em; }
	.console-main { min-width: 0; background-image: radial-gradient(#778f6920 0.6px, transparent 0.6px); background-size: 16px 16px; }
	.console-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem; min-height: 5.5rem; padding: 1rem clamp(1.25rem, 3vw, 2.6rem); border-bottom: 1px solid var(--console-border); background: #131a1ee8; }
	.breadcrumb { display: flex; align-items: center; gap: 0.75rem; color: var(--console-muted); font-size: 0.7rem; }
	.breadcrumb-mark { color: var(--console-sage); font-size: 1.3rem; }
	.breadcrumb strong { color: var(--console-text); font-weight: 500; }
	.slash { color: #75827d; }
	.header-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 1.2rem; min-width: 0; max-width: 100%; }
	.header-divider { width: 1px; height: 1.6rem; background: var(--console-border); }
	.operator { display: flex; align-items: center; gap: 0.65rem; min-width: 0; max-width: 100%; }
	.operator-icon { display: grid; flex-shrink: 0; place-items: center; width: 2.2rem; height: 2.2rem; border: 1px solid #435044; border-radius: 4px; background: #253027; color: var(--console-sage); }
	.operator > span:last-child { display: grid; gap: 0.15rem; min-width: 0; overflow-wrap: anywhere; }
	.operator strong { font-size: 0.73rem; }
	.operator small { color: var(--console-muted); font-family: var(--font-mono); font-size: 0.52rem; }
	.console-content { max-width: 96rem; margin: 0 auto; padding: 1.5rem clamp(1.25rem, 3vw, 2.6rem) 1rem; }
	.preview-banner { display: flex; align-items: center; gap: 0.7rem; padding: 0.7rem 0.9rem; border: 1px solid #514936; border-radius: 4px; background: #26271f; color: var(--console-muted); font-size: 0.63rem; line-height: 1.6; }
	.preview-banner strong { flex-shrink: 0; color: var(--console-amber); font-size: 0.59rem; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; }
	.preview-light { flex-shrink: 0; width: 5px; height: 5px; border-radius: 50%; background: var(--console-amber); }
	.page-intro { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 1rem; min-height: 10rem; padding: 1.7rem 0 1.5rem; }
	.intro-copy { z-index: 1; max-width: 45rem; }
	.page-intro .eyebrow { font-size: 0.62rem; }
	h1 { margin: 0.6rem 0 0; font-size: clamp(2.1rem, 3.9vw, 3.3rem); font-weight: 700; line-height: 1.15; letter-spacing: -0.055em; }
	h1 span { color: var(--console-sage); }
	.intro-description { margin: 0.75rem 0 0; color: var(--console-muted); font-size: 0.78rem; }
	.intro-instrument { position: absolute; top: 0.5rem; right: 7rem; width: 12rem; color: var(--console-sage); opacity: 0.12; pointer-events: none; }
	.intro-instrument svg { width: 100%; stroke: currentColor; stroke-width: 0.8; }
	.instrument-guides { stroke-dasharray: 3 5; }
	.intro-instrument .jet { fill: #bed29c20; stroke-width: 1.5; }
	.hero-action { z-index: 1; flex-shrink: 0; }
	.quick-controls { display: flex; align-items: center; flex-wrap: wrap; gap: 0.6rem; margin-bottom: 1.5rem; }
	.quick-label { display: flex; align-items: center; gap: 1rem; margin-right: 0.4rem; color: var(--console-muted); font-size: 0.57rem; text-transform: uppercase; letter-spacing: 0.06em; }
	.quick-label span { color: #71826d; }
	.quick-controls button { display: flex; align-items: center; gap: 0.6rem; min-height: 2.3rem; padding: 0.5rem 0.8rem; border: 1px solid var(--console-border); border-radius: 4px; background: #192222; color: var(--console-text); font-size: 0.68rem; }
	.quick-controls button:hover { border-color: #647456; color: var(--console-sage); background: #243126; }
	.console-footer { display: flex; justify-content: space-between; gap: 1rem; margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--console-border); color: var(--console-muted); font-size: 0.52rem; letter-spacing: 0.06em; }
	.console-footer > span { display: flex; align-items: center; gap: 0.8rem; }
	.footer-cross { color: var(--console-sage); font-size: 1rem; }
		.mobile-workspace-link { display: none; align-items: center; gap: 0.4rem; color: var(--console-sage); text-decoration: none; }

	@media (min-width: 110rem) { .admin-console { grid-template-columns: 16rem minmax(0, 1fr); } }
	@media (max-width: 70rem) {
		.admin-console { grid-template-columns: 12.5rem minmax(0, 1fr); }
		.console-brand { gap: 0.4rem; } .console-brand strong { font-size: 0.6rem; }
		.console-brand img { width: 2.2rem; height: 2.2rem; }
		.nav-control { gap: 0.6rem; padding-inline: 0.65rem; font-size: 0.73rem; }
		.header-controls { gap: 0.75rem; }
		.preview-banner { flex-wrap: wrap; gap: 0.4rem 0.6rem; }
		.preview-banner > span:last-child { flex-basis: 100%; }
	}
	@media (max-width: 52rem) {
		.admin-console { grid-template-columns: minmax(0, 1fr); }
		.command-rail { position: static; height: auto; min-height: 0; padding: 1rem 1.25rem 0.8rem; border-right: 0; border-bottom: 1px solid var(--console-border); }
		.console-brand { margin: 0 0 1rem; } .console-brand strong { font-size: 0.8rem; }
		.console-brand img { width: 2.5rem; height: 2.5rem; }
		.rail-divider, .rail-bottom { display: none; }
				.mobile-workspace-link { display: inline-flex; }
		nav { display: flex; gap: 0.4rem; overflow-x: auto; padding-bottom: 0.3rem; }
		.nav-control { flex-shrink: 0; width: auto; min-height: 2.7rem; padding: 0.6rem 0.85rem; }
		.nav-control.selected::before, .nav-index, .nav-count, .pending-dot { display: none; }
		.console-header { min-height: 4.5rem; padding: 0.8rem 1.25rem; }
		.page-intro { flex-wrap: wrap; gap: 1.2rem; padding: 1.8rem 0; }
		.hero-action { margin-left: auto; }
		.intro-instrument { right: 0; }
	}
	@media (max-width: 35rem) {
		.console-header { gap: 0.6rem; }
		.header-controls { margin-left: auto; } .header-divider { display: none; }
		.breadcrumb { gap: 0.4rem; font-size: 0.61rem; }
		.console-content { padding: 1rem; }
		.hero-action { margin-left: 0; } .quick-label { width: 100%; margin-bottom: 0.2rem; }
		.quick-controls { gap: 0.45rem; } .quick-controls button { flex: 1 1 auto; justify-content: space-between; }
		.console-footer { flex-wrap: wrap; }
	}
</style>
