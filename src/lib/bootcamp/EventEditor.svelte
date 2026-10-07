<script lang="ts">
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { Button } from '#lib/components/ui/button/index.js';

	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import { formatMessage } from '#lib/i18n/translations.ts';
	import ActionForm from './ActionForm.svelte';
	import { defaultLegalText, usesDefaultLegalText } from './legal';
	import { eventTimePattern, parseEventSchedule } from './rules';
	import { eventTimeZone, sectionKeys, type BootcampEvent } from './types';

	let { event }: { event?: BootcampEvent } = $props();
	let legalSource = $state<'standard' | 'custom'>(untrack(() => !event || usesDefaultLegalText(event) ? 'standard' : 'custom'));
	let customLegal = $state(untrack(() => ({ agreement: event?.legal.es.agreement ?? '', liability: event?.legal.es.liability ?? '', media: event?.legal.es.media ?? '' })));
	const language = useLanguage();
	const messages = $derived(language.messages.bootcamp);
	const timeFields = ['startTime', 'endTime'] as const;
	let details = $state(untrack(() => {
		const start = localDate(event?.startsAt);
		const end = localDate(event?.endsAt);
		return {
			title: event?.title ?? '', venue: event?.venue ?? '', eventDate: start.slice(0, 10), startTime: start.slice(11),
			// Older multi-day events need an explicit same-day end time before they can be saved.
			endTime: start.slice(0, 10) === end.slice(0, 10) ? end.slice(11) : ''
		};
	}));
	const schedule = $derived(parseEventSchedule(details.eventDate, details.startTime, details.endTime));
	let legalApproved = $state(untrack(() => {
		if (!event?.legalApproved || !schedule) return false;
		return (['startsAt', 'endsAt', 'arrivalAt', 'registrationClosesAt'] as const)
			.every((key) => schedule[key].getTime() === Date.parse(event[key]));
	}));
	const legalPreview = $derived.by(() => {
		const venue = details.venue.trim().normalize('NFC');
		return venue && schedule ? defaultLegalText({ venue, ...schedule }).es : null;
	});
	const formatDate = (value: Date) => new Intl.DateTimeFormat(language.current === 'es' ? 'es-PR' : 'en-US', {
		timeZone: eventTimeZone, dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23'
	}).format(value);

	function localDate(value?: string) {
		if (!value) return '';
		const parts = new Intl.DateTimeFormat('en-CA', {
			timeZone: eventTimeZone, year: 'numeric', month: '2-digit', day: '2-digit',
			hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
		}).formatToParts(new Date(value));
		const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
		return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
	}

	function customize() {
		if (!legalPreview) return;
		customLegal = { ...legalPreview };
		legalSource = 'custom';
		legalApproved = false;
	}
</script>

<section class="bc-ledger-editor">
	<p class="bc-hint">{messages.common.required}</p>
	{#if event}<p class="bc-notice">{messages.admin.editWarning}</p>{/if}
	<ActionForm action="?/saveEvent">
		{#snippet children(pending)}
			<fieldset disabled={pending} class="bc-stack">
				{#if event}
					<input type="hidden" name="id" value={event.id} /><input type="hidden" name="revision" value={event.revision} />
					<input type="hidden" name="legalSource" value={legalSource} />
				{/if}
				<div class="bc-table-scroll">
					<table class="bc-ledger-form-table">
						<caption class="sr-only">{event ? messages.admin.edit : messages.admin.create}</caption>
						<tbody>
							<tr>
								<th scope="row"><label for="bootcamp-title">{messages.admin.titleField}</label></th>
								<td><input id="bootcamp-title" name="title" bind:value={details.title} oninput={() => legalApproved = false} maxlength="200" required /></td>
							</tr>
							<tr>
								<th scope="row"><label for="bootcamp-venue">{messages.admin.venue}</label></th>
								<td><input id="bootcamp-venue" name="venue" bind:value={details.venue} oninput={() => legalApproved = false} maxlength="300" required /></td>
							</tr>
							<tr>
								<th scope="row"><label for="bootcamp-event-date">{messages.admin.eventDate}</label></th>
								<td><input id="bootcamp-event-date" type="date" name="eventDate" bind:value={details.eventDate} oninput={() => legalApproved = false} required /></td>
							</tr>
							{#each timeFields as field (field)}
								<tr>
									<th scope="row"><label for={`bootcamp-${field}`}>{messages.admin[field]}</label></th>
									<td><input id={`bootcamp-${field}`} type="text" name={field} bind:value={details[field]} pattern={eventTimePattern} maxlength="5" placeholder={messages.admin.timePlaceholder} aria-describedby="bootcamp-schedule-hint" autocomplete="off" oninput={() => legalApproved = false} required /></td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<p class="bc-hint" id="bootcamp-schedule-hint">{messages.admin.scheduleHint} {messages.admin.timeZone}</p>
				<p class="bc-hint">{messages.admin.scheduleAutomatic}</p>
				{#if schedule}
					<dl class="bc-details bc-ledger-schedule" aria-live="polite">
						<div><dt>{messages.event.arrivalAt}</dt><dd>{formatDate(schedule.arrivalAt)}</dd></div>
						<div><dt>{messages.event.registrationClosesAt}</dt><dd>{formatDate(schedule.registrationClosesAt)}</dd></div>
					</dl>
				{/if}
				{#if event}
					<section class="bc-section bc-ledger-legal">
						<h2>{messages.admin.legal}</h2>
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
				{/if}
				<div class="bc-actions">
					<Button type="submit" disabled={pending}>{pending ? messages.common.saving : messages.admin.saveEvent}</Button>
					<Button variant="outline" disabled={pending} href={resolve('/admin/bootcamps')}>{messages.common.cancel}</Button>
				</div>
			</fieldset>
		{/snippet}
	</ActionForm>
</section>
