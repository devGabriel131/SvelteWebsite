<script lang="ts">
	import ChoiceGroup from './ChoiceGroup.svelte';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import type { IstField, ValidationCode } from '#lib/ist/types.ts';

	let { name, label, choices, value = $bindable(''), error, onchange, hideLabel = false, submitName }: {
		name: IstField;
		label: string;
		hideLabel?: boolean;
		submitName?: string;
		choices: readonly { value: string; label: string }[];
		value: string;
		error?: ValidationCode;
		onchange?: (event: Event) => void;
	} = $props();

	const language = useLanguage();
</script>

<ChoiceGroup {name} id={`ist-${name}`} {label} {choices} bind:value {onchange} {hideLabel} {submitName}
	error={error ? language.messages.ist.errors[error] : undefined} />
