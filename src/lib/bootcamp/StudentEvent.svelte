<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import { formatMessage } from '#lib/i18n/translations.ts';
	import ActionForm from './ActionForm.svelte';
	import WaiverForm from './WaiverForm.svelte';
	import RegistrationPayment from './RegistrationPayment.svelte';
	import { registrationAvailable } from './rules';
	import { eventTimeZone, type BootcampEvent, type StudentBootcampPage, type StudentRegistration } from './types';

	let { event, registration, student, paymentEnabled, now }: {
		event: BootcampEvent;
		registration?: StudentRegistration;
		student: StudentBootcampPage['student'];
		paymentEnabled: boolean;
		now: number;
	} = $props();
	const dateFields = ['startsAt', 'endsAt', 'arrivalAt', 'registrationClosesAt'] as const;
	const employerFields = ['employer', 'contact', 'position', 'workplace'] as const;
	const basePath = resolve('/').replace(/\/$/, '');
	const language = useLanguage();
	const messages = $derived(language.messages.bootcamp);
	const canRegister = $derived(registrationAvailable(event, new Date(now)));
	const ended = $derived(now > Date.parse(event.endsAt));

	let needsLetter = $state<boolean | null>(null);
	const date = (value: string) => new Intl.DateTimeFormat(language.current === 'es' ? 'es-PR' : 'en-US', {
		dateStyle: 'medium', timeStyle: 'short', timeZone: eventTimeZone
	}).format(new Date(value));

</script>

<Card.Root class="bc-card">
	<header class="bc-card-heading">
		<div><p class="bc-eyebrow">{formatMessage(messages.event.revision, { revision: event.revision })}</p><h2>{event.title}</h2></div>
		<span class="bc-status" class:bc-status-open={canRegister}>{canRegister ? messages.event.open : messages.event.closed}</span>
	</header>
	<dl class="bc-details">
		<div><dt>{messages.event.venue}</dt><dd>{event.venue}</dd></div>
		{#each dateFields as field}
			<div><dt>{messages.event[field]}</dt><dd>{date(event[field])}</dd></div>
		{/each}
	</dl>
	<p class="bc-hint">{messages.event.timeZone}</p>
	{#if !canRegister}<p class="bc-notice">{ended ? messages.event.ended : messages.event.closedNote}</p>{/if}

	{#if !ended && registration?.documents.length}
		<section class="bc-section" aria-label={messages.event.documents}>
			<h3>{messages.event.documents}</h3>
			<p class="bc-hint">{formatMessage(messages.event.downloadsUntil, { date: date(event.endsAt) })}</p>
			<div class="bc-actions">
				{#each registration.documents as document (document.id)}
					<Button variant="outline" href={`${basePath}/bootcamps/documents/${encodeURIComponent(document.id)}`}>
						{formatMessage(messages.event.document, { kind: messages.event.documentKinds[document.kind], language: messages.common.languages[document.language] })}
					</Button>
				{/each}
			</div>
		</section>
	{/if}

	{#if canRegister && student && !registration}
		<ActionForm action="?/start" beforeSubmit={() => canRegister && !registration}>
			{#snippet children(pending)}
				<input type="hidden" name="eventId" value={event.id} />
				<Button type="submit" disabled={pending}>{pending ? messages.common.saving : messages.registration.begin}</Button>
			{/snippet}
		</ActionForm>
	{:else if canRegister && student && registration && !registration.waiver}
		<section class="bc-section"><p class="bc-hint">{messages.registration.draft}</p><WaiverForm {event} {student} /></section>
	{:else if registration?.waiver}
		<p class="bc-hint">{messages.waiver.saved}</p>
	{/if}

	{#if canRegister && student && registration?.waiver && registration.letterChoice === null}
		<section class="bc-section" aria-label={messages.letter.title}>
			<h3>{messages.letter.title}</h3>
			<p class="bc-hint">{messages.letter.description}</p>
			<ActionForm action="?/letter" beforeSubmit={() => needsLetter !== null}>
				{#snippet children(pending)}
					<fieldset disabled={pending} class="bc-stack">
						<legend>{messages.letter.question}</legend>
						<input type="hidden" name="eventId" value={event.id} />
						<input type="hidden" name="revision" value={event.revision} />
						<input type="hidden" name="language" value={language.current} />
						<input type="hidden" name="needsLetter" value={needsLetter === true ? 'true' : needsLetter === false ? 'false' : ''} />
						<div class="bc-actions">
							<Button type="button" variant="outline" aria-pressed={needsLetter === true} onclick={() => needsLetter = true}>{messages.common.yes}</Button>
							<Button type="button" variant="outline" aria-pressed={needsLetter === false} onclick={() => needsLetter = false}>{messages.common.no}</Button>
						</div>
						{#if needsLetter}
							<div class="bc-fields">
								{#each employerFields as field}
									<label class="bc-field"><span>{messages.letter[field]}</span><input name={field} maxlength="200" required /></label>
								{/each}
							</div>
						{:else}
							{#each employerFields as field}<input type="hidden" name={field} value="" />{/each}
						{/if}
						<Button type="submit" disabled={pending || needsLetter === null}>{pending ? messages.common.saving : messages.letter.submit}</Button>
					</fieldset>
				{/snippet}
			</ActionForm>
		</section>
	{:else if registration?.letterChoice !== null && registration?.letterChoice !== undefined}
		<p class="bc-hint">{registration.letterChoice ? messages.letter.saved : messages.letter.declined}</p>
	{/if}

	<RegistrationPayment eventId={event.id} {registration} {paymentEnabled} {now}
		canPay={Boolean(canRegister && student && registration?.waiver && registration.letterChoice !== null)} />
</Card.Root>
