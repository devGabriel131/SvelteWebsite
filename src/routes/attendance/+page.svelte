<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick, untrack } from 'svelte';
	import { attendanceSchedule, presentAttendanceCertificate } from '#lib/attendance/presentation.ts';
	import {
		attendanceFields, attendanceTextLimits,
		type AttendanceErrors, type AttendanceFormValues
	} from '#lib/attendance/types.ts';
	import {
		readAttendanceFormData, revalidateAttendanceErrors, validateAttendanceInput
	} from '#lib/attendance/validation.ts';
	import FormField from '#lib/components/FormField.svelte';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
		import { languages } from '#lib/i18n/translations.ts';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
	const language = useLanguage();
	const messages = $derived(language.messages.attendance);
	let values = $state<AttendanceFormValues>(untrack(() => form?.values ??
		Object.fromEntries(attendanceFields.map((field) => [field, ''])) as AttendanceFormValues));
	let errors = $state<AttendanceErrors>(untrack(() => form?.errors ?? {}));
	let submitting = $state(false);
	let requestError = $state(false);
	let formElement = $state<HTMLFormElement>();
	let resultsElement = $state<HTMLElement>();
	const hasErrors = $derived(Object.keys(errors).length > 0);
	const schedule = $derived(values.cohort === 'basic' || values.cohort === 'regular'
		? attendanceSchedule(values.cohort, language.current) : null);
	const certificate = $derived(form?.certificate && !hasErrors && !requestError && !form.serverError
		? presentAttendanceCertificate(form.certificate, language.current) : null);

	$effect(() => {
		if (form) {
			values = { ...form.values };
			errors = form.errors;
		}
	});

	$effect(() => {
		const currentValues = { ...values };
		untrack(() => {
			if (Object.keys(errors).length > 0) errors = revalidateAttendanceErrors(currentValues, errors);
		});
	});

	async function focusFirstError() {
		await tick();
		formElement?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
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

	<form method="POST" novalidate bind:this={formElement}
		use:enhance={({ formElement, cancel }) => {
			requestError = false;
			const validation = validateAttendanceInput(readAttendanceFormData(new FormData(formElement)));
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
		<fieldset class="form-body" disabled={submitting}>
			<legend class="visually-hidden">{messages.title}</legend>
			<section class="form-section" aria-labelledby="student-details-title">
				<div class="section-heading">
					<h2 id="student-details-title">{messages.studentDetails}</h2>
					<p>{messages.studentDetailsHint}</p>
				</div>
				<div class="fields-grid">
					<FormField name="studentName" label={messages.fields.studentName} bind:value={values.studentName}
						autocomplete="name" maxLength={attendanceTextLimits.studentName}
						error={errors.studentName ? messages.errors[errors.studentName] : undefined} />
					<FormField name="studentSex" label={messages.fields.studentSex} bind:value={values.studentSex}
						chooseLabel={messages.choose} hint={messages.hints.studentSex}
						options={[
							{ value: 'male', label: messages.sexOptions.male },
							{ value: 'female', label: messages.sexOptions.female }
						]}
						error={errors.studentSex ? messages.errors[errors.studentSex] : undefined} />
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
					<FormField name="cohort" label={messages.fields.cohort} bind:value={values.cohort}
						chooseLabel={messages.choose}
						options={[
							{ value: 'basic', label: messages.cohortOptions.basic },
							{ value: 'regular', label: messages.cohortOptions.regular }
						]}
						error={errors.cohort ? messages.errors[errors.cohort] : undefined} />
				</div>
				{#if schedule}
					<div class="schedule" aria-live="polite">
						<h3>{messages.scheduleLabel}</h3>
						<p>{schedule}</p>
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
			<p class="privacy-note">{messages.privacyNote}</p>
			{#if hasErrors}<p class="error-summary" role="alert">{messages.errorSummary}</p>{/if}
			{#if requestError || form?.serverError}<p class="error-summary" role="alert">{messages.serverError}</p>{/if}
			<button class="primary-button" type="submit" disabled={submitting} aria-busy={submitting}>
				{submitting ? messages.submitting : messages.submit}
				<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
			</button>
		</div>
	</form>

	{#if certificate && form?.certificate && form.reports}
		<section class="results" aria-labelledby="certificate-title" tabindex="-1" bind:this={resultsElement}>
			<h2 id="certificate-title">{messages.resultsTitle}</h2>
			<p class="ready-message">{messages.ready}</p>
			<div class="downloads">
				{#each languages as { code } (code)}
					<a class="download-button" href={`data:application/pdf;base64,${form.reports[code]}`}
						download={presentAttendanceCertificate(form.certificate, code).filename}>
						<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4" /></svg>
						{code === 'en' ? messages.downloadEnglish : messages.downloadSpanish}
					</a>
				{/each}
			</div>
			<article class="letter-preview" aria-label={messages.previewTitle} lang={certificate.language}>
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
			</article>
			<p class="snapshot-note">{messages.snapshotNote}</p>
		</section>
	{/if}
</div>

<style>
	.attendance-page { max-width: 64rem; margin-inline: auto; }
	.eyebrow { margin: 0 0 0.6rem; color: var(--color-accent); font-size: 0.75rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
	h1 { margin: 0; font-family: var(--font-display); font-size: clamp(1.4rem, 3vw, 2.1rem); line-height: 1.3; text-transform: uppercase; overflow-wrap: anywhere; }
	.introduction { max-width: 44rem; margin: 0.9rem 0 0; color: var(--color-muted); font-size: 0.9375rem; }
	.page-heading { margin-bottom: 1.75rem; }
	form, .results { border: 1px solid var(--color-border); border-radius: 1rem; background: var(--color-surface); }
	.form-body { min-width: 0; margin: 0; padding: 0; border: 0; }
	.form-section { padding: clamp(1.1rem, 3vw, 1.75rem); }
	.form-section + .form-section { border-top: 1px solid var(--color-border); }
	h2 { margin: 0; font-size: 1.125rem; }
	.section-heading { margin-bottom: 1.25rem; }
	.section-heading p { margin: 0.35rem 0 0; color: var(--color-muted); font-size: 0.8125rem; }
	.fields-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
	.full-width { grid-column: 1 / -1; }
	.schedule { margin-top: 1rem; padding: 1rem; border: 1px solid var(--color-border); border-radius: 0.5rem; background: var(--color-accent-soft); }
	.schedule h3 { margin: 0; color: var(--color-accent); font-size: 0.8125rem; }
	.schedule p { margin: 0.4rem 0 0; font-size: 0.875rem; }
	.form-footer { padding: 1.25rem clamp(1.1rem, 3vw, 1.75rem); border-top: 1px solid var(--color-border); }
	.privacy-note, .snapshot-note { margin: 0 0 1rem; color: var(--color-muted); font-size: 0.8125rem; }
	.error-summary { margin: 0 0 1rem; color: #f0a6a6; font-size: 0.875rem; }
	.primary-button, .download-button { display: inline-flex; align-items: center; justify-content: center; gap: 0.6rem; min-height: 2.8rem; padding: 0.7rem 1.05rem; border: 1px solid var(--color-accent); border-radius: 0.5rem; font-weight: 700; font-size: 0.875rem; text-decoration: none; cursor: pointer; }
	.primary-button { background: var(--color-accent); color: var(--color-background); }
	.primary-button:hover { filter: brightness(1.08); }
	.primary-button:disabled { cursor: wait; opacity: 0.6; }
	.download-button { color: var(--color-accent); background: var(--color-accent-soft); }
	.download-button:hover { background: color-mix(in srgb, var(--color-accent) 22%, var(--color-surface)); }
	svg { flex-shrink: 0; width: 1.1rem; height: 1.1rem; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
	.results { margin-top: 2rem; padding: clamp(1.1rem, 3vw, 1.75rem); }
	.ready-message { margin: 0.5rem 0 1rem; color: var(--color-muted); font-size: 0.875rem; }
	.downloads { display: flex; flex-wrap: wrap; gap: 0.75rem; }
	.letter-preview { margin-top: 1.5rem; padding: clamp(1rem, 4vw, 2rem); border: 1px solid var(--color-border); border-radius: 0.5rem; background: var(--color-background); font-size: 0.875rem; line-height: 1.65; overflow-wrap: anywhere; }
	.letter-preview h3 { margin: 0; font-size: 1rem; }
	.letter-preview header p { margin: 0.3rem 0 0; color: var(--color-muted); }
	.recipient { margin-block: 1.5rem; }
	.recipient p, .signature p { margin: 0; }
	.recipient p:first-child { font-weight: 700; }
	.signature { margin-top: 1.5rem; text-align: right; }
	.snapshot-note { margin: 1rem 0 0; }
	.visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
	@media (max-width: 40rem) { .fields-grid { grid-template-columns: minmax(0, 1fr); } }
	@media (max-width: 30rem) { .primary-button, .download-button { width: 100%; } }
</style>
