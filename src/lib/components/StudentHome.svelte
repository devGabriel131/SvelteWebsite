<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowRight, ArrowUpRight } from '@lucide/svelte';
	import { studentTools } from '#lib/components/StudentShell.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import { formatMessage } from '#lib/i18n/translations.ts';

	const language = useLanguage();
	const grades = $derived(language.messages.home.grades);
	const navigation = $derived(language.messages.navigation);
	// Illustrative practice percentages, not official ASVAB standard scores.
	const sampleGrades = [
		{ key: 'wk', score: 78 },
		{ key: 'pc', score: 86 },
		{ key: 'mk', score: 72 },
		{ key: 'ar', score: 68 }
	] as const;
	const tools = $derived(studentTools.map((tool) => ({
		...tool, href: resolve(tool.route), ...navigation.tools[tool.key]
	})));
</script>

<section aria-labelledby="grades-title" aria-describedby="grades-note">
	<Card.Root class="gap-0 rounded-2xl p-5 shadow-none sm:p-8">
		<div class="grades-heading">
			<div>
				<p class="eyebrow text-primary">{grades.eyebrow}</p>
				<h1 id="grades-title" class="grades-title">{grades.title}</h1>
				<p class="grades-intro">{grades.intro}</p>
			</div>
			<Badge variant="outline" class="h-auto whitespace-normal px-3 py-1 text-muted-foreground">{grades.sampleData}</Badge>
		</div>
		<ul class="grades-grid">
			{#each sampleGrades as grade (grade.key)}
				{@const subject = grades.subjects[grade.key]}
				<li class="grade-item">
					<div class="grade-ring" role="meter" aria-labelledby={`grade-${grade.key}`} aria-describedby="grades-note" aria-valuemin={0} aria-valuemax={100} aria-valuenow={grade.score} aria-valuetext={formatMessage(grades.scoreText, { score: grade.score })}>
						<svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
							<circle class="grade-track" cx="60" cy="60" r="52" stroke-width="8" />
							<circle class="grade-fill" cx="60" cy="60" r="52" stroke-width="8" pathLength="100" stroke-dasharray="100" stroke-dashoffset={100 - grade.score} transform="rotate(-90 60 60)" />
						</svg>
						<div class="grade-value" aria-hidden="true">
							<strong>{formatMessage(grades.score, { score: grade.score })}</strong>
							<span>{subject.code}</span>
						</div>
					</div>
					<h2 id={`grade-${grade.key}`} class="grade-subject">{subject.title}</h2>
				</li>
			{/each}
		</ul>
		<p id="grades-note" class="grades-note">{grades.sampleNote}</p>
	</Card.Root>
</section>

<section class="tool-section" aria-labelledby="practice-title">
	<div class="section-heading">
		<h2 id="practice-title" class="section-title">{navigation.practice}</h2>
		<p>{grades.sectionHint}</p>
	</div>
	<div class="practice-grid">
		{#each tools.slice(0, 2) as tool (tool.key)}
			<Card.Root class="gap-0 rounded-2xl p-6 shadow-none">
				<div class="flex items-center justify-between gap-3">
					<span class="tool-icon"><tool.icon size={23} strokeWidth={1.5} aria-hidden="true" /></span>
					<span class="eyebrow text-muted-foreground">{tool.category}</span>
				</div>
				<h3 class="mt-5 text-xl font-bold">{tool.title}</h3>
				<p class="mt-2 max-w-sm flex-1 text-sm leading-relaxed text-muted-foreground">{tool.description}</p>
				<Button href={tool.href} variant="ghost" class="mt-5 -ml-2 self-start gap-3">{tool.action}<ArrowRight aria-hidden="true" /></Button>
			</Card.Root>
		{/each}
	</div>
</section>

<section class="tool-section" aria-labelledby="resources-title">
	<div class="section-heading"><h2 id="resources-title" class="section-title">{navigation.resources}</h2></div>
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

<style>
	.eyebrow { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.14em; }
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
	.section-title { font-size: 1rem; font-weight: 700; }
	.section-heading p { font-size: 0.75rem; color: var(--muted-foreground); }
	.practice-grid, .resource-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
	.tool-icon { display: grid; place-items: center; width: 3rem; height: 3rem; flex-shrink: 0; border: 1px solid var(--border); border-radius: 0.875rem; color: var(--primary); background: var(--accent); }
	.resource-link { display: flex; align-items: center; gap: 1rem; padding: 1.2rem; border: 1px solid var(--border); border-radius: 0.8rem; font-size: 0.875rem; text-decoration: none; }
	.resource-link > :global(svg:first-child) { flex-shrink: 0; color: var(--secondary); }
	.resource-link:hover { background: var(--accent); border-color: var(--primary); }
	.resource-description { display: block; margin-top: 0.15rem; font-size: 0.7rem; color: var(--muted-foreground); }

	@media (max-width: 70rem) {
		.resource-grid { grid-template-columns: minmax(0, 1fr); }
	}

	@media (max-width: 40rem) {
		.practice-grid, .resource-grid { grid-template-columns: minmax(0, 1fr); }
		.grades-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
		.grade-subject { font-size: 0.75rem; }
	}
</style>
