<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import { formatMessage } from '#lib/i18n/translations.ts';
	import ActionForm from './ActionForm.svelte';
	import { depositCents, priceCents, type StudentRegistration } from './types';

	let { eventId, registration, canPay, paymentEnabled, now }: {
		eventId: string;
		registration?: StudentRegistration & {
			payment?: NonNullable<StudentRegistration['payment']> & { uncertain?: boolean };
		};
		canPay: boolean;
		paymentEnabled: boolean;
		now: number;
	} = $props();
	const language = useLanguage();
	const messages = $derived(language.messages.bootcamp.payment);
	const id = $props.id();
	const payment = $derived(registration?.payment);
	const paid = $derived(registration?.paidCents ?? 0);
	const remaining = $derived(Math.max(0, priceCents - paid));
	const confirmed = $derived(paid >= depositCents);
	const canStartAttempt = $derived(paid === 0 && !payment?.uncertain && (!payment || payment.status === 'cancelled'));
	let submissionLocked = $state(false);
	let paymentPending = $state(false);
	let checkPending = $state(false);
	let checkForm = $state<HTMLFormElement>();
	let phoneInput = $state<HTMLInputElement>();
	let phoneInvalid = $state(false);
	let automaticChecksUntil = $state<number | null>(null);
	let automaticChecksStopped = $state(false);
	const unresolved = $derived(Boolean(payment?.uncertain) || (!confirmed && (submissionLocked || payment?.status === 'creating'
		|| payment?.status === 'pending' || payment?.status === 'uncertain')));
	const automaticChecksActive = $derived(unresolved && paymentEnabled && !automaticChecksStopped
		&& automaticChecksUntil !== null && now < automaticChecksUntil);
	const displayStatus = $derived(submissionLocked && canStartAttempt ? 'uncertain'
		: payment && Object.hasOwn(messages.stateHints, payment.status) ? payment.status : payment ? 'unknown' : null);
	const money = (cents: number) => new Intl.NumberFormat(language.current === 'es' ? 'es-PR' : 'en-US', {
		style: 'currency', currency: 'USD'
	}).format(cents / 100);

	$effect(() => {
		if (unresolved && automaticChecksUntil === null) automaticChecksUntil = Date.now() + 10 * 60 * 1000;
	});

	$effect(() => {
		if (!automaticChecksActive) return;
		const timer = setInterval(() => {
			// Keep the same deadline across status changes and server-data refreshes.
			if (document.visibilityState === 'visible' && automaticChecksUntil !== null
				&& Date.now() < automaticChecksUntil && !paymentPending && !checkPending) checkForm?.requestSubmit();
		}, 10_000);
		return () => clearInterval(timer);
	});

	function preparePayment(fields: FormData) {
		if (!canPay || !paymentEnabled || !canStartAttempt || submissionLocked || checkPending) return false;
		const phone = String(fields.get('phone') ?? '');
		const match = /^(?:\+?1)?(\d{10})$/.exec(phone.replace(/[\s().-]/g, ''));
		if (!match || phone.length > 40) {
			phoneInvalid = true;
			phoneInput?.setCustomValidity(messages.invalidPhone);
			phoneInput?.reportValidity();
			return false;
		}
		phoneInvalid = false;
		phoneInput?.setCustomValidity('');
		if (phoneInput) phoneInput.value = match[1];
		fields.set('phone', match[1]);
		// Even an unsuccessful HTTP response can follow a provider-side charge.
		// Only an authoritative status check may unlock this local attempt guard.
		submissionLocked = true;
		return true;
	}
</script>

<section class="bc-section" aria-label={messages.title}>
	<h3>{messages.title}</h3>
	<p class="bc-hint">{messages.description}</p>
	<dl class="bc-details">
		<div><dt>{messages.total}</dt><dd>{money(priceCents)}</dd></div>
		<div><dt>{messages.paid}</dt><dd>{money(paid)}</dd></div>
		<div><dt>{messages.remaining}</dt><dd>{money(remaining)}</dd></div>
	</dl>
	<p class="bc-hint">{messages.recordsNotice}</p>
	{#if confirmed}
		<p class="bc-notice" role="status">{messages.confirmed}</p>
		{#if remaining === 0}<p class="bc-hint">{messages.complete}</p>{/if}
	{/if}
	{#if paid > 0 && remaining > 0}<p class="bc-notice">{formatMessage(messages.remainingNotice, { amount: money(remaining) })}</p>{/if}
	{#if displayStatus}
		<div class="bc-stack" role="status">
			<p class="bc-status">{messages.statuses[displayStatus]}</p>
			{#if !payment?.uncertain && (!confirmed || displayStatus !== 'completed')}<p class="bc-hint">{messages.stateHints[displayStatus]}</p>{/if}
		</div>
	{/if}
	{#if payment?.uncertain}<p class="bc-notice" role="status">{messages.verificationAttention}</p>{/if}
	{#if registration && (payment || submissionLocked || paid > 0)}
		<ActionForm action="?/checkPayment" bind:formElement={checkForm} bind:pending={checkPending}
			updatePageForm={false} successMessage={messages.checked}
			beforeSubmit={() => !paymentPending}
			onSuccess={() => submissionLocked = false} onFailure={() => automaticChecksStopped = true}>
			{#snippet children(pending)}
				<input type="hidden" name="eventId" value={eventId} />
				<Button type="submit" variant="outline" disabled={pending || paymentPending}>{pending ? messages.checking : messages.check}</Button>
			{/snippet}
		</ActionForm>
		{#if unresolved}<p class="bc-hint">{automaticChecksActive ? messages.polling : messages.pollingStopped}</p>{/if}
	{/if}
	{#if !paymentEnabled && !confirmed}<p class="bc-notice">{messages.unavailable}</p>{/if}
	{#if paymentEnabled && canPay && canStartAttempt}
		<p class="bc-hint">{messages.initialOnly}</p>
		<ActionForm action="?/payment" bind:pending={paymentPending} beforeSubmit={preparePayment} successMessage={messages.pending}>
			{#snippet children(pending)}
				<fieldset disabled={pending || submissionLocked || checkPending} class="bc-stack">
					<input type="hidden" name="eventId" value={eventId} />
					<label class="bc-field"><span>{messages.phone}</span>
						<input type="tel" name="phone" value={registration?.waiver?.student.phone ?? ''} bind:this={phoneInput}
							autocomplete="tel" maxlength="40" required aria-invalid={phoneInvalid}
							aria-describedby={`${id}-phone-hint${phoneInvalid ? ` ${id}-phone-error` : ''}`}
							oninput={() => { phoneInvalid = false; phoneInput?.setCustomValidity(''); }} />
					</label>
					<p id={`${id}-phone-hint`} class="bc-hint">{messages.phoneHint}</p>
					{#if phoneInvalid}<p id={`${id}-phone-error`} class="bc-error" role="alert">{messages.invalidPhone}</p>{/if}
					<div class="bc-actions">
						<Button type="submit" name="amountCents" value={String(priceCents)} disabled={pending || submissionLocked || checkPending}>{formatMessage(messages.full, { amount: money(priceCents) })}</Button>
						<Button type="submit" name="amountCents" value={String(depositCents)} variant="outline" disabled={pending || submissionLocked || checkPending}>{formatMessage(messages.deposit, { amount: money(depositCents) })}</Button>
					</div>
				</fieldset>
			{/snippet}
		</ActionForm>
	{:else if !confirmed && !canPay && !payment}<p class="bc-hint">{messages.prerequisites}</p>{/if}
</section>
