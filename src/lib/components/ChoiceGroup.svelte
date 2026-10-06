<script lang="ts">
	import { Button, buttonVariants } from '#lib/components/ui/button/index.js';
	import { Label } from '#lib/components/ui/label/index.js';

	let {
		name, id = `choice-${name}`, label, choices, value = $bindable(''), hint, error,
		onchange, hideLabel = false, submitName
	}: {
		name: string;
		id?: string;
		label: string;
		hideLabel?: boolean;
		submitName?: string;
		choices: readonly { value: string; label: string }[];
		value: string;
		hint?: string;
		error?: string;
		onchange?: (event: Event) => void;
	} = $props();

	const errorId = $derived(`${id}-error`);
	const descriptions = $derived([
		hint ? `${id}-hint` : '', error ? errorId : ''
	].filter(Boolean).join(' ') || undefined);
</script>

<fieldset class="choice-group" role={submitName ? 'group' : 'radiogroup'} aria-required={submitName ? undefined : 'true'}
	aria-invalid={error ? 'true' : undefined} aria-describedby={descriptions}>
	<legend class:visually-hidden={hideLabel}>{label}</legend>
	{#snippet choiceContent(text: string)}
		<span>{text}</span>
		<svg class="selection-check hidden size-[0.9rem] group-has-[input:checked]/button:block group-aria-pressed/button:block" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" aria-hidden="true">
			<path d="m5 12 4 4L19 6" />
		</svg>
	{/snippet}
	{#if submitName}<input type="hidden" {name} {value} />{/if}
	<div class="choice-buttons">
		{#each choices as choice (choice.value)}
			{#if submitName}
				<Button class="relative min-w-0 min-h-[3.25rem] gap-[0.35rem] p-[0.65rem] text-[0.8125rem] font-bold"
					variant="outline" type="submit" name={submitName} value={`${name}:${choice.value}`}
					formnovalidate aria-pressed={value === choice.value} aria-invalid={error ? 'true' : undefined} aria-describedby={descriptions}>
					{@render choiceContent(choice.label)}
				</Button>
			{:else}
				<Label class={buttonVariants({ variant: 'outline', class: 'relative min-w-0 min-h-[3.25rem] gap-[0.35rem] p-[0.65rem] text-[0.8125rem] font-bold cursor-pointer' })}
					aria-invalid={error ? 'true' : undefined}>
					<input class="visually-hidden" type="radio" {name} value={choice.value}
						bind:group={value} {onchange} required aria-describedby={descriptions} />
					{@render choiceContent(choice.label)}
				</Label>
			{/if}
		{/each}
	</div>
</fieldset>
{#if hint}<p class="hint" id={`${id}-hint`}>{hint}</p>{/if}
{#if error}<p class="error" id={errorId}>{error}</p>{/if}

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

	.selection-check {
		stroke-width: 2.5;
		stroke-linecap: round;
		stroke-linejoin: round;
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

	.hint, .error {
		margin: 0.4rem 0 0;
		font-size: 0.75rem;
		line-height: 1.5;
	}

	.hint { color: var(--muted-foreground); }
	.error { color: #f0a6a6; }
</style>
