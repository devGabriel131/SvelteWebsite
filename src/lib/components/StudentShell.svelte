<script lang="ts">
	import type { Snippet } from 'svelte';
	import { asset, resolve } from '$app/paths';
	import { page } from '$app/state';
	import { BookOpen, Dumbbell, FileText, House, UserRound, Zap } from '@lucide/svelte';
	import LanguageSelector from '#lib/components/LanguageSelector.svelte';
	import SignOutButton from '#lib/components/SignOutButton.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';

	let {
		children,
		activePage = 'home',
		preview = false
	}: {
		children: Snippet;
		activePage?: 'home' | 'speed-math' | 'frequency' | 'ist' | 'attendance' | 'bootcamps' | 'courses';
		preview?: boolean;
	} = $props();
	const language = useLanguage();
	const messages = $derived(language.messages.designPreview);
	const viewer = $derived(page.data.viewer);
	const homeHref = $derived(preview ? `${resolve('/design-preview')}?direction=focus` : resolve('/'));

	const tools = $derived([
		{ key: 'math', page: 'speed-math', href: resolve('/speed-math'), icon: Zap, ...messages.tools.math },
		{ key: 'vocabulary', page: 'frequency', href: resolve('/frequency'), icon: BookOpen, ...messages.tools.vocabulary },
		{ key: 'ist', page: 'ist', href: resolve('/ist'), icon: Dumbbell, ...messages.tools.ist },
		{ key: 'attendance', page: 'attendance', href: resolve('/attendance'), icon: FileText, ...messages.tools.attendance }
	]);
	const pageTitle = $derived(activePage === 'courses' ? language.messages.coursesPreview.label : activePage === 'bootcamps' ? language.messages.bootcamp.title : tools.find((tool) => tool.page === activePage)?.title ?? messages.home);
</script>

<div class="student-shell" data-preview={preview ? '' : undefined}>
	<aside class="sidebar">
		<a class="brand" href={homeHref} aria-label={language.messages.auth.studentWorkspace}>
			<img src={asset('logo.png')} alt="" width="44" height="44" />
			<span class="min-w-0">
				<span class="brand-name">{language.messages.header.brand}</span>
				<span class="brand-description">{language.messages.header.brandDescription}</span>
			</span>
		</a>
		<nav class="workspace-nav" aria-label={language.messages.navigation.label}>
			<Button href={homeHref} variant="ghost" aria-current={activePage === 'home' ? 'page' : undefined} class="nav-home justify-start gap-3 px-3">
				<House aria-hidden="true" />{messages.home}
			</Button>
			{#each tools as tool, index (tool.key)}
				{#if index === 0 || index === 2}
					<p class="nav-group">{index === 0 ? messages.practice : messages.resources}</p>
				{/if}
				<Button href={tool.href} variant="ghost" aria-current={activePage === tool.page ? 'page' : undefined} class="justify-start gap-3 px-3 text-left">
					<tool.icon aria-hidden="true" />{tool.title}
				</Button>
			{/each}
			<Button href={resolve('/courses-preview')} variant="ghost" aria-current={activePage === 'courses' ? 'page' : undefined} class="justify-start gap-3 px-3 text-left">
								<BookOpen aria-hidden="true" />{language.messages.coursesPreview.label}
							</Button>
							{#if viewer?.role === 'student'}
				<Button href={resolve('/bootcamps')} variant="ghost" aria-current={activePage === 'bootcamps' ? 'page' : undefined} class="justify-start gap-3 px-3 text-left">
					<FileText aria-hidden="true" />{language.messages.bootcamp.title}
				</Button>
			{/if}
		</nav>
		<div class="sidebar-footer">
			<span class="brand-mark" aria-hidden="true">M<span> / </span>M</span>
			<p>{messages.footer}</p>
		</div>
	</aside>

	<div class="workspace">
		<header class="workspace-header">
			<p class="text-sm text-muted-foreground">{messages.workspace}<span class="mx-3 opacity-40" aria-hidden="true">/</span><span class="text-foreground">{pageTitle}</span></p>
			<div class="header-controls">
				{#if !preview}<LanguageSelector />{/if}
				<div class="account">
					<svelte:element
						this={!preview && !viewer ? 'a' : 'div'}
						class="student-identity"
						href={!preview && !viewer ? resolve('/login') : undefined}
						role={!preview && !viewer ? undefined : 'group'}
						aria-label={!preview && !viewer ? language.messages.auth.student.title : viewer ? language.messages.auth.accountLabel : messages.studentProfile}
					>
						<span class="student-avatar" aria-hidden="true"><UserRound size={20} strokeWidth={1.5} /></span>
						<div class="student-details">
							<span class="student-name">{viewer?.name ?? messages.student}</span>
							<span class="student-description">{viewer?.email ?? language.messages.header.brandDescription}</span>
						</div>
					</svelte:element>
					{#if viewer}
						{#if viewer.role === 'admin'}
							<Button href={resolve('/admin')} variant="ghost" size="sm">{language.messages.auth.backToAdmin}</Button>
						{/if}
						<SignOutButton />
					{/if}
				</div>
			</div>
		</header>

		<div class="workspace-content">
			{@render children()}
			<footer class="workspace-footer">
				<span>{language.messages.header.brandLabel}</span>
				<span>{messages.footer}</span>
			</footer>
		</div>
	</div>
</div>

<style>
	.student-shell {
		display: grid;
		grid-template-columns: 15.5rem minmax(0, 1fr);
		min-height: 52rem;
		background: var(--background);
		color: var(--foreground);
	}

	.student-shell:not([data-preview]) { min-height: 100dvh; }

	.sidebar {
		display: flex;
		flex-direction: column;
		gap: 3rem;
		padding: 2rem 1rem;
		border-right: 1px solid var(--border);
		background: var(--card);
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-width: 0;
		text-decoration: none;
	}

	.brand img { flex-shrink: 0; border-radius: 50%; }
	.brand-name { display: block; font-family: var(--font-display); font-size: 0.75rem; overflow-wrap: anywhere; }
	.brand-description { display: block; margin-top: 0.2rem; color: var(--muted-foreground); font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.15em; }
	.workspace { min-width: 0; }
	.workspace-nav { display: flex; flex-direction: column; gap: 0.3rem; }
	.nav-group { margin: 1.5rem 0 0.4rem; padding-inline: 0.75rem; font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.12em; color: var(--muted-foreground); }
	.sidebar-footer { margin-top: auto; padding: 1rem 0.75rem 0; color: var(--muted-foreground); font-size: 0.75rem; }
	.brand-mark { font-family: var(--font-display); font-size: 1.5rem; }
	.brand-mark span { color: var(--primary); }
	.sidebar-footer p { max-width: 10rem; margin-top: 0.75rem; }

	.workspace-header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		min-height: 5rem;
		padding: 1rem clamp(1.25rem, 3vw, 3rem);
		border-bottom: 1px solid var(--border);
	}

	.header-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem; min-width: 0; max-width: 100%; }
	.account { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; min-width: 0; max-width: 100%; }
	.student-identity { display: flex; align-items: center; gap: 0.75rem; min-width: 0; max-width: 100%; }
	a.student-identity { text-decoration: none; border-radius: 0.5rem; }
	a.student-identity:hover .student-name { color: var(--primary); }
	.student-avatar { display: grid; place-items: center; flex-shrink: 0; width: 2.5rem; height: 2.5rem; border: 1px solid var(--border); border-radius: 50%; background: var(--accent); color: var(--primary); }
	.student-details { display: grid; gap: 0.1rem; min-width: 0; overflow-wrap: anywhere; }
	.student-name { font-size: 0.875rem; font-weight: 700; }
	.student-description { font-size: 0.7rem; color: var(--muted-foreground); }
	.workspace-content { max-width: 79rem; margin-inline: auto; padding: clamp(1.25rem, 3vw, 3rem); }
	.workspace-footer { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.5rem 2rem; margin-top: 3rem; padding-top: 1.25rem; border-top: 1px solid var(--border); font-size: 0.65rem; color: var(--muted-foreground); }

	@media (max-width: 56rem) {
		.student-shell { grid-template-columns: minmax(0, 1fr); }
		.sidebar { gap: 1rem; border-right: 0; border-bottom: 1px solid var(--border); padding: 1.25rem; }
		.workspace-nav { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
		.workspace-nav :global(.nav-home) { grid-column: 1 / -1; }
		.nav-group, .sidebar-footer { display: none; }
	}

	@media (max-width: 40rem) {
		.student-shell[data-preview] { min-height: auto; }
		.workspace-header, .workspace-content { padding: 1.25rem; }
		.workspace-header { gap: 0.75rem; }
		.workspace-nav { grid-template-columns: repeat(2, minmax(0, 1fr)); }
		.workspace-footer { margin-top: 2rem; }
	}
</style>
