<script lang="ts">
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import type { IstField, ValidationCode } from '#lib/ist/types.ts';

	let { name, label, choices, value = $bindable(''), error, onchange, hideLabel = false }: {
		name: IstField;
		label: string;
		hideLabel?: boolean;
		choices: readonly { value: string; label: string }[];
		value: string;
		error?: ValidationCode;
		onchange?: (event: Event) => void;
	} = $props();

	const language = useLanguage();
	const errorId = $derived(`ist-${name}-error`);
</script>

<fieldset class="choice-group" role="radiogroup" aria-required="true"
	aria-invalid={error ? 'true' : undefined} aria-describedby={error ? errorId : undefined}>
	<legend class:visually-hidden={hideLabel}>{label}</legend>
	<div class="choice-buttons">
		{#each choices as choice (choice.value)}
			<label class="choice-option">
				<input class="visually-hidden" type="radio" {name} value={choice.value}
					bind:group={value} {onchange} required aria-describedby={error ? errorId : undefined} />
				<span>{choice.label}</span>
				<svg class="selection-check" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path d="m5 12 4 4L19 6" />
				</svg>
			</label>
		{/each}
	</div>
</fieldset>
{#if error}<p class="error" id={errorId}>{language.messages.ist.errors[error]}</p>{/if}

<style>
	.choice-group {
		min-width: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}

	legend {
		margin-bottom: 0.45rem;
		padding: 0;
		font-size: 0.875rem;
		font-weight: 700;
	}

	.choice-buttons {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.5rem;
	}

	.choice-option {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		min-width: 0;
		min-height: 3.25rem;
		padding: 0.65rem;
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		background: var(--color-background);
		color: var(--color-muted);
		font-size: 0.8125rem;
		font-weight: 700;
		text-align: center;
		cursor: pointer;
	}

	.choice-option:hover {
		border-color: var(--color-accent);
		color: var(--color-text);
	}

	.choice-option:has(input:checked) {
		border-color: var(--color-accent);
		box-shadow: inset 0 0 0 1px var(--color-accent);
		background: var(--color-accent-soft);
		color: var(--color-accent);
	}

	.choice-option:has(input:focus-visible) {
		outline: 2px solid var(--color-accent);
		outline-offset: 3px;
	}

	.choice-group[aria-invalid='true'] .choice-option {
		border-color: #f0a6a6;
	}

	.choice-option:has(input:disabled) {
		cursor: wait;
	}

	.selection-check {
		flex-shrink: 0;
		width: 0.9rem;
		height: 0.9rem;
		stroke: currentColor;
		stroke-width: 2.5;
		stroke-linecap: round;
		stroke-linejoin: round;
		display: none;
	}

	.choice-option:has(input:checked) .selection-check {
		display: block;
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

	.error {
		margin: 0.4rem 0 0;
		color: #f0a6a6;
		font-size: 0.75rem;
		line-height: 1.5;
	}
</style>
