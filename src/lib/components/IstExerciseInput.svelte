<script lang="ts">
	import { onMount } from 'svelte';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import type { ExerciseKey, IstErrors, IstField as FieldName, IstFormValues } from '#lib/ist/types.ts';
	import IstChoiceGroup from './IstChoiceGroup.svelte';
	import IstField from './IstField.svelte';

	let { exercise, values = $bindable(), errors }: {
		exercise: ExerciseKey;
		values: IstFormValues;
		errors: IstErrors;
	} = $props();

	const language = useLanguage();
	let enhanced = $state(false);
	onMount(() => { enhanced = true; });
	const messages = $derived(language.messages.ist);
	const statusField = $derived(`${exercise}Status` as FieldName);
	const valueField = $derived(`${exercise}Value` as FieldName);
	const minutesField = $derived(`${exercise}Minutes` as FieldName);
	const secondsField = $derived(`${exercise}Seconds` as FieldName);
	const timed = $derived(exercise === 'run' || exercise === 'plank');
	const recorded = $derived(values[statusField] === 'recorded');

	function changeStatus(event: Event) {
		if ((event.currentTarget as HTMLInputElement).value !== 'recorded') {
			for (const field of timed ? [minutesField, secondsField] : [valueField]) values[field] = '';
		}
	}
</script>

<fieldset class="exercise">
	<legend>{messages.categories[exercise]}</legend>
	<IstChoiceGroup name={statusField} label={messages.completion} hideLabel bind:value={values[statusField]}
		error={errors[statusField]} onchange={changeStatus} submitName={enhanced ? undefined : 'exerciseChoice'}
		choices={[
			{ value: 'recorded', label: messages.recorded },
			{ value: 'unable_to_complete', label: messages.unable }
		]} />
	<div class="exercise-values" class:timed>
		{#if timed}
			<IstField name={minutesField} label={messages.minutes} bind:value={values[minutesField]}
				hint={messages.hints.minutes} error={errors[minutesField]} disabled={!recorded} required={recorded} />
			<IstField name={secondsField} label={messages.seconds} bind:value={values[secondsField]}
				hint={messages.hints.seconds} error={errors[secondsField]} disabled={!recorded} required={recorded} />
		{:else}
			<IstField name={valueField} label={messages.repetitions} bind:value={values[valueField]}
				hint={messages.hints.repetitions} error={errors[valueField]} disabled={!recorded} required={recorded} />
		{/if}
	</div>
	{#if timed}<p class="duration-hint">{messages.hints.duration}</p>{/if}
</fieldset>

<style>
	.exercise {
		min-width: 0;
		margin: 0;
		padding: 1rem 1.1rem 1.2rem;
		border: 1px solid var(--color-border);
		border-radius: 0.75rem;
	}

	legend {
		padding-inline: 0.35rem;
		color: var(--color-accent);
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
		color: var(--color-muted);
		font-size: 0.75rem;
		line-height: 1.5;
	}
</style>
