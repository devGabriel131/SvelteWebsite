<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';

	import { CheckCircle, UserRound } from '@lucide/svelte';
	import ChoiceGroup from '#lib/components/ChoiceGroup.svelte';
	import SignInForm from '#lib/components/SignInForm.svelte';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';

	import { INVITATION_REFERRER_POLICY, type EnrollmentData, type EnrollmentActionData } from '#lib/student-invitations.ts';

	let { data }: { data: EnrollmentData } = $props();
	const language = useLanguage();
	const messages = $derived(language.messages.enrollment);
	const id = $props.id();
	const result = $derived((page.form as EnrollmentActionData | null)?.enrollment);
	const token = $derived(page.url.searchParams.get('token') ?? '');
	let gender = $derived<string>(data.student?.gender ?? '');
	let saving = $state(false);
	let requestError = $state(false);
	const error = $derived(requestError ? 'storage' : result?.success === false ? result.error : null);
	const today = new Date().toISOString().slice(0, 10);
	const submit: SubmitFunction = ({ cancel }) => {
		if (saving) { cancel(); return; }
		saving = true;
		requestError = false;
		return async ({ result, update }) => {
			try {
				if (result.type === 'error') requestError = true;
				else await update({ reset: false });
			} finally { saving = false; }
		};
	};
</script>

<svelte:head>
	<title>{messages.pageTitle}</title>
	<meta name="description" content={messages.description} />
	<meta name="robots" content="noindex, nofollow" />
	<meta name="referrer" content={INVITATION_REFERRER_POLICY} />
</svelte:head>

<section class="enrollment" aria-labelledby={`${id}-title`} lang={language.current}>
	<Card.Root class="gap-0 p-[clamp(1.25rem,4vw,2.5rem)]">
		{#if data.state === 'complete'}
			<CheckCircle class="mb-5 size-9 text-primary" aria-hidden="true" />
			<h1 id={`${id}-title`}>{messages.completeTitle}</h1>
			<Button href={resolve('/')} class="mt-6 self-start">{messages.workspace}</Button>
		{:else if data.state === 'signIn'}
			<UserRound class="mb-5 size-8 text-primary" aria-hidden="true" />
			<h1 id={`${id}-title`}>{messages.signInTitle}</h1>
			<p class="introduction">{messages.signInInstruction}</p>
			<SignInForm audience="student" returnTo={`${resolve('/enroll')}?token=${encodeURIComponent(token)}`} />
		{:else if data.state === 'ready' && data.student}
			<h1 id={`${id}-title`}>{messages.title}</h1>
			<p class="introduction">{messages.introduction}</p>
			<form method="POST" action={`?/complete&token=${encodeURIComponent(token)}`} use:enhance={submit} aria-busy={saving}>
				<input type="hidden" name="token" value={token} />
				<fieldset class="enrollment-fields" disabled={saving}>
					<legend class="sr-only">{messages.formTitle}</legend>
					<div class="fields">
						<div class="field"><Label class="font-bold" for={`${id}-first-name`}>{messages.fields.firstName}</Label><Input id={`${id}-first-name`} name="firstName" autocomplete="given-name" value={data.student.firstName} maxlength={100} required /></div>
						<div class="field"><Label class="font-bold" for={`${id}-last-name`}>{messages.fields.lastName}</Label><Input id={`${id}-last-name`} name="lastName" autocomplete="family-name" value={data.student.lastName} maxlength={100} required /></div>
						<div class="field"><Label class="font-bold" for={`${id}-email`}>{messages.fields.email}</Label><Input id={`${id}-email`} type="email" value={data.student.email} readonly aria-describedby={`${id}-assigned`} /></div>
						<div class="field"><Label class="font-bold" for={`${id}-class`}>{messages.fields.classType}</Label><Input id={`${id}-class`} value={messages.classes[data.student.classType]} readonly aria-describedby={`${id}-assigned`} /></div>
					</div>
					<p class="hint" id={`${id}-assigned`}>{messages.assignedHint}</p>
					<div class="field"><Label class="font-bold" for={`${id}-birth-date`}>{messages.fields.dateOfBirth}</Label><Input id={`${id}-birth-date`} name="dateOfBirth" type="date" autocomplete="bday" value={data.student.dateOfBirth ?? ''} max={today} required aria-describedby={`${id}-birth-hint`} /><p class="hint" id={`${id}-birth-hint`}>{messages.birthDateHint}</p></div>
					<ChoiceGroup id={`${id}-gender`} name="gender" label={messages.fields.gender} bind:value={gender} choices={[{ value: 'male', label: messages.genders.male }, { value: 'female', label: messages.genders.female }]} />
					{#if error}
						<Alert.Root variant="destructive"><Alert.Description>{messages.errors[error]}</Alert.Description></Alert.Root>
					{/if}
					<Button type="submit" class="mt-2 w-full min-h-12 font-bold">{saving ? messages.saving : messages.submit}</Button>
				</fieldset>
			</form>
		{:else}
			<h1 id={`${id}-title`}>{messages.invalidTitle}</h1>
			<Alert.Root class="mt-6" variant="destructive"><Alert.Description>{messages.invalidDescription}</Alert.Description></Alert.Root>
			<Button href={resolve('/')} variant="outline" class="mt-6 self-start">{messages.workspace}</Button>
		{/if}
	</Card.Root>
</section>

<style>
	.enrollment { width: min(100%, 40rem); margin-inline: auto; }
	h1 { margin: 0; font-size: clamp(1.6rem, 4vw, 2.15rem); line-height: 1.25; font-weight: 700; letter-spacing: -0.04em; }
	.introduction { margin: 0.75rem 0 1.75rem; color: var(--muted-foreground); line-height: 1.7; }
	.enrollment-fields { display: grid; gap: 1.25rem; margin: 0; padding: 0; border: 0; min-width: 0; }
	.fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.25rem; }
	.field { display: grid; gap: 0.5rem; min-width: 0; }
	.hint { margin: 0; color: var(--muted-foreground); font-size: 0.8rem; line-height: 1.6; }
	@media (max-width: 40rem) { .fields { grid-template-columns: minmax(0, 1fr); } }
</style>
