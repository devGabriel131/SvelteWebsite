<script lang="ts">
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import { languages } from '#lib/i18n/translations.ts';

	const language = useLanguage();
	const id = $props.id();
	const selectedIndex = $derived(languages.findIndex((option) => option.code === language.current));
</script>

<fieldset class="language-selector" lang={language.current}>
	<legend class="visually-hidden">{language.messages.language.label}</legend>
	<div class="language-options">
		<span
			class="selection-highlight"
			style:transform={`translateX(${selectedIndex * 100}%)`}
			aria-hidden="true"
		></span>
		{#each languages as option (option.code)}
			<label class="language-option" class:selected={language.current === option.code}>
				<input
					class="visually-hidden"
					type="radio"
					name={`website-language-${id}`}
					value={option.code}
					checked={language.current === option.code}
					onchange={() => language.setLanguage(option.code)}
				/>
				<span class="flag" aria-hidden="true">{option.flag}</span>
				<span aria-hidden="true">{option.short}</span>
				<span class="visually-hidden" lang={option.code}>{option.name}</span>
			</label>
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
		border: 1px solid var(--color-border);
		border-radius: 999px;
		background: var(--color-background);
	}

	.language-options {
		position: relative;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		border-radius: inherit;
	}

	.selection-highlight {
		position: absolute;
		inset: 0 auto 0 0;
		width: 50%;
		border: 1px solid var(--color-accent);
		border-radius: inherit;
		background: var(--color-accent-soft);
		pointer-events: none;
		transition: transform 180ms ease;
	}

	.language-option {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		min-width: 0;
		min-height: 2.75rem;
		border-radius: inherit;
		color: var(--color-muted);
		font-size: 0.8125rem;
		font-weight: 600;
		letter-spacing: 0.025em;
		cursor: pointer;
		transition: color 180ms ease;
	}

	.language-option:hover {
		color: var(--color-text);
	}

	.language-option.selected {
		color: var(--color-accent);
		font-weight: 700;
	}

	.language-option:has(input:focus-visible) {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	.flag {
		font-size: 1.125rem;
		line-height: 1;
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
		border: 0;
	}

	@media (prefers-reduced-motion: reduce) {
		.selection-highlight,
		.language-option {
			transition: none;
		}
	}
</style>
