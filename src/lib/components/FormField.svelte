<script lang="ts">
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';

	let {
		name, id = `field-${name}`, label, value = $bindable(''), hint, error,
		type = 'text', inputMode = 'text', autocomplete = 'off', disabled = false,
		required = true, maxLength, min, max
	}: {
		name: string;
		id?: string;
		label: string;
		value: string;
		hint?: string;
		error?: string;
		type?: 'text' | 'date';
		inputMode?: 'text' | 'numeric' | 'decimal';
		autocomplete?: 'off' | 'name' | 'organization' | 'organization-title';
		disabled?: boolean;
		required?: boolean;
		maxLength?: number;

		min?: string;
		max?: string;
	} = $props();

	const descriptions = $derived([
		hint ? `${id}-hint` : '', error ? `${id}-error` : ''
	].filter(Boolean).join(' ') || undefined);
</script>

<div class="field" class:disabled>
	<Label class="mb-[0.45rem] block text-sm font-bold leading-normal" for={id}>{label}</Label>
	<Input {id} {name} {type} inputmode={inputMode} {autocomplete} {disabled} {required}
		maxlength={maxLength} {min} {max} bind:value
		aria-invalid={error ? 'true' : undefined} aria-describedby={descriptions} />
	{#if hint}<p class="hint" id={`${id}-hint`}>{hint}</p>{/if}
	{#if error}<p class="error" id={`${id}-error`}>{error}</p>{/if}
</div>

<style>
	.field { min-width: 0; }
	.disabled { opacity: 0.55; }
	.hint, .error { margin: 0.4rem 0 0; font-size: 0.75rem; line-height: 1.5; }
	.hint { color: var(--muted-foreground); }
	.error { color: #f0a6a6; }
</style>
