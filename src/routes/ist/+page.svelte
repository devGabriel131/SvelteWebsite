<script lang="ts">
	import { enhance } from '$app/forms';

	import { tick, untrack } from 'svelte';
	import IstAssessmentReport from '#lib/components/IstAssessmentReport.svelte';
	import ReportArchiveStatus from '#lib/components/ReportArchiveStatus.svelte';
	import ChoiceGroup from '#lib/components/ChoiceGroup.svelte';
	import IstExerciseInput from '#lib/components/IstExerciseInput.svelte';
	import FormField from '#lib/components/FormField.svelte';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import { presentIstAssessment } from '#lib/ist/presentation.ts';
	import { exerciseKeys, istFields, type IstErrors, type IstFormValues } from '#lib/ist/types.ts';
	import { validateIstInput } from '#lib/ist/validation.ts';
	import { formValues, readFormFields, refreshVisibleErrors } from '#lib/form-fields.ts';
	import type { PageProps } from './$types';

	let { form, data }: PageProps = $props();
	const language = useLanguage();
	const messages = $derived(language.messages.ist);
	let values = $state<IstFormValues>(untrack(() => form?.values ?? formValues({}, istFields)));
	let errors = $state<IstErrors>(untrack(() => form && 'errors' in form ? form.errors ?? {} : {}));
	let submitting = $state(false);
	let requestError = $state(false);
	let formElement = $state<HTMLFormElement>();
	let resultsElement = $state<HTMLElement>();
	const hasErrors = $derived(Object.keys(errors).length > 0);
	const success = $derived(form && 'reports' in form ? form : null);
	const failure = $derived(form && 'failure' in form ? form.failure : null);
	const report = $derived(success?.assessment && !hasErrors && !requestError
		? presentIstAssessment(success.assessment, language.current) : null);

	$effect(() => {
		if (form) {
			values = { ...form.values };
			errors = 'errors' in form ? form.errors ?? {} : {};
		}
	});

	$effect(() => {
		const currentValues = { ...values };
		untrack(() => {
			if (Object.keys(errors).length > 0) errors = refreshVisibleErrors(validateIstInput(currentValues), errors);
		});
	});

	async function focusFirstError() {
		await tick();
		const invalid = formElement?.querySelector<HTMLElement>('[aria-invalid="true"]');
				const target = invalid?.matches('input, select, textarea')
					? invalid : invalid?.querySelector<HTMLElement>('input, select, textarea');
				target?.focus();
	}
</script>

<svelte:head>
	<title>{messages.pageTitle}</title>
	<meta name="description" content={messages.description} />
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="ist-page">
	<header class="page-heading">
		<p class="eyebrow">{messages.eyebrow}</p>
		<h1>{messages.title}</h1>
		<p class="introduction">{messages.introduction}</p>

	</header>

	{#if data.driveArchiveEnabled}
		<ReportArchiveStatus state="notice" />
	{/if}

	<form
		method="POST" novalidate bind:this={formElement}

		use:enhance={({ formElement, cancel }) => {
			requestError = false;
			const validation = validateIstInput(readFormFields(new FormData(formElement), istFields));
			if (!validation.valid) {
				cancel();
				errors = validation.errors;
				void focusFirstError();
				return;
			}
			errors = {};
			submitting = true;
			return async ({ result, update }) => {
				try {
					if (result.type === 'error') {
						requestError = true;
						return;
					}
					await update({ reset: false, invalidateAll: false });
					submitting = false;
					if (result.type === 'failure') await focusFirstError();
					if (result.type === 'success') {
						await tick();
						resultsElement?.focus();
					}
				} finally {
					submitting = false;
				}
			};
		}}
	>
		<Card.Root class="gap-0 rounded-2xl border border-border p-0 ring-0">
		<!-- Keep Enter mapped to assessment rather than a native exercise-choice button. -->
		<noscript><button type="submit" hidden>{messages.submit}</button></noscript>
		<fieldset class="form-body" disabled={submitting}>
			<legend class="sr-only">{messages.title}</legend>
			<section class="form-section" aria-labelledby="student-details-title">
				<div class="section-heading">
					<h2 id="student-details-title">{messages.studentDetails}</h2>
					<p>{messages.studentDetailsHint}</p>
				</div>
				<div class="student-fields">
					<div class="student-name">
						<FormField name="studentName" id="ist-studentName" label={messages.fields.studentName} bind:value={values.studentName}
							inputMode="text" autocomplete="name" error={errors.studentName ? messages.errors[errors.studentName] : undefined} />
					</div>
					<div class="sex-field">
						<ChoiceGroup name="sex" id="ist-sex" label={messages.fields.sex} bind:value={values.sex}
							error={errors.sex ? messages.errors[errors.sex] : undefined}
							choices={[
								{ value: 'male', label: messages.sexOptions.male },
								{ value: 'female', label: messages.sexOptions.female }
							]} />
					</div>
					<FormField name="age" id="ist-age" inputMode="numeric" label={messages.fields.age} bind:value={values.age}
						hint={messages.hints.age} error={errors.age ? messages.errors[errors.age] : undefined} />
				</div>
			</section>

			<section class="form-section" aria-labelledby="measurements-title">
				<div class="section-heading">
					<h2 id="measurements-title">{messages.measurements}</h2>
					<p>{messages.measurementsHint}</p>
				</div>
				<div class="measurements-grid">
					<FormField name="weightLb" id="ist-weightLb" label={messages.fields.weightLb} bind:value={values.weightLb}
						inputMode="decimal" hint={messages.hints.weightLb} error={errors.weightLb ? messages.errors[errors.weightLb] : undefined} />
					<FormField name="waistIn" id="ist-waistIn" label={messages.fields.waistIn} bind:value={values.waistIn}
						inputMode="decimal" hint={messages.hints.waistIn} error={errors.waistIn ? messages.errors[errors.waistIn] : undefined} />
				</div>
			</section>

			<section class="form-section" aria-labelledby="exercises-title">
				<div class="section-heading">
					<h2 id="exercises-title">{messages.exerciseResults}</h2>
					<p>{messages.exerciseHint}</p>
					<noscript><p>{messages.nativeExerciseHint}</p></noscript>
				</div>
				<div class="exercises-grid">
					{#each exerciseKeys as exercise (exercise)}
						<IstExerciseInput {exercise} bind:values {errors} />
					{/each}
				</div>
			</section>
		</fieldset>
		<div class="form-footer">
			{#if hasErrors}
				<Alert.Root variant="destructive" class="mb-4">
					<Alert.Description>{messages.errorSummary}</Alert.Description>
				</Alert.Root>
			{/if}
			{#if requestError || failure === 'generation'}
				<Alert.Root variant="destructive" class="mb-4">
					<Alert.Description>{messages.serverError}</Alert.Description>
				</Alert.Root>
			{/if}
			{#if failure === 'signIn' || failure === 'unavailable'}
				<ReportArchiveStatus state={failure} />
			{/if}
			<Button class="min-h-[2.8rem]" type="submit" disabled={submitting} aria-busy={submitting}>
				{submitting ? messages.submitting : messages.submit}
				<svg class="submit-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
			</Button>
		</div>
		</Card.Root>
	</form>

	{#if report && success?.reports}
		<section class="assessment" aria-labelledby="assessment-title" tabindex="-1" bind:this={resultsElement}>
			<Card.Root class="gap-0 rounded-2xl border border-border p-[clamp(1.1rem,3vw,1.75rem)] ring-0">
			<div class="assessment-heading">
				<h2 id="assessment-title">{messages.resultsTitle}</h2>
				<Button variant="outline" class="min-h-[2.8rem]" href={`data:application/pdf;base64,${success.reports[language.current]}`}
					download={report.filename}>
					<svg class="download-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4" /></svg>
					{messages.download}
				</Button>
			</div>
			<ReportArchiveStatus state={success.archived ? 'saved' : 'localOnly'} />
			<IstAssessmentReport {report} />
			</Card.Root>
		</section>
	{/if}
</div>

<style>
	.ist-page { max-width: 64rem; margin-inline: auto; }
	.eyebrow { margin: 0 0 0.6rem; color: var(--primary); font-size: 0.75rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
	h1 { margin: 0; font-family: var(--font-display); font-size: clamp(1.4rem, 3vw, 2.1rem); line-height: 1.3; text-transform: uppercase; overflow-wrap: anywhere; }
	.introduction { max-width: 44rem; margin: 0.9rem 0 0; color: var(--muted-foreground); font-size: 0.9375rem; }
	.page-heading { margin-bottom: 1.75rem; }

	.form-body { min-width: 0; margin: 0; padding: 0; border: 0; }
	.form-section { padding: clamp(1.1rem, 3vw, 1.75rem); }
	.form-section + .form-section { border-top: 1px solid var(--border); }
	h2 { margin: 0; font-size: 1.125rem; }
	.section-heading { margin-bottom: 1.25rem; }
	.section-heading p { margin: 0.35rem 0 0; color: var(--muted-foreground); font-size: 0.8125rem; }
	.student-fields { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 0.7fr); gap: 1rem; }
	.measurements-grid, .exercises-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.1rem; }
	.sex-field { min-width: 0; }
	.form-footer { padding: 1.25rem clamp(1.1rem, 3vw, 1.75rem); border-top: 1px solid var(--border); }
	svg { flex-shrink: 0; width: 1.1rem; height: 1.1rem; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
	.assessment { margin-top: 2rem; }
	.assessment-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1.25rem; }
	@media (max-width: 55rem) { .student-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); } .student-name { grid-column: 1 / -1; } }
	@media (max-width: 45rem) { .exercises-grid { grid-template-columns: minmax(0, 1fr); } }
	@media (max-width: 30rem) {
		.measurements-grid { grid-template-columns: minmax(0, 1fr); }
		.form-footer :global([data-slot="button"]), .assessment-heading :global([data-slot="button"]) { width: 100%; }
	}
</style>
