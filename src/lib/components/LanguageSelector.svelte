<script lang="ts">
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import { languages } from '#lib/i18n/translations.ts';
	import { Label } from '#lib/components/ui/label/index.js';
	import { buttonVariants } from '#lib/components/ui/button/index.js';

	const language = useLanguage();
	const id = $props.id();
</script>

<fieldset class="language-selector">
	<legend class="sr-only">{language.messages.language.label}</legend>
	<div class="language-options">
		{#each languages as option (option.code)}
			<Label class={buttonVariants({ variant: 'ghost', class: 'relative min-w-0 gap-2 rounded-full px-0 text-[0.8125rem] tracking-[0.025em] font-bold cursor-pointer' })}>
				<input
					class="sr-only"
					type="radio"
					name={`website-language-${id}`}
					value={option.code}
					checked={language.current === option.code}
					onchange={() => language.setLanguage(option.code)}
				/>
				<span class="flag" aria-hidden="true">{option.flag}</span>
				<span aria-hidden="true">{option.short}</span>
				<span class="sr-only" lang={option.code}>{option.name}</span>
			</Label>
		{/each}
	</div>
</fieldset>

<style>
	.language-selector {
		flex-shrink: 0;
		width: 10.5rem;
		min-width: 0;
		max-width: 100%;
		margin: 0;
		padding: 0.25rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--background);
	}

	.language-options {
		position: relative;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		border-radius: inherit;
	}


	.flag {
		font-size: 1.125rem;
		line-height: 1;
	}


</style>
