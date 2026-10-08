<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '#lib/components/ui/button/index.js';
	import ActionForm from '#lib/bootcamp/ActionForm.svelte';
	import FormFeedback from '#lib/bootcamp/FormFeedback.svelte';
	import { eventTimeZone } from '#lib/bootcamp/types.ts';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import { formatMessage } from '#lib/i18n/translations.ts';
	import type { PageProps } from './$types';
	import '#lib/bootcamp/bootcamp.css';

	let { data, form }: PageProps = $props();
	const language = useLanguage();
	const messages = $derived(language.messages.bootcamp);
	const ready = $derived(data.paymentEnabled && data.driveEnabled);
	const activeEventId = $derived(data.events.find((event) => event.registrationOpen && Date.parse(event.registrationClosesAt) > Date.now())?.id);
	const mayActivate = $derived(ready && !activeEventId);
	const date = (value: string) => new Intl.DateTimeFormat(language.current === 'es' ? 'es-PR' : 'en-US', {
		dateStyle: 'medium', timeStyle: 'short', timeZone: eventTimeZone, hourCycle: 'h23'
	}).format(new Date(value));
</script>

<svelte:head>
	<title>{messages.admin.pageTitle}</title>
	<meta name="description" content={messages.admin.description} />
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="bootcamp bc-admin bc-ledger" lang={language.current}>
	<nav class="bc-ledger-nav" aria-label={messages.admin.title}>
		<Button variant="secondary" href={resolve('/admin/bootcamps')} aria-current="page">{messages.admin.events}</Button>
		<Button variant="ghost" href={resolve('/admin/bootcamps/activate')} disabled={!mayActivate} aria-describedby="bootcamp-activation-guard">{messages.admin.create}</Button>
	</nav>
	<div class="bc-ledger-main">
		<header class="bc-ledger-heading">
			<h1>{messages.admin.title}</h1>
			<Button href={resolve('/admin/bootcamps/activate')} disabled={!mayActivate} aria-describedby="bootcamp-activation-guard">{messages.admin.create}</Button>
		</header>
		<FormFeedback result={form} />
		<p class="bc-hint" id="bootcamp-activation-guard">{activeEventId ? messages.errors.activeEvent : messages.admin.activationGuard}</p>
		<!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard access to the horizontally scrolling event ledger.) -->
		<div class="bc-table-scroll" role="region" tabindex="0" aria-label={messages.admin.events}>
			<table class="bc-ledger-table">
				<caption class="sr-only">{messages.admin.events}</caption>
				<thead><tr><th scope="col">{messages.admin.titleField}</th><th scope="col">{messages.admin.eventDate}</th><th scope="col">{messages.admin.status}</th><th scope="col">{messages.admin.actions}</th></tr></thead>
				<tbody>
					{#each data.events as event (event.id)}
						{@const mayOpen = ready && !activeEventId && Date.parse(event.registrationClosesAt) > Date.now()}
						{@const isOpen = event.registrationOpen && Date.parse(event.registrationClosesAt) > Date.now()}
						<tr>
							<th scope="row"><a class="bc-ledger-event-link" href={resolve('/admin/bootcamps/[eventId]/edit', { eventId: event.id })}>{event.title}</a><span class="bc-document-status">{event.venue}</span><span class="bc-document-status">{formatMessage(messages.event.revision, { revision: event.revision })}</span></th>
							<td>{date(event.startsAt)}</td>
							<td><span class="bc-status" class:bc-status-open={isOpen}>{isOpen ? messages.event.open : messages.event.closed}</span></td>
							<td><div class="bc-actions">
								<Button size="sm" variant="outline" href={resolve('/admin/bootcamps/[eventId]/edit', { eventId: event.id })}>{messages.admin.edit}</Button>
								<Button size="sm" variant="outline" href={resolve('/admin/bootcamps/[eventId]/report', { eventId: event.id })} aria-label={formatMessage(messages.admin.viewReportFor, { title: event.title })}>{messages.admin.viewReport}</Button>
								<ActionForm action="?/toggle">
									{#snippet children(pending)}
										<input type="hidden" name="eventId" value={event.id} /><input type="hidden" name="revision" value={event.revision} /><input type="hidden" name="open" value={event.registrationOpen ? 'false' : 'true'} />
										<Button size="sm" type="submit" variant="outline" disabled={pending || (!event.registrationOpen && !mayOpen)} aria-describedby="bootcamp-activation-guard">{event.registrationOpen ? messages.admin.close : messages.admin.open}</Button>
									{/snippet}
								</ActionForm>
							</div></td>
						</tr>
					{:else}<tr><td colspan="4">{messages.empty}</td></tr>{/each}
				</tbody>
			</table>
		</div>
		<footer class="bc-ledger-footer">
			<div class="bc-actions" aria-label={messages.admin.connections}>
				<span class="bc-hint">{data.paymentEnabled ? messages.admin.paymentReady : messages.admin.paymentMissing}</span>
				<span class="bc-hint">{data.driveEnabled ? messages.admin.driveReady : messages.admin.driveMissing}</span>
			</div>
			<Button size="sm" variant="ghost" href={resolve('/admin/bootcamps/mockups')}>{language.messages.bootcampMockups.designs}</Button>
		</footer>
	</div>
</div>
