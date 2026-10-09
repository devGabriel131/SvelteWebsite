<script lang="ts">
	import { BookOpen, ArrowRight, ArrowLeft } from '@lucide/svelte';

	import { Button } from '#lib/components/ui/button/index.js';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	const language = useLanguage();
	const m = $derived(language.messages.coursesPreview);

	let selected = $state<number | null>(null);
	const groups = $derived([
		{ title: m.foundations, start: 0, end: 3 },
		{ title: m.mixed, start: 3, end: 7 },
		{ title: m.review, start: 7, end: 9 }
	]);
	let lessonHeading = $state<HTMLHeadingElement>();
	function openTopic(index: number) {
		selected = index;
		requestAnimationFrame(() => lessonHeading?.focus());
	}
</script>

<svelte:head>
	<title>{m.pageTitle}</title>
	<meta name="description" content={m.description} />
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

	<section class="course">
		<header class="course-heading"><p class="eyebrow">{m.part}</p><h1>{m.course}</h1><p>{m.intro}</p></header>
		{#if selected === null}
			<div class="library">
				{#each groups as group}
					<section class="topic-group">
						<h2>{group.title}</h2>
						{#each m.topics.slice(group.start, group.end) as topic, offset}
							<button class="topic-card" onclick={() => openTopic(group.start + offset)}>
								<span class="number">{String(group.start + offset + 1).padStart(2, '0')}</span>
								<span><strong>{topic}</strong><small>{m.open}</small></span><ArrowRight size={18} aria-hidden="true" />
							</button>
						{/each}
					</section>
				{/each}
			</div>
		{:else}
			<div class="lesson-column">
					<Button variant="ghost" onclick={() => selected = null}><ArrowLeft aria-hidden="true" />{m.back}</Button>
					<article class="lesson">
						<p class="eyebrow">{m.lesson} · {String(selected + 1).padStart(2, '0')}</p>
						<h2 tabindex="-1" bind:this={lessonHeading}>{m.topics[selected]}</h2>
						<div class="document-placeholder"><BookOpen size={32} aria-hidden="true" /><h3>{m.placeholder}</h3><p>{m.body}</p><div class="skeleton" aria-hidden="true"><span></span><span></span><span></span></div></div>
						<aside class="interactive"><p class="eyebrow">{m.interactive}</p><p>{m.interactiveNote}</p></aside>
					</article>
					<div class="lesson-navigation"><Button variant="outline" disabled={selected === 0} onclick={openTopic.bind(null, selected - 1)}><ArrowLeft aria-hidden="true" />{m.previous}</Button><Button variant="outline" disabled={selected === m.topics.length - 1} onclick={openTopic.bind(null, selected + 1)}>{m.next}<ArrowRight aria-hidden="true" /></Button></div>
			</div>
		{/if}
	</section>

<style>

	.eyebrow { color: var(--primary); font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.13em; }


	.course { max-width: 78rem; margin-inline: auto; padding: clamp(1rem, 3vw, 3rem); }
	.course-heading { margin-bottom: 2rem; }
	h1 { font-size: clamp(1.75rem, 3vw, 2.75rem); font-weight: 700; letter-spacing: -0.04em; margin-block: 0.5rem; }
	.course-heading > p:last-child { color: var(--muted-foreground); }
	.library { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1.25rem; }
	.topic-group h2 { font-weight: 600; margin-bottom: 1rem; }
	.topic-card { display: flex; align-items: center; gap: 1rem; width: 100%; text-align: left; padding: 1.25rem; margin-bottom: 0.75rem; border: 1px solid var(--border); border-radius: 0.75rem; background: var(--card); min-height: 7rem; cursor: pointer; }
	.topic-card:hover { border-color: var(--primary); background: var(--accent); }
	.topic-card > span:nth-child(2) { flex: 1; }
	.topic-card strong { display: block; font-size: 0.9rem; font-weight: 600; }
	.topic-card small { display: block; margin-top: 0.75rem; color: var(--muted-foreground); }
	.number { font-size: 0.75rem; font-family: var(--font-mono, monospace); color: var(--primary); }

	.lesson-column { min-width: 0; }
	.lesson { padding: clamp(1.25rem, 3vw, 2.5rem); border: 1px solid var(--border); background: var(--card); border-radius: 0.75rem; }
	.lesson h2 { font-size: clamp(1.4rem, 2vw, 2rem); font-weight: 600; margin-top: 0.75rem; }
	.document-placeholder { margin-block: 2.5rem; max-width: 40rem; }
	.document-placeholder > :global(svg) { color: var(--muted-foreground); }
	h3 { font-weight: 600; margin-block: 1rem 0.5rem; }
	.document-placeholder p, .interactive > p:last-child { color: var(--muted-foreground); font-size: 0.9rem; line-height: 1.8; }
	.skeleton { display: grid; gap: 0.75rem; margin-top: 2rem; }
	.skeleton span { height: 0.5rem; background: var(--muted); border-radius: 1rem; }
	.skeleton span:last-child { width: 65%; }
	.interactive { padding: 1.5rem; border: 1px dashed var(--border); border-radius: 0.5rem; }
	.interactive > p:last-child { margin-top: 0.5rem; }
	.lesson-navigation { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.75rem; margin-top: 1rem; }
	button:focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; }
	@media (max-width: 70rem) { .library { grid-template-columns: minmax(0, 1fr); } }

</style>
