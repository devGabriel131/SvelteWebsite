<script lang="ts">
	import { asset, resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import AdminIcon from '#lib/admin/AdminIcon.svelte';
	import { adminSectionHref, adminSections, isAdminPreviewSection, resolveAdminSection } from '#lib/admin/navigation.ts';
	import LanguageSelector from '#lib/components/LanguageSelector.svelte';
	import SignOutButton from '#lib/components/SignOutButton.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import '#lib/admin/admin.css';

	let { children }: { children: Snippet } = $props();
	const language = useLanguage();
	const messages = $derived(language.messages.admin);
	const viewer = $derived(page.data.viewer);
	const isAdminRoot = $derived(page.route.id === '/admin');
	const isBootcamp = $derived(
		page.route.id === '/admin/bootcamps' || page.route.id?.startsWith('/admin/bootcamps/') === true
	);
	const section = $derived(resolveAdminSection(page.url.searchParams.get('section')));
	const breadcrumb = $derived(
		isAdminRoot ? messages.sections[section] : isBootcamp ? language.messages.bootcamp.title : messages.console
	);
</script>

<div class="admin-console">
	<aside class="command-rail">
		<a class="console-brand" href={resolve('/')} aria-label={language.messages.auth.studentWorkspace}>
			<img src={asset('logo.png')} alt="" width="42" height="42" />
			<span><strong>{language.messages.header.brand}</strong><small>{messages.console}</small></span>
		</a>
		<div class="rail-divider"><span class="mono">{messages.workspace}</span><span aria-hidden="true">//</span></div>
		<nav aria-label={messages.navigation}>
			{#each adminSections as item, index (item)}
				<Button
					variant="ghost"
					class="nav-control"
					href={adminSectionHref(item, resolve('/admin'))}
					aria-current={isAdminRoot && section === item ? 'page' : undefined}
				>
					<AdminIcon name={item} size={18} /><span>{messages.sections[item]}</span>
					<span class="nav-index mono" aria-hidden="true">{String(index).padStart(2, '0')}</span>
				</Button>
			{/each}
			<Button variant="ghost" class="nav-control" href={resolve('/admin/bootcamps')} aria-current={isBootcamp ? 'page' : undefined}>
				<AdminIcon name="events" size={18} /><span>{language.messages.bootcamp.title}</span>
			</Button>
		</nav>
		<div class="rail-bottom">
			{#if isAdminRoot}
				<Card.Root class="connection-panel mb-4 gap-0 rounded p-4 px-[0.7rem]">
					<p class="eyebrow">{messages.overview.systems}</p>
					{#each ['database', 'billing', 'scheduling'] as const as connection}
						<div class="connection-row">
							<span class="connection-light" aria-hidden="true"></span>
							<span>{messages.overview[connection]}</span>
							<span class="connection-dash" title={connection === 'database' ? messages.roster.connected : messages.overview.awaiting} aria-label={connection === 'database' ? messages.roster.connected : messages.overview.awaiting}>{connection === 'database' ? messages.roster.connected : messages.common.notAvailable}</span>
						</div>
					{/each}
					<p class="connection-note">{messages.roster.workspaceNote}</p>
				</Card.Root>
			{/if}
			<Button variant="ghost" class="workspace-link" href={resolve('/')}><AdminIcon name="logout" size={17} />{messages.backToStudents}<AdminIcon name="arrow" size={14} /></Button>
			{#if isAdminRoot}
				<div class="rail-signature mono"><span>{messages.version}</span><span aria-hidden="true">MM / 01</span></div>
			{/if}
		</div>
	</aside>

	<div class="console-main">
		<header class="console-header">
			<div class="breadcrumb"><span class="breadcrumb-mark" aria-hidden="true">+</span><span>{messages.topLabel}</span><span class="slash" aria-hidden="true">/</span><strong>{breadcrumb}</strong></div>
			<div class="header-controls">
				<LanguageSelector />
				<span class="header-divider" aria-hidden="true"></span>
				{#if viewer}
					<div class="operator" role="group" aria-label={language.messages.auth.accountLabel}>
						<span class="operator-icon" aria-hidden="true"><AdminIcon name="shield" size={17} /></span>
						<span><strong>{viewer.name}</strong><small>{viewer.email}</small></span>
					</div>
				{/if}
				<SignOutButton redirectTo="/admin" />
			</div>
		</header>

		<main id="main-content" class="console-content" tabindex="-1">
			{@render children()}
			<footer class="console-footer mono">
				<span><span class="footer-cross" aria-hidden="true">+</span>{messages.footer}</span>
				<Button variant="ghost" class="mobile-workspace-link" href={resolve('/')}><AdminIcon name="logout" size={14} />{messages.backToStudents}</Button>
				{#if isAdminRoot}
					<span>{isAdminPreviewSection(section) ? messages.common.localOnly : messages.roster.connected}<span class="footer-cross" aria-hidden="true">+</span></span>
				{/if}
			</footer>
		</main>
	</div>
</div>

<style>
	.admin-console { display: grid; grid-template-columns: 14.5rem minmax(0, 1fr); }
	.command-rail { position: sticky; top: 0; display: flex; flex-direction: column; align-self: start; min-width: 0; height: 100dvh; min-height: 42rem; padding: 1.7rem 1rem 1rem; border-right: 1px solid var(--border); background: #141b20; }
	.console-brand { margin: 0 0.35rem 2.6rem; }
	.rail-divider { display: flex; justify-content: space-between; margin: 0 0.6rem 1rem; color: var(--muted-foreground); font-size: 0.54rem; letter-spacing: 0.1em; text-transform: uppercase; }
	nav { display: grid; gap: 0.4rem; min-width: 0; }
	nav :global(.nav-control) { position: relative; display: flex; justify-content: flex-start; gap: 0.8rem; width: 100%; min-height: 2.95rem; padding: 0.7rem 0.85rem; text-align: left; font-size: 0.78rem; }
	.nav-index { margin-left: auto; color: #7b8985; font-size: 0.61rem; }

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
	.breadcrumb { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; min-width: 0; color: var(--muted-foreground); font-size: 0.7rem; }
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
	.console-content { min-width: 0; max-width: 96rem; margin: 0 auto; padding: 1.5rem clamp(1.25rem, 3vw, 2.6rem) 1rem; }
	.console-footer { display: flex; justify-content: space-between; gap: 1rem; margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--border); color: var(--muted-foreground); font-size: 0.52rem; letter-spacing: 0.06em; }
	.console-footer > span { display: flex; align-items: center; gap: 0.8rem; }
	.footer-cross { color: var(--primary); font-size: 1rem; }
	.console-footer :global(.mobile-workspace-link) { display: none; gap: 0.4rem; font-size: inherit; }

	@media (min-width: 110rem) { .admin-console { grid-template-columns: 16rem minmax(0, 1fr); } }
	@media (max-width: 70rem) {
		.admin-console { grid-template-columns: 12.5rem minmax(0, 1fr); }
		nav :global(.nav-control) { gap: 0.6rem; padding-inline: 0.65rem; font-size: 0.73rem; }
		.header-controls { gap: 0.75rem; }
	}
	@media (max-width: 52rem) {
		.admin-console { grid-template-columns: minmax(0, 1fr); }
		.command-rail { position: static; height: auto; min-height: 0; padding: 1rem 1.25rem 0.8rem; border-right: 0; border-bottom: 1px solid var(--border); }
		.console-brand { margin: 0 0 1rem; }
		.rail-divider, .rail-bottom { display: none; }
		.console-footer :global(.mobile-workspace-link) { display: inline-flex; }
		nav { display: flex; gap: 0.4rem; overflow-x: auto; padding-bottom: 0.3rem; }
		nav :global(.nav-control) { flex-shrink: 0; width: auto; min-height: 2.75rem; padding: 0.6rem 0.85rem; }
		.nav-index { display: none; }
		.console-header { min-height: 4.5rem; padding: 0.8rem 1.25rem; }
	}
	@media (max-width: 35rem) {
		.console-header { gap: 0.6rem; }
		.header-controls { margin-left: auto; } .header-divider { display: none; }
		.breadcrumb { gap: 0.4rem; font-size: 0.61rem; }
		.console-content { padding: 1rem; }
		.console-footer { flex-wrap: wrap; }
	}
</style>
