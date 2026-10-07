<script lang="ts">
	import { resolve } from '$app/paths';

	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import ActionForm from '#lib/bootcamp/ActionForm.svelte';
	import EventEditor from '#lib/bootcamp/EventEditor.svelte';
	import FormFeedback from '#lib/bootcamp/FormFeedback.svelte';
	import { sectionKeys, eventTimeZone, type AdminBootcampPage, type ReportRow } from '#lib/bootcamp/types.ts';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import { formatMessage } from '#lib/i18n/translations.ts';
	import '#lib/bootcamp/bootcamp.css';

	let { data, form }: { data: AdminBootcampPage; form?: { error?: string; success?: boolean } | null } = $props();
	const basePath = resolve('/').replace(/\/$/, '');
	const reportColumns = ['name', 'email', 'eligibility', 'status', 'paymentStatus', 'paid', 'remaining', 'documents'] as const;
	const language = useLanguage();
	const messages = $derived(language.messages.bootcamp);
	let editingId = $state<string | null | undefined>(undefined);
	const editing = $derived(data.events.find((event) => event.id === editingId));
	const selected = $derived(data.events.find((event) => event.id === data.selectedEventId));
	const money = (cents: number) => new Intl.NumberFormat(language.current === 'es' ? 'es-PR' : 'en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
	const date = (value: string) => new Intl.DateTimeFormat(language.current === 'es' ? 'es-PR' : 'en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: eventTimeZone }).format(new Date(value));
	function paymentStatus(row: ReportRow & { paymentStatus?: string }) {
		const labels = messages.payment.statuses;
		return row.paymentStatus && Object.hasOwn(labels, row.paymentStatus)
			? labels[row.paymentStatus as keyof typeof labels] : row.paymentStatus ? labels.unknown : labels.not_started;
	}
	function paymentNeedsAttention(row: ReportRow & { paymentUncertain?: boolean }) {
		return row.paymentUncertain === true;
	}
	function backupStatus(status: string) {
		const labels = messages.admin.backups;
		return Object.hasOwn(labels, status) ? labels[status as keyof typeof labels] : labels.unknown;
	}
</script>

<svelte:head>
	<title>{messages.admin.pageTitle}</title>
	<meta name="description" content={messages.admin.description} />
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="bootcamp bc-admin" lang={language.current}>
	<header class="bc-heading"><p class="bc-eyebrow">{messages.title}</p><h1>{messages.admin.title}</h1></header>
	<FormFeedback result={form} />
	<div class="bc-stack">

		<section class="bc-stack" aria-label={messages.admin.events}>
			<div class="bc-card-heading"><h2>{messages.admin.events}</h2><Button type="button" onclick={() => editingId = null}>{messages.admin.create}</Button></div>
			{#if editingId !== undefined}
				{#key editing ? `${editing.id}:${editing.revision}` : 'new'}<EventEditor event={editing} oncancel={() => editingId = undefined} />{/key}
			{/if}
			{#each data.events as event (event.id)}
				{@const mayOpen = data.paymentEnabled && data.driveEnabled && event.legalApproved && sectionKeys.every((section) => event.legal.en[section].trim() && event.legal.es[section].trim())}
				<Card.Root class="bc-card">
					<div class="bc-card-heading">
						<div><h3>{event.title}</h3><p class="bc-hint">{event.venue}</p><p class="bc-hint">{date(event.startsAt)}</p><p class="bc-hint">{formatMessage(messages.event.revision, { revision: event.revision })}</p></div>
						<span class="bc-status" class:bc-status-open={event.registrationOpen}>{event.registrationOpen ? messages.event.open : messages.event.closed}</span>
					</div>
					<p class="bc-hint">{event.legalApproved ? messages.admin.approved : messages.admin.unapproved}</p>
					<div class="bc-actions">
						<Button type="button" variant="outline" onclick={() => editingId = event.id}>{messages.admin.edit}</Button>
						<Button variant="outline" href={`?event=${encodeURIComponent(event.id)}`} aria-current={data.selectedEventId === event.id ? 'true' : undefined}>{messages.admin.report}</Button>
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

		<Card.Root class="bc-card">
			<h2>{messages.admin.linkTitle}</h2>
			<p class="bc-hint">{messages.admin.linkHint}</p>
			<ActionForm action="?/linkStudent">
				{#snippet children(pending)}
					<fieldset disabled={pending} class="bc-stack">
						<div class="bc-fields">
							<label class="bc-field"><span>{messages.admin.studentEmail}</span><input type="email" name="studentEmail" autocomplete="off" required /></label>
							<label class="bc-field"><span>{messages.admin.accountEmail}</span><input type="email" name="accountEmail" autocomplete="off" required /></label>
						</div>
						<div class="bc-actions"><Button type="submit" disabled={pending}>{pending ? messages.common.saving : messages.admin.link}</Button></div>
					</fieldset>
				{/snippet}
			</ActionForm>
		</Card.Root>

		<section class="bc-stack" aria-label={messages.admin.report}>
			<h2>{messages.admin.report}</h2>
			<p class="bc-hint">{messages.payment.recordsNotice}</p>
			{#if selected}
				<div class="bc-actions">
					<Button variant="outline" href={`${basePath}/admin/bootcamps/report?event=${encodeURIComponent(selected.id)}&language=${language.current}`}>{messages.admin.csv}</Button>
					<ActionForm action="?/retryBackups">
						{#snippet children(pending)}<input type="hidden" name="eventId" value={selected.id} /><Button type="submit" variant="outline" disabled={pending || !data.driveEnabled}>{messages.admin.retryBackups}</Button>{/snippet}
					</ActionForm>
					<ActionForm action="?/reconcile">
						{#snippet children(pending)}<input type="hidden" name="eventId" value={selected.id} /><Button type="submit" variant="outline" disabled={pending || !data.paymentEnabled}>{messages.admin.reconcile}</Button>{/snippet}
					</ActionForm>
				</div>
				<!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users need to focus this region to scroll the wide report on small screens.) -->
				<div class="bc-table-scroll" role="region" tabindex="0" aria-label={messages.admin.report}>
					<table>
						<caption>{selected.title}</caption>
						<thead><tr>{#each reportColumns as column}<th scope="col">{messages.admin[column]}</th>{/each}</tr></thead>
						<tbody>
							{#each data.report as row (row.studentId)}
								<tr>
									<th scope="row">{row.name}</th><td>{row.email}</td><td>{messages.admin.eligibilities[row.eligibility]}</td><td>{messages.admin.statuses[row.status]}</td>
									<td>{paymentStatus(row)}{#if paymentNeedsAttention(row)}<p class="bc-hint">{messages.payment.verificationAttention}</p>{/if}</td>
									<td>{money(row.paidCents)}</td>
									<td>{money(row.remainingCents)}{#if row.remainingCents > 0}<span class="bc-document-status">{messages.payment.remainingFlag}</span>{/if}</td>
									<td><ul class="bc-documents">
										{#each row.documents as document (document.id)}
											<li><a href={`${basePath}/bootcamps/documents/${encodeURIComponent(document.id)}`}>{messages.event.documentKinds[document.kind]}</a><span class="bc-document-status">{formatMessage(messages.admin.backup, { status: backupStatus(document.backupStatus) })}</span></li>
										{:else}<li>{messages.admin.noDocuments}</li>{/each}
									</ul></td>
								</tr>
							{:else}<tr><td colspan={reportColumns.length}>{messages.admin.reportEmpty}</td></tr>{/each}
						</tbody>
					</table>
				</div>
			{:else}<p class="bc-hint">{messages.admin.selectEvent}</p>{/if}
		</section>
	</div>
</div>
