<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '#lib/components/ui/button/index.js';
	import ActionForm from '#lib/bootcamp/ActionForm.svelte';
	import FormFeedback from '#lib/bootcamp/FormFeedback.svelte';
	import { eventTimeZone, type ReportRow } from '#lib/bootcamp/types.ts';
	import { classTypes, filterReport, summarizeReport, type ClassFilter, type ReportFilter } from '#lib/bootcamp/report.ts';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import { formatMessage } from '#lib/i18n/translations.ts';
	import type { PageProps } from './$types';
	import '#lib/bootcamp/bootcamp.css';

	let { data, form }: PageProps = $props();
	const reportColumns = ['name', 'classType', 'eligibility', 'status', 'paymentStatus', 'paid', 'remaining', 'documents'] as const;
	const language = useLanguage();
	const messages = $derived(language.messages.bootcamp);
	let search = $state('');
	let classFilter = $state<ClassFilter>('all');
	let registrationFilter = $state<ReportFilter>('all');
	const summary = $derived(summarizeReport(data.report));
	const visible = $derived(filterReport(data.report, search, classFilter, registrationFilter));
	const money = (cents: number) => new Intl.NumberFormat(language.current === 'es' ? 'es-PR' : 'en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
	const date = (value: string) => new Intl.DateTimeFormat(language.current === 'es' ? 'es-PR' : 'en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: eventTimeZone, hourCycle: 'h23' }).format(new Date(value));
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

<div class="bootcamp bc-admin bc-ledger" lang={language.current}>
	<nav class="bc-ledger-nav" aria-label={messages.admin.title}>
		<Button variant="ghost" href={resolve('/admin/bootcamps')}>{messages.admin.events}</Button>
		<Button variant="ghost" href={resolve('/admin/bootcamps/[eventId]/edit', { eventId: data.event.id })}>{messages.admin.edit}</Button>
		<Button variant="secondary" href={resolve('/admin/bootcamps/[eventId]/report', { eventId: data.event.id })} aria-current="page">{messages.admin.report}</Button>
	</nav>
	<div class="bc-ledger-main">
		<header class="bc-ledger-heading">
			<div><p class="bc-eyebrow">{data.event.title}</p><h1>{messages.admin.report}</h1><p class="bc-hint">{date(data.event.startsAt)} · {data.event.venue}</p></div>
			<Button size="sm" variant="outline" href={`${resolve('/admin/bootcamps/report')}?event=${encodeURIComponent(data.event.id)}&language=${language.current}`}>{messages.admin.csvAll}</Button>
		</header>
		<FormFeedback result={form} />
		<dl class="bc-ledger-stats">
			<div><dt>{messages.admin.started}</dt><dd>{summary.started}<small> / {summary.total}</small></dd></div>
			<div><dt>{messages.admin.confirmed}</dt><dd>{summary.confirmed}</dd></div>
			<div><dt>{messages.admin.collected}</dt><dd>{money(summary.paidCents)}</dd></div>
			<div><dt>{messages.admin.outstanding}</dt><dd>{money(summary.remainingCents)}</dd></div>
		</dl>
		<section class="bc-ledger-coverage" aria-label={messages.admin.coverage}>
			{#each summary.classes as group (group.classType)}
				<div><div class="bc-card-heading"><h2>{messages.admin.classTypes[group.classType]}</h2><strong>{group.started} / {group.total}</strong></div>
					<progress aria-label={formatMessage(messages.admin.coverageFor, { classType: messages.admin.classTypes[group.classType] })} value={group.started} max={group.total || 1}></progress>
					<p class="bc-hint">{messages.admin.coverage} · {group.percent}% <span>· {messages.admin.confirmed}: {group.confirmed}</span></p>
				</div>
			{/each}
		</section>
		<p class="bc-hint">{messages.payment.recordsNotice}</p>
		<div class="bc-ledger-toolbar">
			<label class="bc-ledger-search"><span class="sr-only">{messages.admin.search}</span><input type="search" bind:value={search} placeholder={messages.admin.searchPlaceholder} /></label>
			<div class="bc-actions" role="group" aria-label={messages.admin.classFilters}>
				<Button size="sm" variant={classFilter === 'all' ? 'secondary' : 'ghost'} aria-pressed={classFilter === 'all'} onclick={() => classFilter = 'all'}>{messages.admin.allClasses}</Button>
				{#each classTypes as classType}<Button size="sm" variant={classFilter === classType ? 'secondary' : 'ghost'} aria-pressed={classFilter === classType} onclick={() => classFilter = classType}>{messages.admin.classTypes[classType]}</Button>{/each}
			</div>
		</div>
		<div class="bc-actions bc-ledger-filters" role="group" aria-label={messages.admin.registrationFilters}>
			{#each ['all', 'started', 'confirmed', 'not_started'] as choice}
				<Button size="sm" variant={registrationFilter === choice ? 'secondary' : 'ghost'} aria-pressed={registrationFilter === choice} onclick={() => registrationFilter = choice as ReportFilter}>{choice === 'all' ? messages.admin.allStudents : choice === 'not_started' ? messages.admin.notStarted : messages.admin[choice as 'started' | 'confirmed']}</Button>
			{/each}
		</div>
		<!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users need to focus this region to scroll the report on small screens.) -->
		<div class="bc-table-scroll" role="region" tabindex="0" aria-label={messages.admin.report}>
			<table class="bc-ledger-table">
				<caption class="sr-only">{data.event.title} — {messages.admin.report}</caption>
				<thead><tr>{#each reportColumns as column}<th scope="col">{messages.admin[column]}</th>{/each}</tr></thead>
				<tbody>
					{#each visible as row (row.studentId)}
						<tr>
							<th scope="row">{row.name}<span class="bc-document-status">{row.email}</span></th><td><span class="bc-status">{messages.admin.classTypes[row.classType]}</span></td><td>{messages.admin.eligibilities[row.eligibility]}</td><td><span class="bc-status" class:bc-status-open={row.status === 'confirmed'}>{messages.admin.statuses[row.status]}</span></td>
							<td>{paymentStatus(row)}{#if row.paymentUncertain}<p class="bc-hint">{messages.payment.verificationAttention}</p>{/if}</td>
							<td class="bc-ledger-money">{money(row.paidCents)}</td>
							<td class="bc-ledger-money">{money(row.remainingCents)}{#if row.remainingCents > 0}<span class="bc-document-status">{messages.payment.remainingFlag}</span>{/if}</td>
							<td><ul class="bc-documents">
								{#each row.documents as document (document.id)}
									<li><a href={resolve('/bootcamps/documents/[id]', { id: document.id })}>{messages.event.documentKinds[document.kind]}</a><span class="bc-document-status">{formatMessage(messages.admin.backup, { status: backupStatus(document.backupStatus) })}</span></li>
								{:else}<li>{messages.admin.noDocuments}</li>{/each}
							</ul></td>
						</tr>
					{:else}<tr><td colspan={reportColumns.length}>{data.report.length ? messages.admin.noMatches : messages.admin.reportEmpty}</td></tr>{/each}
				</tbody>
			</table>
		</div>
		<details class="bc-ledger-tools">
			<summary>{messages.admin.tools}</summary>
			<div class="bc-actions">
				<ActionForm action="?/retryBackups">
					{#snippet children(pending)}<input type="hidden" name="eventId" value={data.event.id} /><Button size="sm" type="submit" variant="outline" disabled={pending || !data.driveEnabled}>{messages.admin.retryBackups}</Button>{/snippet}
				</ActionForm>
				<ActionForm action="?/reconcile">
					{#snippet children(pending)}<input type="hidden" name="eventId" value={data.event.id} /><Button size="sm" type="submit" variant="outline" disabled={pending || !data.paymentEnabled}>{messages.admin.reconcile}</Button>{/snippet}
				</ActionForm>
			</div>
		</details>
	</div>
</div>
