<script lang="ts">
	import { untrack } from 'svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import { formatMessage, languages } from '#lib/i18n/translations.ts';
	import ActionForm from './ActionForm.svelte';
	import { eventTimeZone, sectionKeys, type BootcampEvent } from './types';

	let { event, oncancel }: { event?: BootcampEvent; oncancel: () => void } = $props();
	let legalApproved = $state(untrack(() => event?.legalApproved ?? false));
	const language = useLanguage();
	const messages = $derived(language.messages.bootcamp);
	const dateFields = ['startsAt', 'endsAt', 'arrivalAt', 'registrationClosesAt'] as const;

	function localDate(value?: string) {
		if (!value) return '';
		const parts = new Intl.DateTimeFormat('en-CA', {
			timeZone: eventTimeZone, year: 'numeric', month: '2-digit', day: '2-digit',
			hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
		}).formatToParts(new Date(value));
		const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
		return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}`;
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
				<div class="bc-fields">
					<label class="bc-field"><span>{messages.admin.titleField}</span><input name="title" value={event?.title ?? ''} maxlength="200" required /></label>
					<label class="bc-field"><span>{messages.admin.venue}</span><input name="venue" value={event?.venue ?? ''} maxlength="300" required /></label>
					{#each dateFields as field (field)}
						<label class="bc-field"><span>{messages.event[field]}</span><input type="datetime-local" step="1" name={field} value={localDate(event?.[field])} required /></label>
					{/each}
				</div>
				<p class="bc-hint">{messages.admin.timeZone}</p>
				<section class="bc-section">
					<h3>{messages.admin.legal}</h3>
					<p class="bc-hint">{messages.admin.legalHint}</p>
					{#each languages as { code } (code)}
						{#each sectionKeys as section (section)}
							<label class="bc-field"><span>{formatMessage(messages.admin.legalLabel, { section: messages.waiver.sections[section], language: messages.common.languages[code] })}</span>
								<textarea name={`legal_${code}_${section}`} lang={code} rows="8" value={event?.legal[code][section] ?? ''} oninput={() => legalApproved = false} required></textarea>
							</label>
						{/each}
					{/each}
					<label class="bc-check"><input type="checkbox" name="legalApproved" value="true" bind:checked={legalApproved} />{messages.admin.legalApproved}</label>
				</section>
				<div class="bc-actions">
					<Button type="submit" disabled={pending}>{pending ? messages.common.saving : messages.admin.saveEvent}</Button>
					<Button type="button" variant="outline" disabled={pending} onclick={oncancel}>{messages.common.cancel}</Button>
				</div>
			</fieldset>
		{/snippet}
	</ActionForm>
</Card.Root>
