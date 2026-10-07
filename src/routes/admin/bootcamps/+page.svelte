<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import ActionForm from '#lib/bootcamp/ActionForm.svelte';
	import FormFeedback from '#lib/bootcamp/FormFeedback.svelte';
	import { sectionKeys, eventTimeZone } from '#lib/bootcamp/types.ts';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import { formatMessage } from '#lib/i18n/translations.ts';
	import type { PageProps } from './$types';
	import '#lib/bootcamp/bootcamp.css';

	let { data, form }: PageProps = $props();
	const language = useLanguage();
	const messages = $derived(language.messages.bootcamp);
	const date = (value: string) => new Intl.DateTimeFormat(language.current === 'es' ? 'es-PR' : 'en-US', {
		dateStyle: 'medium', timeStyle: 'short', timeZone: eventTimeZone, hourCycle: 'h23'
	}).format(new Date(value));
</script>

<svelte:head>
	<title>{messages.admin.pageTitle}</title>
	<meta name="description" content={messages.admin.description} />
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="bootcamp bc-admin" lang={language.current}>
	<header class="bc-heading"><p class="bc-eyebrow">{messages.title}</p><h1>{messages.admin.title}</h1></header>
	<FormFeedback result={form} />
	<section class="bc-stack" aria-label={messages.admin.events}>
		<div class="bc-card-heading">
			<h2>{messages.admin.events}</h2>
			<div class="bc-actions">
				<Button variant="outline" href="#bootcamp-reports">{messages.admin.reports}</Button>
				<Button href={resolve('/admin/bootcamps/activate')}>{messages.admin.create}</Button>
			</div>
		</div>
		{#each data.events as event (event.id)}
			{@const mayOpen = data.paymentEnabled && data.driveEnabled && event.legalApproved && sectionKeys.every((section) => event.legal.en[section].trim() && event.legal.es[section].trim())}
			<Card.Root class="bc-card">
				<div class="bc-card-heading">
					<div><h3>{event.title}</h3><p class="bc-hint">{event.venue}</p><p class="bc-hint">{date(event.startsAt)}</p><p class="bc-hint">{formatMessage(messages.event.revision, { revision: event.revision })}</p></div>
					<span class="bc-status" class:bc-status-open={event.registrationOpen}>{event.registrationOpen ? messages.event.open : messages.event.closed}</span>
				</div>
				<p class="bc-hint">{event.legalApproved ? messages.admin.approved : messages.admin.unapproved}</p>
				<div class="bc-actions">
					<Button variant="outline" href={resolve('/admin/bootcamps/[eventId]/edit', { eventId: event.id })}>{messages.admin.edit}</Button>
					<Button variant="outline" href={resolve('/admin/bootcamps/[eventId]/report', { eventId: event.id })}>{messages.admin.report}</Button>
					<ActionForm action="?/toggle">
						{#snippet children(pending)}
							<input type="hidden" name="eventId" value={event.id} /><input type="hidden" name="revision" value={event.revision} /><input type="hidden" name="open" value={event.registrationOpen ? 'false' : 'true'} />
							<Button type="submit" variant="outline" disabled={pending || (!event.registrationOpen && !mayOpen)}>{event.registrationOpen ? messages.admin.close : messages.admin.open}</Button>
						{/snippet}
					</ActionForm>
				</div>
			</Card.Root>
		{:else}<p class="bc-notice">{messages.empty}</p>{/each}
	</section>
	<section class="bc-section mt-6" aria-labelledby="bootcamp-reports">
		<h2 id="bootcamp-reports" tabindex="-1">{messages.admin.reports}</h2>
		{#if data.events.length}
			<p class="bc-hint">{messages.admin.selectEvent}</p>
			<ul class="bc-stack">
				{#each data.events as event (event.id)}
					<li class="bc-card-heading">
						<div><h3>{event.title}</h3><p class="bc-hint">{date(event.startsAt)}</p></div>
						<Button variant="outline" href={resolve('/admin/bootcamps/[eventId]/report', { eventId: event.id })} aria-label={formatMessage(messages.admin.viewReportFor, { title: event.title })}>{messages.admin.viewReport}</Button>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="bc-hint">{messages.admin.noReports}</p>
		{/if}
	</section>
</div>
