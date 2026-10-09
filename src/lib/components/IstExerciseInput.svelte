<script lang="ts">
	import { onMount } from 'svelte';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import { exerciseValueFields, type ExerciseKey, type IstErrors, type IstFormValues } from '#lib/ist/types.ts';
	import ChoiceGroup from './ChoiceGroup.svelte';
	import FormField from './FormField.svelte';

	let { exercise, values = $bindable(), errors }: {
		exercise: ExerciseKey;
		values: IstFormValues;
		errors: IstErrors;
	} = $props();

	const language = useLanguage();
	let enhanced = $state(false);
	onMount(() => { enhanced = true; });
	const messages = $derived(language.messages.ist);
	const statusField = $derived(`${exercise}Status` as const);
	const fields = $derived(exerciseValueFields[exercise]);
	const timed = $derived(fields.length === 2);
	const recorded = $derived(values[statusField] === 'recorded');

	function changeStatus(event: Event) {
		if ((event.currentTarget as HTMLInputElement).value !== 'recorded') {
			for (const field of fields) values[field] = '';
		}
	}
</script>

<fieldset class="exercise">
	<legend>{messages.categories[exercise]}</legend>
	<ChoiceGroup name={statusField} id={`ist-${statusField}`} label={messages.completion} hideLabel bind:value={values[statusField]}
		error={errors[statusField] ? messages.errors[errors[statusField]] : undefined}
		onchange={changeStatus} submitName={enhanced ? undefined : 'exerciseChoice'}
		choices={[
			{ value: 'recorded', label: messages.recorded },
			{ value: 'unable_to_complete', label: messages.unable }
		]} />
	<div class="exercise-values" class:timed>
		{#each fields as field, index (field)}
			<FormField name={field} id={`ist-${field}`} inputMode="numeric"
				label={timed ? (index === 0 ? messages.minutes : messages.seconds) : messages.repetitions}
				bind:value={values[field]}
				hint={timed ? (index === 0 ? messages.hints.minutes : messages.hints.seconds) : messages.hints.repetitions}
				error={errors[field] ? messages.errors[errors[field]] : undefined}
				disabled={!recorded} required={recorded} />
		{/each}
	</div>
	{#if timed}<p class="duration-hint">{messages.hints.duration}</p>{/if}
</fieldset>

<style>
	.exercise {
		min-width: 0;
		margin: 0;
		padding: 1rem 1.1rem 1.2rem;
		border: 1px solid var(--border);
		border-radius: 0.75rem;
	}

	legend {
		padding-inline: 0.35rem;
		color: var(--primary);
		font-weight: 700;
		font-size: 0.9375rem;
	}

	.exercise-values {
		margin-top: 1rem;
	}

	/* Enhanced radios and native submit buttons share the same selected appearance. */
	.exercise:not(:has(:global(input[value='recorded']:checked), :global(button[value$=':recorded'][aria-pressed='true']))) .exercise-values {
		filter: blur(2px);
		opacity: 0.5;
		pointer-events: none;
		user-select: none;
	}

	.timed {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.8rem;
	}

	.duration-hint {
		margin: 0.4rem 0 0;
		color: var(--muted-foreground);
		font-size: 0.75rem;
		line-height: 1.5;
	}
</style>
