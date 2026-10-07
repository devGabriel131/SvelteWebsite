<script lang="ts">
	import { resolve } from '$app/paths';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import FlowPreview from '#lib/bootcamp/mockups/FlowPreview.svelte';
	import { designs, type PreviewDesign } from '#lib/bootcamp/mockups/model.ts';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
	const language = useLanguage();
	const m = $derived(language.messages.bootcampMockups);
	let design = $state<PreviewDesign>('editorial');
</script>

<svelte:head>
	<title>{m.pageTitle}</title>
	<meta name="description" content={m.description} />
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="collection" lang={language.current}>
	<header>
		<div><p class="eyebrow">{m.eyebrow}</p><h1>{m.title}</h1></div>
		<a href={resolve('/admin/bootcamps')}>← {m.back}</a>
	</header>
	<div class="notice"><strong>{m.demo}</strong><span>{m.notice}</span></div>
	<div class="designs" role="group" aria-label={m.designs}>
		{#each designs as option, i}
			<button type="button" class:selected={design === option} aria-pressed={design === option} onclick={() => design = option}>
				<span class="number">0{i + 1}</span><span><strong>{m[option]}</strong><small>{m[`${option}Hint`]}</small></span>
			</button>
		{/each}
	</div>
	<FlowPreview {design} roster={data.roster} />
</div>

<style>
	.collection { max-width: 1440px; margin: 0 auto; padding: clamp(16px, 3vw, 40px); color: var(--foreground); }
	header { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 22px; }
	h1 { font-size: clamp(24px, 3vw, 34px); font-weight: 650; letter-spacing: -.04em; }
	.eyebrow { text-transform: uppercase; font-size: 10px; letter-spacing: .18em; color: var(--muted-foreground); margin-bottom: 6px; }
	a { font-size: 13px; text-decoration: underline; text-underline-offset: 4px; }
	.notice { display: flex; gap: 12px; align-items: center; font-size: 12px; color: var(--muted-foreground); margin-bottom: 22px; }
	.notice strong { border: 1px solid var(--border); border-radius: 5px; padding: 3px 7px; color: var(--foreground); }
	.designs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 26px; }
	button { text-align: left; display: flex; align-items: center; gap: 12px; padding: 16px; border: 1px solid var(--border); border-radius: 12px; background: var(--card); cursor: pointer; }
	button.selected { border-color: var(--foreground); box-shadow: inset 0 0 0 1px var(--foreground); }
	.number { font-size: 11px; color: var(--muted-foreground); }
	strong { display: block; font-size: 13px; } small { display: block; font-size: 11px; color: var(--muted-foreground); margin-top: 4px; }
	button:focus-visible, a:focus-visible { outline: 2px solid var(--ring); outline-offset: 4px; }
	@media(max-width: 700px) { .designs { grid-template-columns: 1fr; } button { padding: 10px 14px; } header { align-items: start; } }
</style>
