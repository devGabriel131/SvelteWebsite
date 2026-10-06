<script lang="ts">
	import { untrack } from 'svelte';
	import AdminIcon from '#lib/admin/AdminIcon.svelte';
	import { filterStudents, type AdminStudent, type StudentStatus } from '#lib/admin/demo.ts';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Progress } from '#lib/components/ui/progress/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';

	let {
		students = $bindable<AdminStudent[]>(),
		compact = false,
		onViewAll,
		openAdd = $bindable(false)
	}: {
		students: AdminStudent[];
		compact?: boolean;
		onViewAll?: () => void;
		openAdd?: boolean;
	} = $props();

	const language = useLanguage();
	const id = $props.id();
	const statuses: StudentStatus[] = ['active', 'invited', 'paused'];
	const messages = $derived(language.messages.admin.students);
	const common = $derived(language.messages.admin.common);
	const numberFormat = $derived(new Intl.NumberFormat(language.current, { maximumFractionDigits: 2 }));
	const percentFormat = $derived(new Intl.NumberFormat(language.current, { style: 'percent', maximumFractionDigits: 2 }));

	let query = $state('');
	let statusFilter = $state<StudentStatus | 'all'>('all');
	const visibleStudents = $derived(compact ? students.slice(0, 5) : filterStudents(students, query, statusFilter));

	let dialogOpen = $state(false);
	let dialogTrigger: HTMLElement | null = null;
	let editingId = $state<string | null>(null);
	let name = $state('');
	let email = $state('');
	let cohort = $state('');
	let status = $state<StudentStatus>('invited');
	let score = $state<number | null | undefined>();
	let progress = $state<number | null | undefined>(0);
	let formError = $state(false);
	let saved = $state(false);

	$effect(() => {
		if (openAdd) {
			untrack(() => openStudent());
			openAdd = false;
		}
	});

	function initials(studentName: string): string {
		const parts = studentName.trim().split(/\s+/);
		return [parts[0]?.[0], parts.length > 1 ? parts.at(-1)?.[0] : ''].join('').toLocaleUpperCase(language.current);
	}

	function lastActive(minutes: number | null): string {
		if (minutes === null) return common.never;
		if (minutes < 1) return common.justNow;
		const template = minutes < 60 ? common.minutesAgo : minutes < 1440 ? common.hoursAgo : common.daysAgo;
		const count = Math.floor(minutes < 60 ? minutes : minutes < 1440 ? minutes / 60 : minutes / 1440);
		return template.replace('{count}', numberFormat.format(count));
	}

	function openStudent(student?: AdminStudent, trigger?: HTMLElement): void {
		if (dialogOpen) return;
		const initiator = trigger ?? document.activeElement;
		dialogTrigger = initiator instanceof HTMLElement && initiator.isConnected ? initiator : null;
		editingId = student?.id ?? null;
		name = student?.name ?? '';
		email = student?.email ?? '';
		cohort = student?.cohort ?? '';
		status = student?.status ?? 'invited';
		score = student?.score ?? undefined;
		progress = student?.progress ?? 0;
		formError = false;
		saved = false;
		dialogOpen = true;
	}

	function restoreDialogFocus(event: Event): void {
		event.preventDefault();
		if (dialogTrigger?.isConnected && !dialogTrigger.matches(':disabled, [aria-disabled="true"]')) {
			dialogTrigger.focus();
		} else {
			document.getElementById('console-title')?.focus();
		}
		dialogTrigger = null;
	}

	function saveStudent(event: SubmitEvent & { currentTarget: HTMLFormElement }): void {
		event.preventDefault();
		const form = event.currentTarget;
		const trimmedName = name.trim();
		const trimmedEmail = email.trim();
		const trimmedCohort = cohort.trim();
		const validScore = score == null || (Number.isFinite(score) && score >= 0 && score <= 100);
		const validProgress = progress != null && Number.isFinite(progress) && progress >= 0 && progress <= 100;

		if (!trimmedName || !trimmedEmail || !trimmedCohort || !validScore || !validProgress || !statuses.includes(status) || !form.checkValidity()) {
			formError = true;
			form.querySelector<HTMLInputElement>(':invalid')?.focus();
			return;
		}

		const values = {
			name: trimmedName,
			email: trimmedEmail,
			cohort: trimmedCohort,
			status,
			score: score ?? null,
			progress: progress!
		};

		if (editingId !== null) {
			students = students.map((student) => student.id === editingId ? { ...student, ...values } : student);
		} else {
			students = [{ id: crypto.randomUUID(), ...values, lastActiveMinutes: null }, ...students];
		}

		formError = false;
		saved = true;
		dialogOpen = false;
	}
</script>

<section class="student-panel" class:compact aria-labelledby={`${id}-title`}>
	<Card.Root class="gap-0 p-0">
		<div class="panel-heading roster-heading">
			<div>
				<h2 class="panel-title" id={`${id}-title`}>{messages.title}</h2>
				<p class="panel-subtitle">{messages.subtitle}</p>
			</div>
			{#if compact}
				<Button variant="link" class="gap-2 text-[0.76rem]" type="button" onclick={() => onViewAll?.()}>
					{common.viewAll}<AdminIcon name="arrow" size={16} />
				</Button>
			{:else}
				<Button class="text-[0.76rem]" type="button" onclick={(event) => openStudent(undefined, event.currentTarget)}>
					<AdminIcon name="plus" size={17} />{messages.add}
				</Button>
			{/if}
		</div>

		{#if !compact}
			<div class="roster-filters">
				<div class="field search-field">
					<Label class="sr-only" for={`${id}-search`}>{messages.searchLabel}</Label>
					<div class="search-input">
						<AdminIcon name="search" size={18} />
						<Input class="pl-[2.6rem] text-[0.8rem] md:text-[0.8rem]" id={`${id}-search`} type="search" placeholder={messages.search} bind:value={query} />
					</div>
				</div>
				<div class="field status-filter">
					<span class="sr-only" id={`${id}-filter-label`}>{messages.filterLabel}</span>
					<div class="fixed-choices" role="group" aria-labelledby={`${id}-filter-label`}>
						<Button variant="outline" size="sm" class="min-w-0 flex-1 aria-pressed:border-primary aria-pressed:bg-accent aria-pressed:text-primary" type="button" aria-pressed={statusFilter === 'all'} onclick={() => { statusFilter = 'all'; }}>
							{messages.all}
						</Button>
						{#each statuses as option}
							<Button variant="outline" size="sm" class="min-w-0 flex-1 aria-pressed:border-primary aria-pressed:bg-accent aria-pressed:text-primary" type="button" aria-pressed={statusFilter === option} onclick={() => { statusFilter = option; }}>
								{common.statusLabels[option]}
							</Button>
						{/each}
					</div>
				</div>
				<p class="roster-count mono" role="status">{messages.count.replace('{count}', numberFormat.format(visibleStudents.length))}</p>
			</div>
		{/if}

		<div class="roster-notice" role="status" aria-atomic="true">
			{#if saved}
				<div class="saved-notice">
					<Alert.Root role="presentation" class="border-primary/30 bg-accent text-primary [&>svg]:text-primary">
						<AdminIcon name="check" size={16} />
						<Alert.Description class="text-primary text-[0.77rem] leading-[1.6]">{messages.saved}</Alert.Description>
					</Alert.Root>
				</div>
			{/if}
		</div>

		<Table.Root
			class={`w-full border-collapse text-left text-[0.8rem] ${compact ? 'min-w-[640px]' : 'min-w-[880px]'}`}
			containerProps={{
				class: 'table-wrapper max-w-full overflow-x-auto overscroll-x-contain focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-[-2px]',
				role: 'region',
				'aria-labelledby': `${id}-title`,
				tabindex: 0
			}}
		>
			<Table.Caption class="sr-only">{messages.title} — {common.sampleData}</Table.Caption>
			<Table.Header class="bg-background">
				<Table.Row>
					<Table.Head scope="col">{common.student}</Table.Head>
					<Table.Head scope="col" class={compact ? 'hidden' : ''}>{common.cohort}</Table.Head>
					<Table.Head scope="col">{common.status}</Table.Head>
					<Table.Head scope="col" class="text-right">{messages.score}</Table.Head>
					<Table.Head scope="col">{messages.progress}</Table.Head>
					<Table.Head scope="col">{messages.lastActive}</Table.Head>
					<Table.Head scope="col" class="w-12 text-right"><span class="sr-only">{common.actions}</span></Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each visibleStudents as student (student.id)}
					<Table.Row>
						<Table.Head scope="row" class="h-auto">
							<div class="student-identity">
								<span class="avatar" aria-hidden="true">{initials(student.name)}</span>
								<div class="student-details">
									<span class="student-name">{student.name}</span>
									<span class="student-email">{student.email}</span>
								</div>
							</div>
						</Table.Head>
						<Table.Cell class={`mono text-muted-foreground text-[0.72rem] ${compact ? 'hidden' : ''}`}>{student.cohort}</Table.Cell>
						<Table.Cell><Badge variant="outline" class={`status-badge ${student.status}`}>{common.statusLabels[student.status]}</Badge></Table.Cell>
						<Table.Cell class={`mono text-right font-semibold ${student.score !== null && student.score < 70 ? 'text-warning' : 'text-primary'}`}>
							{#if student.score === null}
								<span class="no-score" aria-label={messages.noScore}>{common.notAvailable}</span>
							{:else}
								{numberFormat.format(student.score)}
							{/if}
						</Table.Cell>
						<Table.Cell>
							<div class="student-progress">
								<Progress class={`h-1 shrink-0 rounded-none ${compact ? 'w-[3.25rem]' : 'w-[4.5rem]'}`} max={100} value={student.progress} aria-hidden="true" />
								<span class="progress-value mono">{percentFormat.format(student.progress / 100)}</span>
							</div>
						</Table.Cell>
						<Table.Cell class="text-muted-foreground text-[0.72rem]">{lastActive(student.lastActiveMinutes)}</Table.Cell>
						<Table.Cell class="w-12 text-right">
							<Button variant="ghost" size="icon" type="button" aria-label={messages.editLabel.replace('{name}', student.name)} title={messages.edit} onclick={(event) => openStudent(student, event.currentTarget)}>
								<AdminIcon name="edit" size={16} />
							</Button>
						</Table.Cell>
					</Table.Row>
				{:else}
					<Table.Row><Table.Cell class="empty-state" colspan={7}>{messages.empty}</Table.Cell></Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</Card.Root>
</section>

<Dialog.Root bind:open={dialogOpen} onOpenChange={(open) => { if (!open) formError = false; }}>
	<Dialog.Content
		closeLabel={common.close}
		class="admin-console-dialog bg-card"
		lang={language.current}
		interactOutsideBehavior="ignore"
		onCloseAutoFocus={restoreDialogFocus}
	>
		<div class="modal-heading student-modal-heading">
			<Dialog.Title id={`${id}-modal-title`} class="text-[1.2rem] leading-normal font-semibold">
				{#snippet child({ props })}
					<h2 {...props}>{editingId === null ? messages.addTitle : messages.editTitle}</h2>
				{/snippet}
			</Dialog.Title>
		</div>
		<Dialog.Description id={`${id}-form-note`} class="mb-6 text-[0.8rem] leading-[1.6]">
			{#snippet child({ props })}
				<p {...props}>{messages.formNote}</p>
			{/snippet}
		</Dialog.Description>
		<form novalidate onsubmit={saveStudent}>
			<div class="form-grid student-form-grid">
				<div class="field full-width">
					<Label class="text-[0.74rem] text-muted-foreground" for={`${id}-name`}>{messages.name}</Label>
					<Input class="text-[0.8rem] md:text-[0.8rem]" id={`${id}-name`} name="name" type="text" required autocomplete="off" placeholder={messages.namePlaceholder} bind:value={name} />
				</div>
				<div class="field full-width">
					<Label class="text-[0.74rem] text-muted-foreground" for={`${id}-email`}>{messages.email}</Label>
					<Input class="text-[0.8rem] md:text-[0.8rem]" id={`${id}-email`} name="email" type="email" required autocomplete="off" placeholder={messages.emailPlaceholder} bind:value={email} />
				</div>
				<div class="field">
					<Label class="text-[0.74rem] text-muted-foreground" for={`${id}-cohort`}>{messages.cohort}</Label>
					<Input class="text-[0.8rem] md:text-[0.8rem]" id={`${id}-cohort`} name="cohort" type="text" required autocomplete="off" placeholder={messages.cohortPlaceholder} bind:value={cohort} />
				</div>
				<div class="field">
					<span id={`${id}-status-label`}>{messages.status}</span>
					<div class="fixed-choices" role="group" aria-labelledby={`${id}-status-label`}>
						{#each statuses as option}
							<Button variant="outline" size="sm" class="min-w-0 flex-1 aria-pressed:border-primary aria-pressed:bg-accent aria-pressed:text-primary" type="button" aria-pressed={status === option} onclick={() => { status = option; }}>
								{common.statusLabels[option]}
							</Button>
						{/each}
					</div>
					<input type="hidden" name="status" value={status} />
				</div>
				<div class="field">
					<Label class="text-[0.74rem] text-muted-foreground" for={`${id}-score`}>{messages.scoreLabel}</Label>
					<Input class="text-[0.8rem] md:text-[0.8rem]" id={`${id}-score`} name="score" type="number" min="0" max="100" step="any" placeholder={messages.noScore} bind:value={score} />
				</div>
				<div class="field">
					<Label class="text-[0.74rem] text-muted-foreground" for={`${id}-progress`}>{messages.progressLabel}</Label>
					<Input class="text-[0.8rem] md:text-[0.8rem]" id={`${id}-progress`} name="progress" type="number" min="0" max="100" step="any" required bind:value={progress} />
				</div>
			</div>
			{#if formError}
				<Alert.Root class="mt-4 border-warning/40 bg-warning/10 text-warning">
					<Alert.Description class="text-warning text-[0.77rem] leading-[1.6]">{messages.validation}</Alert.Description>
				</Alert.Root>
			{/if}
			<div class="modal-actions student-modal-actions">
				<Button variant="outline" class="text-[0.76rem]" type="button" onclick={() => { dialogOpen = false; formError = false; }}>{common.cancel}</Button>
				<Button class="text-[0.76rem]" type="submit"><AdminIcon name={editingId === null ? 'plus' : 'check'} size={16} />{editingId === null ? common.create : common.save}</Button>
			</div>
		</form>
	</Dialog.Content>
</Dialog.Root>

<style>
	.student-panel { min-width: 0; max-width: 100%; }
	.roster-heading { flex-wrap: wrap; gap: 1rem; }
	.roster-filters { display: flex; align-items: center; flex-wrap: wrap; gap: 0.75rem; padding: 1.1rem 1.35rem; }
	.search-field { flex: 1 1 16rem; min-width: 0; }
	.search-input { position: relative; }
	.search-input :global(svg) { position: absolute; inset: 50% auto auto 0.85rem; transform: translateY(-50%); color: var(--brand-slate); pointer-events: none; }
	.status-filter { flex: 0 1 12rem; min-width: 0; }
	.fixed-choices { display: flex; flex-wrap: wrap; gap: 0.4rem; min-width: 0; }
	.roster-count { margin: 0; color: var(--muted-foreground); font-size: 0.72rem; white-space: nowrap; }
	.saved-notice { padding: 0 1.35rem 1rem; }
	.student-panel :global([data-slot='table-header'] [data-slot='table-head']) { padding: 0.85rem 1rem; color: var(--muted-foreground); font-size: 0.64rem; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase; }
	.student-panel :global([data-slot='table-body'] [data-slot='table-head']),
	.student-panel :global([data-slot='table-body'] [data-slot='table-cell']) { padding: 1rem; }
	.student-panel :global([data-slot='table-row'] > :first-child) { padding-left: 1.35rem; }
	.student-panel :global([data-slot='table-row'] > :last-child) { padding-right: 1.35rem; }
	.student-panel :global([data-slot='table-cell'].empty-state) { padding: 2.75rem 1.35rem; color: var(--muted-foreground); text-align: center; }
	.student-identity { display: flex; align-items: center; gap: 0.75rem; }
	.avatar { display: grid; place-items: center; flex-shrink: 0; width: 2.15rem; height: 2.15rem; border: 1px solid color-mix(in srgb, var(--primary) 22%, var(--border)); border-radius: 6px; background: color-mix(in srgb, var(--primary) 9%, var(--card)); color: var(--primary); font-size: 0.67rem; font-weight: 600; letter-spacing: 0.04em; }
	.student-details { display: grid; gap: 0.3rem; }
	.student-name { color: var(--foreground); font-size: 0.8rem; font-weight: 600; white-space: nowrap; }
	.student-email { color: var(--muted-foreground); font-size: 0.68rem; font-weight: 400; }
	.no-score { color: var(--muted-foreground); font-weight: 400; }
	.student-progress { display: flex; align-items: center; gap: 0.65rem; }
	.progress-value { min-width: 2.75rem; color: var(--muted-foreground); font-size: 0.7rem; text-align: right; white-space: nowrap; }
	.compact :global([data-slot='table-header'] [data-slot='table-head']),
	.compact :global([data-slot='table-body'] [data-slot='table-head']),
	.compact :global([data-slot='table-body'] [data-slot='table-cell']) { padding-inline: 0.75rem; }
	.compact :global([data-slot='table-row'] > :first-child) { padding-left: 1.35rem; }
	.compact :global([data-slot='table-row'] > :last-child) { padding-right: 1rem; }
	.compact :global([data-slot='table-body'] [data-slot='table-head']),
	.compact :global([data-slot='table-body'] [data-slot='table-cell']) { padding-top: 0.85rem; padding-bottom: 0.85rem; }
	.compact .avatar { width: 1.95rem; height: 1.95rem; }
	.student-modal-heading { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 0.75rem; padding-right: 2rem; }
	.student-modal-heading h2 { margin: 0; font-size: 1.2rem; font-weight: 600; }
	.student-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
	.full-width { grid-column: 1 / -1; }
	.student-modal-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 0.65rem; margin-top: 1.5rem; }

	@media (max-width: 600px) {
		.roster-filters { gap: 0.65rem; }
		.search-field { flex-basis: 100%; }
		.status-filter { flex: 1 1 10rem; }
		.student-form-grid { grid-template-columns: minmax(0, 1fr); }
	}
</style>
