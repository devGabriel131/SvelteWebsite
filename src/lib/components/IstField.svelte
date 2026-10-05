<script lang="ts">
	import FormField from './FormField.svelte';
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
</script>

<FormField {name} id={`ist-${name}`} {label} bind:value {hint} {inputMode} {autocomplete} {disabled} {required}
	error={error ? language.messages.ist.errors[error] : undefined} />
