<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '#lib/components/ui/button/index.js';
	import ActionForm from '#lib/bootcamp/ActionForm.svelte';
	import FormFeedback from '#lib/bootcamp/FormFeedback.svelte';
	import type { ReportRow } from '#lib/bootcamp/types.ts';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import { formatMessage } from '#lib/i18n/translations.ts';
	import type { PageProps } from './$types';
	import '#lib/bootcamp/bootcamp.css';

	let { data, form }: PageProps = $props();
	const reportColumns = ['name', 'email', 'eligibility', 'status', 'paymentStatus', 'paid', 'remaining', 'documents'] as const;
	const language = useLanguage();
	const messages = $derived(language.messages.bootcamp);
	const money = (cents: number) => new Intl.NumberFormat(language.current === 'es' ? 'es-PR' : 'en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
	function paymentStatus(row: ReportRow) {
		const labels = messages.payment.statuses;
		return row.paymentStatus && Object.hasOwn(labels, row.paymentStatus)
			? labels[row.paymentStatus as keyof typeof labels] : row.paymentStatus ? labels.unknown : labels.not_started;
	}
	function backupStatus(status: string) {
		const labels = messages.admin.backups;
		return Object.hasOwn(labels, status) ? labels[status as keyof typeof labels] : labels.unknown;
	}
</script>

<svelte:head>
	<title>{formatMessage(messages.admin.reportPageTitle, { title: data.event.title })}</title>
	<meta name="description" content={messages.admin.reportDescription} />
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="bootcamp bc-admin" lang={language.current}>
	<header class="bc-heading">
		<div class="bc-actions">
			<Button variant="outline" href={resolve('/admin/bootcamps')}>{messages.admin.backToEvents}</Button>
			<Button variant="outline" href={resolve('/admin/bootcamps/[eventId]/edit', { eventId: data.event.id })}>{messages.admin.edit}</Button>
		</div>
		<p class="bc-eyebrow">{data.event.title}</p>
		<h1>{messages.admin.report}</h1>
	</header>
	<FormFeedback result={form} />
	<section class="bc-stack" aria-label={messages.admin.report}>
		<p class="bc-hint">{messages.payment.recordsNotice}</p>
		<div class="bc-actions">
			<Button variant="outline" href={`${resolve('/admin/bootcamps/report')}?event=${encodeURIComponent(data.event.id)}&language=${language.current}`}>{messages.admin.csv}</Button>
			<ActionForm action="?/retryBackups">
				{#snippet children(pending)}<input type="hidden" name="eventId" value={data.event.id} /><Button type="submit" variant="outline" disabled={pending || !data.driveEnabled}>{messages.admin.retryBackups}</Button>{/snippet}
			</ActionForm>
			<ActionForm action="?/reconcile">
				{#snippet children(pending)}<input type="hidden" name="eventId" value={data.event.id} /><Button type="submit" variant="outline" disabled={pending || !data.paymentEnabled}>{messages.admin.reconcile}</Button>{/snippet}
			</ActionForm>
		</div>
		<!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users need to focus this region to scroll the wide report on small screens.) -->
		<div class="bc-table-scroll" role="region" tabindex="0" aria-label={messages.admin.report}>
			<table>
				<caption>{data.event.title}</caption>
				<thead><tr>{#each reportColumns as column}<th scope="col">{messages.admin[column]}</th>{/each}</tr></thead>
				<tbody>
					{#each data.report as row (row.studentId)}
						<tr>
							<th scope="row">{row.name}</th><td>{row.email}</td><td>{messages.admin.eligibilities[row.eligibility]}</td><td>{messages.admin.statuses[row.status]}</td>
							<td>{paymentStatus(row)}{#if row.paymentUncertain}<p class="bc-hint">{messages.payment.verificationAttention}</p>{/if}</td>
							<td>{money(row.paidCents)}</td>
							<td>{money(row.remainingCents)}{#if row.remainingCents > 0}<span class="bc-document-status">{messages.payment.remainingFlag}</span>{/if}</td>
							<td><ul class="bc-documents">
								{#each row.documents as document (document.id)}
									<li><a href={resolve('/bootcamps/documents/[id]', { id: document.id })}>{messages.event.documentKinds[document.kind]}</a><span class="bc-document-status">{formatMessage(messages.admin.backup, { status: backupStatus(document.backupStatus) })}</span></li>
								{:else}<li>{messages.admin.noDocuments}</li>{/each}
							</ul></td>
						</tr>
					{:else}<tr><td colspan={reportColumns.length}>{messages.admin.reportEmpty}</td></tr>{/each}
				</tbody>
			</table>
		</div>
	</section>
</div>
