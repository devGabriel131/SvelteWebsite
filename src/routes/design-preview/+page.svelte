<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { ArrowLeft } from '@lucide/svelte';
	import LanguageSelector from '#lib/components/LanguageSelector.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import StudentHome, { type DesignDirection } from '#lib/components/StudentHome.svelte';

	const language = useLanguage();
	const directions: DesignDirection[] = ['focus', 'field-notes', 'launchpad'];
	const messages = $derived(language.messages.designPreview);
	const direction = $derived.by((): DesignDirection => {
		const requested = page.url.searchParams.get('direction');
		return requested === 'field-notes' || requested === 'launchpad' ? requested : 'focus';
	});
</script>

<svelte:head>
	<title>{messages.pageTitle}</title>
	<meta name="description" content={messages.description} />
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="preview-controls">
	<div class="preview-heading">
		<div>
			<p class="text-xs font-bold uppercase tracking-[0.18em] text-primary">{messages.label}</p>
			<h1 class="mt-1 text-xl font-bold tracking-tight">{messages.title}</h1>
		</div>
		<div class="flex flex-wrap items-center gap-3">
			<LanguageSelector />
			<Button href={resolve('/')} variant="ghost" size="sm">
				<ArrowLeft aria-hidden="true" />{messages.back}
			</Button>
		</div>
	</div>
	<nav class="direction-buttons" aria-label={messages.chooseDirection}>
		{#each directions as option, index (option)}
			<Button
				href={`${resolve('/design-preview')}?direction=${option}`}
				variant="outline"
				aria-current={direction === option ? 'true' : undefined}
				class="justify-start gap-3 px-4 py-3 aria-[current=true]:border-primary aria-[current=true]:bg-accent aria-[current=true]:text-primary"
				data-sveltekit-noscroll
				data-sveltekit-keepfocus
			>
				<span class="font-mono text-xs opacity-60" aria-hidden="true">0{index + 1}</span>
				{messages.directions[option].name}
				{#if option === 'focus'}
					<span class="ml-auto rounded-full bg-primary/10 px-2 py-1 text-[0.65rem] text-primary">{messages.recommendation}</span>
				{/if}
			</Button>
		{/each}
	</nav>
	<div class="preview-description" aria-live="polite" aria-atomic="true">
		<p class="text-sm">{messages.directions[direction].summary}</p>
		<p class="mt-1 text-xs text-muted-foreground">{messages.directions[direction].tradeoff}</p>
	</div>
	<p class="mt-3 text-xs text-muted-foreground">{messages.note}</p>
</div>

<StudentHome {direction} preview />

<style>
	.preview-controls {
		padding: 1.5rem clamp(1rem, 3vw, 3rem);
		border-bottom: 1px solid var(--border);
		background: var(--background);
	}

	.preview-heading {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.direction-buttons {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.5rem;
		max-width: 66rem;
		margin-top: 1.25rem;
	}

	.preview-description {
		max-width: 70rem;
		margin-top: 1rem;
	}

	@media (max-width: 42rem) {
		.direction-buttons {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
