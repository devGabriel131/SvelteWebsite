<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick, untrack } from 'svelte';
	import { attendanceSchedule, presentAttendanceCertificate } from '#lib/attendance/presentation.ts';
	import {
		attendanceClassTimes, attendanceFields, attendanceTextLimits,
		type AttendanceErrors, type AttendanceFormValues
	} from '#lib/attendance/types.ts';
	import { validateAttendanceInput } from '#lib/attendance/validation.ts';
	import { formValues, readFormFields, refreshVisibleErrors } from '#lib/form-fields.ts';
	import ChoiceGroup from '#lib/components/ChoiceGroup.svelte';
	import FormField from '#lib/components/FormField.svelte';
	import ReportArchiveStatus from '#lib/components/ReportArchiveStatus.svelte';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import { formatMessage, languages } from '#lib/i18n/translations.ts';
	import type { PageProps } from './$types';

	let { form, data }: PageProps = $props();
	const language = useLanguage();
	const messages = $derived(language.messages.attendance);
	let values = $state<AttendanceFormValues>(untrack(() => form?.values ?? formValues({}, attendanceFields)));
	let errors = $state<AttendanceErrors>(untrack(() => form && 'errors' in form ? form.errors ?? {} : {}));
	let submitting = $state(false);
	let requestError = $state(false);
	let formElement = $state<HTMLFormElement>();
	let resultsElement = $state<HTMLElement>();
	const hasErrors = $derived(Object.keys(errors).length > 0);
	const schedule = $derived((values.cohort === 'basic' || values.cohort === 'regular') &&
		(values.classTime === 'am' || values.classTime === 'pm')
		? attendanceSchedule(values.cohort, values.classTime, language.current) : null);
	const success = $derived(form && 'reports' in form ? form : null);
	const failure = $derived(form && 'failure' in form ? form.failure : null);
	const certificate = $derived(success?.certificate && !hasErrors && !requestError
		? presentAttendanceCertificate(success.certificate, language.current) : null);

	$effect(() => {
		if (form) {
			values = { ...form.values };
			errors = 'errors' in form ? form.errors ?? {} : {};
		}
	});

	$effect(() => {
		const currentValues = { ...values };
		untrack(() => {
			if (Object.keys(errors).length > 0) errors = refreshVisibleErrors(validateAttendanceInput(currentValues), errors);
		});
	});

	async function focusFirstError() {
		await tick();
		const invalid = formElement?.querySelector<HTMLElement>('[aria-invalid="true"]');
		const target = invalid?.matches('input, button') ? invalid : invalid?.querySelector<HTMLElement>('input, button');
		target?.focus();
	}
</script>

<svelte:head>
	<title>{messages.pageTitle}</title>
	<meta name="description" content={messages.description} />
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="attendance-page">
	<header class="page-heading">
		<p class="eyebrow">{messages.eyebrow}</p>
		<h1>{messages.title}</h1>
		<p class="introduction">{messages.introduction}</p>
	</header>

	{#if data.driveArchiveEnabled}
		<ReportArchiveStatus state="notice" />
	{/if}

	<form method="POST" novalidate bind:this={formElement}
		use:enhance={({ formElement, cancel }) => {
			requestError = false;
			const validation = validateAttendanceInput(readFormFields(new FormData(formElement), attendanceFields));
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
		}}>
		<Card.Root class="gap-0 p-0">
		<fieldset class="form-body" disabled={submitting}>
			<legend class="sr-only">{messages.title}</legend>
			<section class="form-section" aria-labelledby="student-details-title">
				<div class="section-heading">
					<h2 id="student-details-title">{messages.studentDetails}</h2>
					<p>{messages.studentDetailsHint}</p>
				</div>
				<div class="fields-grid">
					<FormField name="studentName" label={messages.fields.studentName} bind:value={values.studentName}
						autocomplete="name" maxLength={attendanceTextLimits.studentName}
						error={errors.studentName ? messages.errors[errors.studentName] : undefined} />
					<div>
						<ChoiceGroup name="studentSex" label={messages.fields.studentSex} bind:value={values.studentSex}
							hint={messages.hints.studentSex}
							choices={[
								{ value: 'male', label: messages.sexOptions.male },
								{ value: 'female', label: messages.sexOptions.female }
							]}
							error={errors.studentSex ? messages.errors[errors.studentSex] : undefined} />
					</div>
				</div>
			</section>

			<section class="form-section" aria-labelledby="program-details-title">
				<div class="section-heading">
					<h2 id="program-details-title">{messages.programDetails}</h2>
					<p>{messages.programDetailsHint}</p>
				</div>
				<div class="fields-grid">
					<FormField name="programStartDate" type="date" label={messages.fields.programStartDate}
						bind:value={values.programStartDate} hint={messages.hints.programStartDate}
						min="0001-01-01" max="9999-12-31"
						error={errors.programStartDate ? messages.errors[errors.programStartDate] : undefined} />
					<div>
						<ChoiceGroup name="cohort" label={messages.fields.cohort} bind:value={values.cohort}
							choices={[
								{ value: 'basic', label: messages.cohortOptions.basic },
								{ value: 'regular', label: messages.cohortOptions.regular }
							]}
							error={errors.cohort ? messages.errors[errors.cohort] : undefined} />
					</div>
					<div class="full-width">
						<ChoiceGroup name="classTime" label={messages.fields.classTime} bind:value={values.classTime}
							choices={[
								{ value: 'am', label: formatMessage(messages.classTimeOptions.am, attendanceClassTimes.am) },
								{ value: 'pm', label: formatMessage(messages.classTimeOptions.pm, attendanceClassTimes.pm) }
							]}
							error={errors.classTime ? messages.errors[errors.classTime] : undefined} />
					</div>
				</div>
				{#if schedule}
					<div class="schedule" aria-live="polite">
						<Card.Root class="gap-0 bg-accent p-4">
							<h3>{messages.scheduleLabel}</h3>
							<p>{schedule}</p>
						</Card.Root>
					</div>
				{/if}
			</section>

			<section class="form-section" aria-labelledby="employer-details-title">
				<div class="section-heading">
					<h2 id="employer-details-title">{messages.employerDetails}</h2>
					<p>{messages.employerDetailsHint}</p>
				</div>
				<div class="fields-grid">
					<FormField name="employerName" label={messages.fields.employerName} bind:value={values.employerName}
						maxLength={attendanceTextLimits.employerName}
						error={errors.employerName ? messages.errors[errors.employerName] : undefined} />
					<FormField name="employerPosition" label={messages.fields.employerPosition} bind:value={values.employerPosition}
						maxLength={attendanceTextLimits.employerPosition} hint={messages.hints.employerPosition}
						error={errors.employerPosition ? messages.errors[errors.employerPosition] : undefined} />
					<div class="full-width">
						<FormField name="employerWorkplace" label={messages.fields.employerWorkplace} bind:value={values.employerWorkplace}
							maxLength={attendanceTextLimits.employerWorkplace}
							error={errors.employerWorkplace ? messages.errors[errors.employerWorkplace] : undefined} />
					</div>
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
			<Button class="min-h-[2.8rem] gap-[0.6rem] px-[1.05rem] py-[0.7rem] font-bold disabled:cursor-wait max-[30rem]:w-full"
				type="submit" disabled={submitting} aria-busy={submitting}>
				{submitting ? messages.submitting : messages.submit}
				<svg class="size-[1.1rem] text-primary-foreground" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
			</Button>
		</div>
		</Card.Root>
	</form>

	{#if certificate && success?.certificate && success.reports}
		<section class="results" aria-labelledby="certificate-title" tabindex="-1" bind:this={resultsElement}>
			<Card.Root class="gap-0 p-[clamp(1.1rem,3vw,1.75rem)]">
			<h2 id="certificate-title">{messages.resultsTitle}</h2>
			<p class="ready-message">{messages.ready}</p>
			<ReportArchiveStatus state={success.archived ? 'saved' : 'localOnly'} />
			<div class="downloads">
				{#each languages as { code } (code)}
					<Button variant="outline" class="min-h-[2.8rem] gap-[0.6rem] px-[1.05rem] py-[0.7rem] font-bold max-[30rem]:w-full"
						href={`data:application/pdf;base64,${success.reports[code]}`}
						download={presentAttendanceCertificate(success.certificate, code).filename}>
						<svg class="size-[1.1rem] text-secondary group-hover/button:text-primary" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4" /></svg>
						{code === 'en' ? messages.downloadEnglish : messages.downloadSpanish}
					</Button>
				{/each}
			</div>
			<article class="letter-preview" aria-label={messages.previewTitle} lang={certificate.language}>
				<Card.Root class="gap-0 bg-background p-[clamp(1rem,4vw,2rem)] leading-[1.65]">
				<header>
					<h3>{certificate.title}</h3>
					<p>{certificate.issuedDate}</p>
				</header>
				<div class="recipient">
					{#each certificate.recipient as line}<p>{line}</p>{/each}
				</div>
				{#each certificate.paragraphs as paragraph}<p>{paragraph}</p>{/each}
				<div class="signature">
					<p><strong>{certificate.signature.name}</strong></p>
					<p>{certificate.signature.role}</p>
					<p>{certificate.signature.phone}</p>
					<p>{certificate.signature.email}</p>
				</div>
				</Card.Root>
			</article>
			<p class="snapshot-note">{messages.snapshotNote}</p>
			</Card.Root>
		</section>
	{/if}
</div>

<style>
	.attendance-page { max-width: 64rem; margin-inline: auto; }
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
	.fields-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
	.full-width { grid-column: 1 / -1; }
	.schedule { margin-top: 1rem; }
	.schedule h3 { margin: 0; color: var(--primary); font-size: 0.8125rem; }
	.schedule p { margin: 0.4rem 0 0; font-size: 0.875rem; }
	.form-footer { padding: 1.25rem clamp(1.1rem, 3vw, 1.75rem); border-top: 1px solid var(--border); }
	.snapshot-note { margin: 1rem 0 0; color: var(--muted-foreground); font-size: 0.8125rem; }
	svg { stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
	.results { margin-top: 2rem; }
	.ready-message { margin: 0.5rem 0 1rem; color: var(--muted-foreground); font-size: 0.875rem; }
	.downloads { display: flex; flex-wrap: wrap; gap: 0.75rem; }
	.letter-preview { margin-top: 1.5rem; overflow-wrap: anywhere; }
	.letter-preview h3 { margin: 0; font-size: 1rem; }
	.letter-preview header p { margin: 0.3rem 0 0; color: var(--muted-foreground); }
	.recipient { margin-block: 1.5rem; }
	.recipient p, .signature p { margin: 0; }
	.recipient p:first-child { font-weight: 700; }
	.signature { margin-top: 1.5rem; text-align: right; }
	@media (max-width: 40rem) { .fields-grid { grid-template-columns: minmax(0, 1fr); } }
</style>
