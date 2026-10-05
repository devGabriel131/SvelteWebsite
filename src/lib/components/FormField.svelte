<script lang="ts">
	let {
		name, id = `field-${name}`, label, value = $bindable(''), hint, error,
		type = 'text', inputMode = 'text', autocomplete = 'off', disabled = false,
		required = true, maxLength, options, chooseLabel, min, max
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
		options?: readonly { value: string; label: string }[];
		chooseLabel?: string;
		min?: string;
		max?: string;
	} = $props();

	const descriptions = $derived([
		hint ? `${id}-hint` : '', error ? `${id}-error` : ''
	].filter(Boolean).join(' ') || undefined);
</script>

<div class="field" class:disabled>
	<label for={id}>{label}</label>
	{#if options}
		<select {id} {name} {disabled} {required} bind:value
			aria-invalid={error ? 'true' : undefined} aria-describedby={descriptions}>
			{#if chooseLabel}<option value="">{chooseLabel}</option>{/if}
			{#each options as option (option.value)}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>
	{:else}
		<input {id} {name} {type} inputmode={inputMode} {autocomplete} {disabled} {required}
			maxlength={maxLength} {min} {max} bind:value
			aria-invalid={error ? 'true' : undefined} aria-describedby={descriptions} />
	{/if}
	{#if hint}<p class="hint" id={`${id}-hint`}>{hint}</p>{/if}
	{#if error}<p class="error" id={`${id}-error`}>{error}</p>{/if}
</div>

<style>
	.field { min-width: 0; }
	label { display: block; margin-bottom: 0.45rem; font-size: 0.875rem; font-weight: 700; }
	input, select { width: 100%; min-height: 2.8rem; padding: 0.7rem 0.85rem; border: 1px solid var(--color-border); border-radius: 0.5rem; background: var(--color-background); color: var(--color-text); }
	[aria-invalid='true'] { border-color: #f0a6a6; }
	.disabled { opacity: 0.55; }
	.hint, .error { margin: 0.4rem 0 0; font-size: 0.75rem; line-height: 1.5; }
	.hint { color: var(--color-muted); }
	.error { color: #f0a6a6; }
</style>
