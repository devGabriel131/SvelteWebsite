<script lang="ts">
	import { untrack } from 'svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import { formatMessage } from '#lib/i18n/translations.ts';
	import ActionForm from './ActionForm.svelte';
	import { defaultLegalText, usesDefaultLegalText } from './legal';
	import { parseEventLocalDate } from './rules';
	import { eventTimeZone, sectionKeys, type BootcampEvent } from './types';

	let { event, oncancel }: { event?: BootcampEvent; oncancel: () => void } = $props();
	let legalApproved = $state(untrack(() => event?.legalApproved ?? false));
	let legalSource = $state<'standard' | 'custom'>(untrack(() => !event || usesDefaultLegalText(event) ? 'standard' : 'custom'));
	let customLegal = $state(untrack(() => ({ agreement: event?.legal.es.agreement ?? '', liability: event?.legal.es.liability ?? '', media: event?.legal.es.media ?? '' })));
	const language = useLanguage();
	const messages = $derived(language.messages.bootcamp);
	const dateFields = ['startsAt', 'endsAt', 'arrivalAt', 'registrationClosesAt'] as const;
	let details = $state(untrack(() => ({
		title: event?.title ?? '', venue: event?.venue ?? '', startsAt: localDate(event?.startsAt),
		endsAt: localDate(event?.endsAt), arrivalAt: localDate(event?.arrivalAt), registrationClosesAt: localDate(event?.registrationClosesAt)
	})));
	const legalPreview = $derived.by(() => {
		const startsAt = parseEventLocalDate(details.startsAt);
		const endsAt = parseEventLocalDate(details.endsAt);
		const arrivalAt = parseEventLocalDate(details.arrivalAt);
		const venue = details.venue.trim().normalize('NFC');
		if (!venue || !startsAt || !endsAt || !arrivalAt || endsAt <= startsAt || arrivalAt > startsAt) return null;
		return defaultLegalText({ venue, startsAt, endsAt, arrivalAt }).es;
	});

	function localDate(value?: string) {
		if (!value) return '';
		const parts = new Intl.DateTimeFormat('en-CA', {
			timeZone: eventTimeZone, year: 'numeric', month: '2-digit', day: '2-digit',
			hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
		}).formatToParts(new Date(value));
		const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
		return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}`;
	}

	function customize() {
		if (!legalPreview) return;
		customLegal = { ...legalPreview };
		legalSource = 'custom';
		legalApproved = false;
	}
</script>

<Card.Root class="bc-card">
	<h2>{event ? formatMessage(messages.admin.editing, { title: event.title }) : messages.admin.create}</h2>
	<p class="bc-hint">{messages.common.required}</p>
	{#if event}<p class="bc-notice">{messages.admin.editWarning}</p>{/if}
	<ActionForm action="?/saveEvent">
		{#snippet children(pending)}
			<fieldset disabled={pending} class="bc-stack">
				{#if event}<input type="hidden" name="id" value={event.id} /><input type="hidden" name="revision" value={event.revision} />{/if}
				<input type="hidden" name="legalSource" value={legalSource} />
				<div class="bc-fields">
					<label class="bc-field"><span>{messages.admin.titleField}</span><input name="title" bind:value={details.title} oninput={() => legalApproved = false} maxlength="200" required /></label>
					<label class="bc-field"><span>{messages.admin.venue}</span><input name="venue" bind:value={details.venue} oninput={() => legalApproved = false} maxlength="300" required /></label>
					{#each dateFields as field (field)}
						<label class="bc-field"><span>{messages.event[field]}</span><input type="datetime-local" step="1" name={field} bind:value={details[field]} oninput={() => legalApproved = false} required /></label>
					{/each}
				</div>
				<p class="bc-hint">{messages.admin.timeZone}</p>
				<section class="bc-section">
					<h3>{messages.admin.legal}</h3>
					<p class="bc-hint">{messages.admin.legalHint}</p>
					<p class="bc-notice">{messages.admin.legalReview}</p>
					{#if legalSource === 'standard'}
						{#if legalPreview}
							{#each sectionKeys as section (section)}
								<details>
									<summary>{formatMessage(messages.admin.legalLabel, { section: messages.waiver.sections[section] })}</summary>
									<!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users need to scroll the complete agreement before approval.) -->
									<div class="bc-legal-text" tabindex="0" role="region" aria-label={formatMessage(messages.admin.legalLabel, { section: messages.waiver.sections[section] })}><div lang="es">{legalPreview[section]}</div></div>
								</details>
							{/each}
						{:else}
							<p class="bc-hint">{messages.admin.legalPreviewPending}</p>
						{/if}
						<Button type="button" variant="outline" disabled={pending || !legalPreview} onclick={customize}>{messages.admin.legalCustomize}</Button>
					{:else}
						<p class="bc-hint">{messages.admin.legalCustomHint}</p>
						{#each sectionKeys as section (section)}
							<label class="bc-field"><span>{formatMessage(messages.admin.legalLabel, { section: messages.waiver.sections[section] })}</span>
								<textarea name={`legal_es_${section}`} lang="es" rows="8" maxlength="30000" bind:value={customLegal[section]} oninput={() => legalApproved = false} required></textarea>
							</label>
						{/each}
						<Button type="button" variant="outline" disabled={pending} onclick={() => { legalSource = 'standard'; legalApproved = false; }}>{messages.admin.legalRestore}</Button>
					{/if}
					<label class="bc-check"><input type="checkbox" name="legalApproved" value="true" bind:checked={legalApproved} disabled={legalSource === 'standard' && !legalPreview} />{messages.admin.legalApproved}</label>
				</section>
				<div class="bc-actions">
					<Button type="submit" disabled={pending}>{pending ? messages.common.saving : messages.admin.saveEvent}</Button>
					<Button type="button" variant="outline" disabled={pending} onclick={oncancel}>{messages.common.cancel}</Button>
				</div>
			</fieldset>
		{/snippet}
	</ActionForm>
</Card.Root>
