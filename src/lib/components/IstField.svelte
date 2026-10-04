<script lang="ts">
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import type { IstField, ValidationCode } from '#lib/ist/types.ts';

	let {
		name, label, value = $bindable(''), hint, error,
		inputMode = 'numeric', autocomplete = 'off', disabled = false, required = true
	}: {
		name: IstField;
		label: string;
		value: string;
		hint?: string;
		error?: ValidationCode;
		inputMode?: 'text' | 'numeric' | 'decimal';
		autocomplete?: 'off' | 'name';
		disabled?: boolean;
		required?: boolean;
	} = $props();

	const language = useLanguage();
	const id = $derived(`ist-${name}`);
	const descriptions = $derived([hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined);
</script>

<div class="field" class:disabled>
	<label for={id}>{label}</label>
	<input
		{id} {name} type="text" inputmode={inputMode} {autocomplete} {disabled} {required}
		bind:value aria-invalid={error ? 'true' : undefined} aria-describedby={descriptions}
	/>
	{#if hint}<p class="hint" id={`${id}-hint`}>{hint}</p>{/if}
	{#if error}<p class="error" id={`${id}-error`}>{language.messages.ist.errors[error]}</p>{/if}
</div>

<style>
	.field { min-width: 0; }
	label { display: block; margin-bottom: 0.45rem; font-size: 0.875rem; font-weight: 700; }
	input { width: 100%; min-height: 2.8rem; padding: 0.7rem 0.85rem; border: 1px solid var(--color-border); border-radius: 0.5rem; background: var(--color-background); color: var(--color-text); }
	input[aria-invalid='true'] { border-color: #f0a6a6; }
	.disabled { opacity: 0.55; }
	.hint, .error { margin: 0.4rem 0 0; font-size: 0.75rem; line-height: 1.5; }
	.hint { color: var(--color-muted); }
	.error { color: #f0a6a6; }
</style>
