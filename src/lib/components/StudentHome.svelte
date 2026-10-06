<script lang="ts" module>
	export type DesignDirection = 'focus' | 'field-notes' | 'launchpad';
</script>

<script lang="ts">
	import { asset, resolve } from '$app/paths';
	import { page } from '$app/state';
	import { ArrowRight, ArrowUpRight, BookOpen, Dumbbell, FileText, House, Zap } from '@lucide/svelte';
	import LanguageSelector from '#lib/components/LanguageSelector.svelte';
	import SignOutButton from '#lib/components/SignOutButton.svelte';
	import StudentShell from '#lib/components/StudentShell.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import { formatMessage } from '#lib/i18n/translations.ts';

	let { direction = 'focus', preview = false }: { direction?: DesignDirection; preview?: boolean } = $props();
	const language = useLanguage();
	const messages = $derived(language.messages.designPreview);
	const viewer = $derived(page.data.viewer);
	// Preview-only practice percentages, not official ASVAB standard scores.
	const sampleGrades = [
		{ key: 'wk', score: 78 },
		{ key: 'pc', score: 86 },
		{ key: 'mk', score: 72 },
		{ key: 'ar', score: 68 }
	] as const;
	const tools = $derived([
		{ key: 'math', href: resolve('/speed-math'), icon: Zap, ...messages.tools.math },
		{ key: 'vocabulary', href: resolve('/frequency'), icon: BookOpen, ...messages.tools.vocabulary },
		{ key: 'ist', href: resolve('/ist'), icon: Dumbbell, ...messages.tools.ist },
		{ key: 'attendance', href: resolve('/attendance'), icon: FileText, ...messages.tools.attendance }
	]);
</script>

{#snippet brand()}
	<a class="brand" href={resolve('/')} aria-label={language.messages.auth.studentWorkspace}>
		<img src={asset('logo.png')} alt="" width="44" height="44" />
		<span class="min-w-0">
			<span class="brand-name">{language.messages.header.brand}</span>
			<span class="brand-description">{language.messages.header.brandDescription}</span>
		</span>
	</a>
{/snippet}

{#snippet account()}
	<div class="account">
		{#if viewer}
			<span class="account-name">{viewer.name}</span>
		{/if}
		{#if viewer}
			{#if viewer.role === 'admin'}
				<Button href={resolve('/admin')} variant="ghost" size="sm">{language.messages.auth.backToAdmin}</Button>
			{/if}
			<SignOutButton />
		{:else}
			<Button href={resolve('/login')} variant="outline" class="px-4">{language.messages.auth.signIn}<ArrowUpRight aria-hidden="true" /></Button>
		{/if}
	</div>
{/snippet}

{#snippet navigation()}
	<nav class="workspace-nav" aria-label={language.messages.navigation.label}>
		<Button href={preview ? `${resolve('/design-preview')}?direction=${direction}` : resolve('/')} variant="ghost" aria-current="page" class="nav-home justify-start gap-3 px-3">
			<House aria-hidden="true" />{messages.home}
		</Button>
		{#each tools as tool (tool.key)}
			<Button href={tool.href} variant="ghost" class="justify-start gap-3 px-3 text-left">
				<tool.icon aria-hidden="true" />{tool.title}
			</Button>
		{/each}
	</nav>
{/snippet}

{#if direction === 'focus'}
	<StudentShell {preview}>
		<section aria-labelledby="mock-title" aria-describedby="grades-note">
			<Card.Root class="gap-0 rounded-2xl p-5 shadow-none sm:p-8">
				<div class="grades-heading">
					<div>
						<p class="eyebrow text-primary">{messages.focus.eyebrow}</p>
						<svelte:element this={preview ? 'h2' : 'h1'} id="mock-title" class="grades-title">{messages.focus.title}</svelte:element>
						<p class="grades-intro">{messages.focus.intro}</p>
					</div>
					<Badge variant="outline" class="h-auto whitespace-normal px-3 py-1 text-muted-foreground">{messages.focus.sampleData}</Badge>
				</div>
				<ul class="grades-grid">
					{#each sampleGrades as grade (grade.key)}
						{@const subject = messages.focus.subjects[grade.key]}
						<li class="grade-item">
							<div class="grade-ring" role="meter" aria-labelledby={`grade-${grade.key}`} aria-describedby="grades-note" aria-valuemin={0} aria-valuemax={100} aria-valuenow={grade.score} aria-valuetext={formatMessage(messages.focus.scoreText, { score: grade.score })}>
								<svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
									<circle class="grade-track" cx="60" cy="60" r="52" stroke-width="8" />
									<circle class="grade-fill" cx="60" cy="60" r="52" stroke-width="8" pathLength="100" stroke-dasharray="100" stroke-dashoffset={100 - grade.score} transform="rotate(-90 60 60)" />
								</svg>
								<div class="grade-value" aria-hidden="true">
									<strong>{formatMessage(messages.focus.score, { score: grade.score })}</strong>
									<span>{subject.code}</span>
								</div>
							</div>
							<svelte:element this={preview ? 'h3' : 'h2'} id={`grade-${grade.key}`} class="grade-subject">{subject.title}</svelte:element>
						</li>
					{/each}
				</ul>
				<p id="grades-note" class="grades-note">{messages.focus.sampleNote}</p>
			</Card.Root>
		</section>

		<section class="tool-section" aria-labelledby="practice-title">
			<div class="section-heading">
				<svelte:element this={preview ? 'h3' : 'h2'} id="practice-title" class="section-title">{messages.practice}</svelte:element>
				<p>{messages.focus.sectionHint}</p>
			</div>
			<div class="practice-grid">
				{#each tools.slice(0, 2) as tool (tool.key)}
					<Card.Root class="gap-0 rounded-2xl p-6 shadow-none">
						<div class="flex items-center justify-between gap-3">
							<span class="tool-icon"><tool.icon size={23} strokeWidth={1.5} aria-hidden="true" /></span>
							<span class="eyebrow text-muted-foreground">{tool.category}</span>
						</div>
						<svelte:element this={preview ? 'h4' : 'h3'} class="mt-5 text-xl font-bold">{tool.title}</svelte:element>
						<p class="mt-2 max-w-sm flex-1 text-sm leading-relaxed text-muted-foreground">{tool.description}</p>
						<Button href={tool.href} variant="ghost" class="mt-5 -ml-2 self-start gap-3">{tool.action}<ArrowRight aria-hidden="true" /></Button>
					</Card.Root>
				{/each}
			</div>
		</section>

		<section class="tool-section" aria-labelledby="resources-title">
			<div class="section-heading"><svelte:element this={preview ? 'h3' : 'h2'} id="resources-title" class="section-title">{messages.resources}</svelte:element></div>
			<div class="resource-grid">
				{#each tools.slice(2) as tool (tool.key)}
					<a class="resource-link" href={tool.href}>
						<tool.icon size={21} aria-hidden="true" />
						<span>{tool.title}<span class="resource-description">{tool.category}</span></span>
						<ArrowUpRight size={18} class="ml-auto shrink-0" aria-hidden="true" />
					</a>
				{/each}
			</div>
		</section>
	</StudentShell>
{:else}
	<div class="student-home" data-preview={preview ? '' : undefined} class:field-notes={direction === 'field-notes'} class:launchpad={direction === 'launchpad'}>
		<div class="workspace">
			<header class="workspace-header">
				{@render brand()}
				<div class="header-controls">
					{#if !preview}<LanguageSelector />{/if}
					{@render account()}
				</div>
			</header>

			{#if direction === 'field-notes'}
				{@render navigation()}
			{/if}

			<div class="workspace-content">
				{#if direction === 'field-notes'}
					<section class="editorial-hero" aria-labelledby="mock-title">
						<div class="editorial-copy">
							<p class="eyebrow">{messages.fieldNotes.eyebrow}</p>
							<h2 id="mock-title" class="hero-title">{messages.fieldNotes.title}</h2>
							<p class="hero-description">{messages.fieldNotes.intro}</p>
							<div class="editorial-rule" aria-hidden="true"><span></span><span></span><span></span></div>
						</div>
						<aside class="featured-practice sage-panel" aria-labelledby="featured-title">
							<p class="eyebrow">{messages.fieldNotes.featured}</p>
							<div class="math-art" aria-hidden="true"><span>+</span><span>−</span><span>×</span><span>÷</span></div>
							<h3 id="featured-title">{tools[0].title}</h3>
							<p class="mb-6 mt-2 text-sm">{tools[0].description}</p>
							<Button href={tools[0].href} class="w-full justify-between gap-4 px-4">{tools[0].action}<ArrowRight aria-hidden="true" /></Button>
						</aside>
					</section>

					<section class="editorial-tools" aria-labelledby="toolkit-title">
						<div class="section-heading">
							<h3 id="toolkit-title">{messages.allTools}</h3>
							<p>{messages.fieldNotes.sectionHint}</p>
						</div>
						{#each tools as tool, index (tool.key)}
							<a class="editorial-row" href={tool.href}>
								<span class="row-number" aria-hidden="true">0{index + 1}</span>
								<div class="row-copy"><h4>{tool.title}</h4><p>{tool.description}</p></div>
								<span class="row-category">{tool.category}</span>
								<span class="row-arrow"><ArrowUpRight size={21} aria-hidden="true" /><span class="sr-only">{messages.openTool}</span></span>
							</a>
						{/each}
					</section>
				{:else}
					<section aria-labelledby="mock-title">
						<div class="launchpad-intro">
							<span class="launchpad-symbol" aria-hidden="true"><Zap size={28} strokeWidth={1.5} /></span>
							<p class="eyebrow">{messages.launchpad.eyebrow}</p>
							<h2 id="mock-title" class="hero-title">{messages.launchpad.title}</h2>
							<p class="hero-description">{messages.launchpad.intro}</p>
						</div>
						<div class="launchpad-grid">
							{#each tools as tool, index (tool.key)}
								<Card.Root class={`launchpad-tile gap-0 rounded-2xl p-6 shadow-none ${index === 0 ? 'featured-tile' : ''}`}>
									<div class="flex items-center justify-between gap-3">
										<span class="tool-icon"><tool.icon size={26} strokeWidth={1.5} aria-hidden="true" /></span>
										<span class="eyebrow">{tool.category}</span>
									</div>
									<h3 class="mt-6 text-2xl font-bold tracking-tight">{tool.title}</h3>
									<p class="mt-2 max-w-sm flex-1 text-sm leading-relaxed text-muted-foreground">{tool.description}</p>
									<Button href={tool.href} variant={index === 0 ? 'default' : 'outline'} class="mt-6 w-full justify-between gap-4 px-4">{tool.action}<ArrowRight aria-hidden="true" /></Button>
								</Card.Root>
							{/each}
						</div>
					</section>
				{/if}

				<footer class="workspace-footer">
					<span>{language.messages.header.brandLabel}</span>
					<span>{messages.footer}</span>
				</footer>
			</div>
		</div>
	</div>
{/if}

<style>
	.student-home {
		min-height: 52rem;
		background: var(--background);
		color: var(--foreground);
	}

	.student-home:not([data-preview]) { min-height: 100dvh; }


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
	.account-name { font-size: 0.875rem; overflow-wrap: anywhere; min-width: 0; }

	.workspace-content { max-width: 79rem; margin-inline: auto; padding: clamp(1.25rem, 3vw, 3rem); }
	.eyebrow { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.14em; }
	.hero-title { font-size: clamp(2rem, 3.8vw, 3.5rem); line-height: 1.08; font-weight: 700; letter-spacing: -0.055em; text-wrap: balance; overflow-wrap: anywhere; }
	.hero-description { max-width: 33rem; margin-top: 1.25rem; font-size: 0.9375rem; line-height: 1.75; color: var(--muted-foreground); }

	.sage-panel {
		--foreground: #202a29;
		--muted-foreground: #3d4c36;
		--primary: #202a29;
		--primary-foreground: var(--brand-cream);
		--secondary: #354a3c;
		--accent: #a6b780;
		--accent-foreground: #202a29;
		--ring: #202a29;
		background: var(--brand-sage);
		color: var(--foreground);
	}

	.grades-heading { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 1rem; }
	.grades-title { margin-top: 0.5rem; font-size: clamp(1.75rem, 3vw, 2.25rem); font-weight: 700; line-height: 1.2; letter-spacing: -0.04em; }
	.grades-intro { margin-top: 0.5rem; font-size: 0.875rem; color: var(--muted-foreground); }
	.grades-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1.5rem 1rem; padding: 0; margin: 2rem 0; list-style: none; }
	.grade-item { min-width: 0; text-align: center; }
	.grade-ring { position: relative; width: min(100%, 10rem); aspect-ratio: 1; margin-inline: auto; }
	.grade-ring svg { display: block; width: 100%; height: 100%; }
	.grade-track { stroke: var(--border); }
	.grade-fill { stroke: var(--primary); stroke-linecap: round; }
	.grade-value { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.2rem; }
	.grade-value strong { font-size: clamp(1.4rem, 2.5vw, 2rem); line-height: 1.2; font-variant-numeric: tabular-nums; letter-spacing: -0.04em; }
	.grade-value span { color: var(--primary); font-size: 0.75rem; font-weight: 700; letter-spacing: 0.12em; }
	.grade-subject { max-width: 12rem; margin: 0.875rem auto 0; font-size: 0.875rem; font-weight: 500; text-wrap: balance; }
	.grades-note { padding-top: 1rem; border-top: 1px solid var(--border); color: var(--muted-foreground); font-size: 0.75rem; line-height: 1.6; }
	.tool-section { margin-top: 2rem; }
	.section-heading { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 0.5rem 1rem; margin-bottom: 1rem; }
	.section-heading h3, .section-title { font-size: 1rem; font-weight: 700; }
	.section-heading p { font-size: 0.75rem; color: var(--muted-foreground); }
	.practice-grid, .resource-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
	.tool-icon { display: grid; place-items: center; width: 3rem; height: 3rem; flex-shrink: 0; border: 1px solid var(--border); border-radius: 0.875rem; color: var(--primary); background: var(--accent); }
	.resource-link { display: flex; align-items: center; gap: 1rem; padding: 1.2rem; border: 1px solid var(--border); border-radius: 0.8rem; font-size: 0.875rem; text-decoration: none; }
	.resource-link > :global(svg:first-child) { flex-shrink: 0; color: var(--secondary); }
	.resource-link:hover { background: var(--accent); border-color: var(--primary); }
	.resource-description { display: block; margin-top: 0.15rem; font-size: 0.7rem; color: var(--muted-foreground); }
	.workspace-footer { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.5rem 2rem; margin-top: 3rem; padding-top: 1.25rem; border-top: 1px solid var(--border); font-size: 0.65rem; color: var(--muted-foreground); }

	/* Theme overrides stay inside this mock; the live application remains dark. */
	.field-notes {
		--background: var(--brand-cream);
		--foreground: #202a29;
		--card: #fffbef;
		--card-foreground: var(--foreground);
		--primary: #354a3c;
		--primary-foreground: var(--brand-cream);
		--secondary: #3d5d67;
		--secondary-foreground: var(--brand-cream);
		--muted: #eae5d1;
		--muted-foreground: #5b6259;
		--destructive: #a12d36;
		--accent: #e2e5cb;
		--accent-foreground: #354a3c;
		--border: #c8c8b5;
		--ring: #354a3c;
		color-scheme: light;
	}

	.field-notes .workspace-header { max-width: 82rem; margin-inline: auto; border-bottom: 0; padding-block: 1.5rem; }
	.field-notes .workspace-nav { flex-direction: row; flex-wrap: wrap; gap: 0.25rem 1rem; padding: 0.75rem clamp(1.25rem, 3vw, 3rem); border-block: 1px solid var(--border); justify-content: center; }
	.field-notes .workspace-content { max-width: 76rem; }
	.editorial-hero { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 0.8fr); align-items: center; gap: clamp(2rem, 6vw, 6rem); padding-block: 1.5rem 3rem; }
	.editorial-copy .eyebrow { color: var(--primary); }
	.editorial-copy .hero-title { max-width: 11ch; margin-top: 1.5rem; font-size: clamp(2.8rem, 5.7vw, 5rem); }
	.editorial-copy .hero-description { max-width: 29rem; }
	.editorial-rule { display: flex; width: 7.5rem; height: 0.3rem; gap: 0.3rem; margin-top: 2rem; }
	.editorial-rule span { flex: 1; background: var(--brand-sage); }
	.editorial-rule span:nth-child(2) { background: var(--brand-slate); }
	.editorial-rule span:nth-child(3) { background: var(--foreground); }
	.featured-practice { padding: 1.75rem; border: 1px solid #354a3c26; border-radius: 0.5rem; }
	.featured-practice h3 { font-size: 1.65rem; font-weight: 700; letter-spacing: -0.04em; }
	.math-art { display: grid; grid-template-columns: repeat(2, 3.3rem); gap: 0.4rem; justify-content: center; margin: 1.5rem 0 2rem; transform: rotate(-8deg); }
	.math-art span { display: grid; place-items: center; height: 3.3rem; border: 1px solid #354a3c40; border-radius: 0.4rem; font-size: 2rem; line-height: 1; }
	.math-art span:nth-child(2), .math-art span:nth-child(3) { background: #354a3c12; }
	.editorial-tools .section-heading { padding-bottom: 1rem; border-bottom: 2px solid var(--foreground); margin: 0; }
	.editorial-row { display: flex; align-items: center; gap: 1.5rem; padding: 1.5rem 0.5rem; border-bottom: 1px solid var(--border); text-decoration: none; }
	.editorial-row:hover { background: var(--accent); }
	.row-number { color: var(--muted-foreground); font-family: var(--font-mono); font-size: 0.7rem; }
	.row-copy { flex: 1; min-width: 0; }
	.row-copy h4 { font-size: 1.125rem; font-weight: 700; letter-spacing: -0.025em; }
	.row-copy p { margin-top: 0.25rem; font-size: 0.8rem; color: var(--muted-foreground); }
	.row-category { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted-foreground); }
	.row-arrow { display: grid; flex-shrink: 0; place-items: center; width: 2.75rem; height: 2.75rem; border: 1px solid var(--border); border-radius: 50%; }

	.launchpad { background: radial-gradient(ellipse at 50% 0, color-mix(in srgb, var(--brand-slate) 12%, transparent), transparent 65%), var(--background); }
	.launchpad .workspace-header { max-width: 78rem; margin-inline: auto; }
	.launchpad .workspace-content { max-width: 62rem; }
	.launchpad-intro { max-width: 42rem; margin: 0 auto 2.5rem; text-align: center; }
	.launchpad-symbol { display: grid; place-items: center; width: 3.5rem; height: 3.5rem; margin: 0 auto 1.25rem; color: var(--primary); border: 1px solid var(--border); border-radius: 1rem; background: var(--accent); }
	.launchpad-intro .eyebrow { color: var(--secondary); }
	.launchpad-intro .hero-title { margin-top: 0.75rem; font-size: clamp(2rem, 4vw, 3rem); }
	.launchpad-intro .hero-description { margin: 0.75rem auto 0; }
	.launchpad-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
	.launchpad :global(.featured-tile) { background: color-mix(in srgb, var(--brand-sage) 10%, var(--card)); --border: color-mix(in srgb, var(--brand-sage) 50%, transparent); }
	.launchpad-grid .eyebrow { color: var(--muted-foreground); }
	.launchpad :global(.launchpad-tile:nth-child(2) .tool-icon) { color: var(--brand-slate); background: color-mix(in srgb, var(--brand-slate) 12%, transparent); }

	@media (max-width: 70rem) {
		.resource-grid { grid-template-columns: minmax(0, 1fr); }
	}

	@media (max-width: 56rem) {

		.editorial-hero { gap: 2rem; grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr); }
		.row-category { display: none; }
	}

	@media (max-width: 40rem) {
		.student-home[data-preview] { min-height: auto; }
		.workspace-header, .workspace-content { padding: 1.25rem; }
		.workspace-header { gap: 0.75rem; }

		.practice-grid, .resource-grid, .launchpad-grid, .editorial-hero { grid-template-columns: minmax(0, 1fr); }
		.hero-title { font-size: 2.25rem; }
		.grades-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
		.grade-subject { font-size: 0.75rem; }
		.field-notes .workspace-nav { justify-content: flex-start; gap: 0.25rem; padding: 0.75rem; }
		.editorial-hero { padding-top: 0.5rem; }
		.editorial-copy .hero-title { max-width: 14ch; font-size: 3rem; }
		.featured-practice { padding: 1.5rem; }
		.math-art { margin-block: 1.25rem; }
		.editorial-row { gap: 0.75rem; }
		.row-number { display: none; }
		.row-copy h4 { font-size: 1rem; }
		.row-arrow { width: 2.25rem; height: 2.25rem; }
		.launchpad-intro { margin-block: 0.5rem 2rem; }
		.workspace-footer { margin-top: 2rem; }
	}
</style>
