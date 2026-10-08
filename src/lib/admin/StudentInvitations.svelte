
<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { page } from '$app/state';
	import { asset, resolve } from '$app/paths';

	import AdminIcon from '#lib/admin/AdminIcon.svelte';
	import ChoiceGroup from '#lib/components/ChoiceGroup.svelte';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import { formatMessage } from '#lib/i18n/translations.ts';

	import { MAX_IMPORT_BYTES, type StudentInvitation, type StudentImportResult, type InvitationActionData } from '#lib/student-invitations.ts';

	let { invitations, invitationPage, hasMoreInvitations }: {
		invitations: StudentInvitation[];
		invitationPage: number;
		hasMoreInvitations: boolean;
	} = $props();
	const language = useLanguage();
	const messages = $derived(language.messages.admin.studentImport);
	const roster = $derived(language.messages.admin.roster);
	const common = $derived(language.messages.admin.common);
	const id = $props.id();
	const numbers = $derived(new Intl.NumberFormat(language.current));
	const dates = $derived(new Intl.DateTimeFormat(language.current, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }));
	const actionData = $derived(page.form as InvitationActionData | null);
	const serverImport = $derived(actionData?.studentImport ?? null);
	const resendResult = $derived(actionData?.invitationResend ?? null);
	// Compare server response identity without wrapping the receipt markers in proxies.
	let clearedImport = $state.raw<StudentImportResult | null>(null);
	let usedReview = $state.raw<StudentImportResult | null>(null);
	const importResult = $derived(serverImport === clearedImport ? null : serverImport);
	const reviewToken = $derived(importResult?.phase === 'preview' && importResult.success
		&& !importResult.issues?.length && importResult !== usedReview ? importResult.reviewToken ?? '' : '');
	let classType = $derived<string>(serverImport?.options?.classType ?? '');
	let emailLanguage = $derived<string>(serverImport?.options?.emailLanguage ?? language.current);
	let fileError = $state(false);
	let busy = $state<'preview' | 'import' | 'resend' | null>(null);
	let resendingId = $state<string | null>(null);
	let requestError = $state(false);

	function clearReview() {
		clearedImport = serverImport;
		requestError = false;
	}

	function selectFile(event: Event & { currentTarget: HTMLInputElement }) {
		clearReview();
		const file = event.currentTarget.files?.[0];
		fileError = !!file && (!file.name.toLowerCase().endsWith('.xlsx') || file.size === 0 || file.size > MAX_IMPORT_BYTES);
	}

	const submitImport: SubmitFunction = ({ action, cancel }) => {
		if (busy || fileError) { cancel(); return; }
		const importing = action.searchParams.has('/importStudents');
		if (importing && !reviewToken) { cancel(); return; }
		// enhance has already captured the file, options, and receipt before these mutations.
		busy = importing ? 'import' : 'preview';
		requestError = false;
		if (importing) usedReview = importResult;
		else clearedImport = serverImport;
		return async ({ result, update }) => {
			try {
				if (result.type === 'error') requestError = true;
				else await update({ reset: false });
			} finally { busy = null; }
		};
	};

	const submitResend: SubmitFunction = ({ formData, cancel }) => {
		if (busy) { cancel(); return; }
		busy = 'resend';
		resendingId = String(formData.get('studentId') ?? '');
		requestError = false;
		return async ({ result, update }) => {
			try {
				if (result.type === 'error') requestError = true;
				else await update({ reset: false });
			} finally { busy = null; resendingId = null; }
		};
	};

	function invitationHref(nextPage: number) {
		return resolve('/admin') + '?section=invitations&invitationPage=' + nextPage;
	}

	function formatDate(value: string) {
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? common.notAvailable : dates.format(date);
	}
</script>

{#snippet invitationPagination()}
	<nav class="pagination" aria-label={messages.pagination}>
		<Button variant="outline" size="sm" href={invitationHref(invitationPage - 1)} disabled={invitationPage <= 1 || busy !== null}>{messages.previousPage}</Button>
		<span class="mono" aria-current="page">{formatMessage(messages.pageLabel, { page: numbers.format(invitationPage) })}</span>
		<Button variant="outline" size="sm" href={invitationHref(invitationPage + 1)} disabled={!hasMoreInvitations || busy !== null}>{messages.nextPage}</Button>
	</nav>
{/snippet}

<div class="student-invitations" lang={language.current}>
	<section aria-labelledby={`${id}-upload-title`}>
		<Card.Root class="gap-0 p-0 min-w-0">
			<div class="panel-heading">
				<div><h2 class="panel-title" id={`${id}-upload-title`}>{messages.title}</h2><p class="panel-subtitle">{messages.uploadDescription}</p></div>
				<AdminIcon name="upload" size={24} />
			</div>
			<form method="POST" action="?/previewStudents&section=invitations" enctype="multipart/form-data" use:enhance={submitImport} aria-busy={busy === 'preview' || busy === 'import'}>
				<input type="hidden" name="reviewToken" value={reviewToken} />
				<fieldset class="import-fields" disabled={busy !== null}>
					<legend class="sr-only">{messages.title}</legend>
					<div class="upload-field">
						<Label class="font-bold" for={`${id}-file`}>{messages.file}</Label>
						<Input id={`${id}-file`} name="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required onchange={selectFile}
							aria-invalid={fileError} aria-describedby={`${id}-file-hint ${id}-format-hint${fileError ? ` ${id}-file-error` : ''}`} />
						<p class="hint" id={`${id}-file-hint`}>{messages.fileHint}</p>
						<p class="hint" id={`${id}-format-hint`}>{messages.formatHint}</p>
						<Button href={asset('student-import-template.xlsx')} download variant="outline" size="sm" class="justify-self-start">{messages.template}</Button>
						{#if fileError}<p class="field-error" id={`${id}-file-error`} role="alert">{messages.errors.file}</p>{/if}
					</div>
					<div class="form-grid">
						<ChoiceGroup id={`${id}-class`} name="classType" label={roster.classType} bind:value={classType} onchange={clearReview}
							choices={[{ value: 'basic', label: roster.classes.basic }, { value: 'regular', label: roster.classes.regular }]} />
						<ChoiceGroup id={`${id}-language`} name="emailLanguage" label={messages.emailLanguage} bind:value={emailLanguage} onchange={clearReview}
							choices={[{ value: 'en', label: messages.languages.en }, { value: 'es', label: messages.languages.es }]} />
					</div>
					<Alert.Root role="note" class="bg-muted/30 text-muted-foreground">
						<Alert.Description>{messages.pinHint}<br />{messages.conflictNote}</Alert.Description>
					</Alert.Root>
					<noscript><p class="hint">{messages.noScript}</p></noscript>
					{#if importResult?.phase === 'preview'}
						<div class="review" aria-labelledby={`${id}-review-title`}>
							<div class="review-heading"><h3 id={`${id}-review-title`}>{messages.previewTitle}</h3><Badge variant="outline">{formatMessage(messages.rowsCount, { count: numbers.format(importResult.rows?.length ?? 0) })}</Badge></div>
							<p class="hint">{messages.previewOnly}</p>
							{#if importResult.rows?.length}
								<Table.Root class="min-w-[32rem] text-left" containerProps={{ role: 'region', 'aria-labelledby': `${id}-review-title`, tabindex: 0, class: 'overflow-x-auto focus-visible:outline-2 focus-visible:outline-primary' }}>
									<Table.Caption class="sr-only">{messages.previewTitle}</Table.Caption>
									<Table.Header><Table.Row>
										<Table.Head scope="col">{messages.row}</Table.Head><Table.Head scope="col">{roster.edit.firstName}</Table.Head><Table.Head scope="col">{roster.edit.lastName}</Table.Head><Table.Head scope="col">{roster.edit.email}</Table.Head>
									</Table.Row></Table.Header>
									<Table.Body>{#each importResult.rows as row (row.row)}<Table.Row>
										<Table.Head scope="row" class="font-mono">{numbers.format(row.row)}</Table.Head><Table.Cell>{row.firstName}</Table.Cell><Table.Cell>{row.lastName}</Table.Cell><Table.Cell>{row.email}</Table.Cell>
									</Table.Row>{/each}</Table.Body>
								</Table.Root>
							{/if}
							{#if importResult.issues?.length}
								<Alert.Root variant="destructive">
									<Alert.Title>{messages.issuesTitle}</Alert.Title>
									<Alert.Description><ul class="issue-list">{#each importResult.issues as issue}<li>{formatMessage(messages.issueRow, { row: numbers.format(issue.row) })} — {messages.issues[issue.code]}</li>{/each}</ul></Alert.Description>
								</Alert.Root>
							{/if}
							{#if reviewToken}<p class="review-ready" role="status"><AdminIcon name="check" size={17} />{messages.reviewReady}</p>{/if}
						</div>
					{/if}
					{#if importResult && !importResult.success}
						<Alert.Root variant="destructive"><Alert.Description>{messages.errors[importResult.error ?? 'invalid']}</Alert.Description></Alert.Root>
					{/if}
					{#if importResult?.phase === 'import' && importResult.created !== undefined}
						<Alert.Root role="status" class="border-primary/30 bg-primary/10">
							<Alert.Title>{messages.importTitle}</Alert.Title>
							<Alert.Description>{formatMessage(messages.importSummary, { created: numbers.format(importResult.created), sent: numbers.format(importResult.sent ?? 0), failed: numbers.format(importResult.failed ?? 0) })}</Alert.Description>
						</Alert.Root>
					{/if}
					{#if importResult?.testMode}<Alert.Root role="note"><Alert.Title>{messages.testMode}</Alert.Title><Alert.Description>{messages.testModeNote}</Alert.Description></Alert.Root>{/if}
					<div class="form-footer">
						<p class="hint">{reviewToken ? messages.confirmNote : messages.reviewChanged}</p>
						<div class="form-actions">
							<Button type="submit" variant={reviewToken ? 'outline' : 'default'} disabled={busy !== null || fileError}>{busy === 'preview' ? messages.previewing : messages.preview}<AdminIcon name="arrow" size={16} /></Button>
							<Button type="submit" formaction="?/importStudents&section=invitations" disabled={!reviewToken || busy !== null || fileError}>{busy === 'import' ? messages.importing : messages.confirm}</Button>
						</div>
					</div>
				</fieldset>
			</form>
		</Card.Root>
	</section>

	{#if requestError}<Alert.Root variant="destructive"><Alert.Description>{messages.errors.unavailable}</Alert.Description></Alert.Root>{/if}
	{#if resendResult && busy === null && !requestError}
		{@const resentInvitation = invitations.find((invitation) => invitation.studentId === resendResult.studentId)}
		<Alert.Root role={resendResult.success ? 'status' : 'alert'} variant={resendResult.success ? 'default' : 'destructive'}>
			{#if resentInvitation}<Alert.Title>{resentInvitation.firstName} {resentInvitation.lastName}</Alert.Title>{/if}
			<Alert.Description>{resendResult.success ? messages.resendSuccess : messages.resendErrors[resendResult.error ?? 'storage']}</Alert.Description>
			{#if resendResult.testMode}<Alert.Description>{messages.testModeNote}</Alert.Description>{/if}
		</Alert.Root>
	{/if}

	<section aria-labelledby={`${id}-list-title`}>
		<Card.Root class="gap-0 p-0 min-w-0">
			<div class="panel-heading">
				<div><h2 class="panel-title" id={`${id}-list-title`}>{messages.listTitle}</h2><p class="panel-subtitle">{messages.listDescription}</p></div>
				<Badge variant="outline" class="font-mono">{formatMessage(messages.listCount, { count: numbers.format(invitations.length) })}</Badge>
			</div>
			<div class="list-notes"><p>{messages.deliveryHint}</p><p id={`${id}-resend-note`}>{messages.resendNote}</p><p>{messages.timeZone}</p></div>
			{@render invitationPagination()}
			<Table.Root class="min-w-[56rem] text-left" containerProps={{ role: 'region', 'aria-labelledby': `${id}-list-title`, tabindex: 0, class: 'overflow-x-auto focus-visible:outline-2 focus-visible:outline-primary' }}>
				<Table.Caption class="sr-only">{messages.listTitle}</Table.Caption>
				<Table.Header><Table.Row>
					<Table.Head scope="col">{roster.student}</Table.Head><Table.Head scope="col">{messages.emailLanguage}</Table.Head><Table.Head scope="col">{messages.acceptance}</Table.Head><Table.Head scope="col">{messages.delivery}</Table.Head><Table.Head scope="col">{messages.expiresAt}</Table.Head><Table.Head scope="col">{common.actions}</Table.Head>
				</Table.Row></Table.Header>
				<Table.Body>
					{#each invitations as invitation (invitation.studentId)}
						<Table.Row>
							<Table.Head scope="row" class="whitespace-normal max-w-[16rem]">
								<span class="student-name">{invitation.firstName} {invitation.lastName}</span><span class="secondary">{invitation.email}</span>
								<Badge variant="outline" class="status-badge mt-2">{roster.statuses[invitation.status]}</Badge>
							</Table.Head>
							<Table.Cell>{messages.languages[invitation.language]}</Table.Cell>
							<Table.Cell>
								<Badge variant="outline" class={invitation.acceptedAt ? 'status-badge' : 'status-badge neutral'}>{invitation.acceptedAt ? messages.accepted : messages.awaitingAcceptance}</Badge>
								{#if invitation.acceptedAt}<time class="secondary" datetime={invitation.acceptedAt}>{formatDate(invitation.acceptedAt)}</time>{/if}
							</Table.Cell>
							<Table.Cell>
								<Badge variant="outline" class={`status-badge ${invitation.deliveryState === 'failed' ? 'warning' : invitation.deliveryState === 'sent' ? '' : 'neutral'}`}>{messages.deliveryStates[invitation.deliveryState]}</Badge>
								{#if invitation.sentAt}<time class="secondary" datetime={invitation.sentAt} title={messages.sentAt}>{formatDate(invitation.sentAt)}</time>{/if}
								{#if invitation.testMode}<Badge variant="outline" class="mt-2" title={messages.testModeNote}>{messages.testMode}</Badge>{/if}
							</Table.Cell>
							<Table.Cell><time datetime={invitation.expiresAt}>{formatDate(invitation.expiresAt)}</time></Table.Cell>
							<Table.Cell>
								{#if invitation.status === 'invited' && !invitation.acceptedAt}
									<form method="POST" action={`?/resendInvitation&section=invitations&invitationPage=${invitationPage}`} use:enhance={submitResend} aria-busy={resendingId === invitation.studentId}>
										<input type="hidden" name="studentId" value={invitation.studentId} />
										<Button type="submit" variant="outline" size="sm" disabled={busy !== null} aria-describedby={`${id}-resend-note`} aria-label={formatMessage(messages.resendLabel, { name: `${invitation.firstName} ${invitation.lastName}` })}>{resendingId === invitation.studentId ? messages.resending : messages.resend}</Button>
									</form>
								{:else}<span aria-label={common.notAvailable}>{common.notAvailable}</span>{/if}
							</Table.Cell>
						</Table.Row>
					{:else}<Table.Row><Table.Cell colspan={6} class="py-8 text-center text-muted-foreground">{messages.listEmpty}</Table.Cell></Table.Row>{/each}
				</Table.Body>
			</Table.Root>
			{@render invitationPagination()}
		</Card.Root>
	</section>
</div>

<style>
	.student-invitations { display: grid; gap: 1.4rem; min-width: 0; }
	section { min-width: 0; }
	.panel-heading > :global(svg) { flex-shrink: 0; color: var(--primary); }
	.import-fields { display: grid; gap: 1.25rem; min-width: 0; margin: 0; padding: 1.4rem; border: 0; }
	.upload-field { display: grid; gap: 0.5rem; }
	.hint, .list-notes { margin: 0; color: var(--muted-foreground); font-size: 0.75rem; line-height: 1.7; }
	.field-error { margin: 0; color: var(--destructive); font-size: 0.8rem; }
	.review { display: grid; gap: 1rem; min-width: 0; padding-top: 1.25rem; border-top: 1px solid var(--border); }
	.review-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem; }
	h3 { margin: 0; font-size: 0.95rem; }
	.issue-list { margin: 0; padding-left: 1.25rem; }
	.issue-list li + li { margin-top: 0.35rem; }
	.review-ready { display: flex; align-items: center; gap: 0.5rem; margin: 0; color: var(--primary); font-size: 0.8rem; }
	.form-footer { display: grid; gap: 1rem; padding-top: 1rem; border-top: 1px solid var(--border); }
	.form-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 0.75rem; }
	.list-notes { display: grid; gap: 0.35rem; padding: 1rem 1.4rem; }
	.list-notes p { margin: 0; }
	.pagination { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 1rem 1.4rem; border-top: 1px solid var(--border); font-size: 0.75rem; }
	.student-name, .secondary { display: block; overflow-wrap: anywhere; }
	.secondary { margin-top: 0.35rem; color: var(--muted-foreground); font-size: 0.72rem; font-weight: normal; }
	@media (max-width: 40rem) {
		.import-fields, .list-notes, .pagination { padding: 1rem; }
		.form-actions { flex-direction: column; }
	}
</style>
