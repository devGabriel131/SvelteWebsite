<script lang="ts">
	import { untrack } from 'svelte';
	import AdminIcon from '#lib/admin/AdminIcon.svelte';
	import { filterStudents, type AdminStudent, type StudentStatus } from '#lib/admin/demo.ts';
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

	let dialog = $state<HTMLDialogElement>();
	let editingId = $state<string | null>(null);
	let name = $state('');
	let email = $state('');
	let cohort = $state('');
	let status = $state<StudentStatus>('invited');
	let score = $state<number | undefined>();
	let progress = $state<number | undefined>(0);
	let formError = $state(false);
	let saved = $state(false);

	$effect(() => {
		if (openAdd && dialog) {
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

	function openStudent(student?: AdminStudent): void {
		if (!dialog || dialog.open) return;
		editingId = student?.id ?? null;
		name = student?.name ?? '';
		email = student?.email ?? '';
		cohort = student?.cohort ?? '';
		status = student?.status ?? 'invited';
		score = student?.score ?? undefined;
		progress = student?.progress ?? 0;
		formError = false;
		saved = false;
		dialog.showModal();
	}

	function saveStudent(event: SubmitEvent & { currentTarget: HTMLFormElement }): void {
		event.preventDefault();
		const form = event.currentTarget;
		const trimmedName = name.trim();
		const trimmedEmail = email.trim();
		const trimmedCohort = cohort.trim();
		const validScore = score === undefined || (Number.isFinite(score) && score >= 0 && score <= 100);
		const validProgress = progress !== undefined && Number.isFinite(progress) && progress >= 0 && progress <= 100;

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
		dialog?.close();
	}
</script>

<section class="panel student-panel" class:compact aria-labelledby={`${id}-title`}>
	<div class="panel-heading roster-heading">
		<div>
			<h2 class="panel-title" id={`${id}-title`}>{messages.title}</h2>
			<p class="panel-subtitle">{messages.subtitle}</p>
		</div>
		{#if compact}
			<button class="text-link view-all" type="button" onclick={() => onViewAll?.()}>
				{common.viewAll}<AdminIcon name="arrow" size={16} />
			</button>
		{:else}
			<button class="button-primary" type="button" onclick={() => openStudent()}>
				<AdminIcon name="plus" size={17} />{messages.add}
			</button>
		{/if}
	</div>

	{#if !compact}
		<div class="roster-filters">
			<div class="field search-field">
				<label class="sr-only" for={`${id}-search`}>{messages.searchLabel}</label>
				<div class="search-input">
					<AdminIcon name="search" size={18} />
					<input id={`${id}-search`} type="search" placeholder={messages.search} bind:value={query} />
				</div>
			</div>
			<div class="field status-filter">
				<label class="sr-only" for={`${id}-filter`}>{messages.filterLabel}</label>
				<select id={`${id}-filter`} bind:value={statusFilter}>
					<option value="all">{messages.all}</option>
					{#each statuses as option}
						<option value={option}>{common.statusLabels[option]}</option>
					{/each}
				</select>
			</div>
			<p class="roster-count mono" role="status">{messages.count.replace('{count}', numberFormat.format(visibleStudents.length))}</p>
		</div>
	{/if}

	<div class="roster-notice" role="status" aria-atomic="true">
		{#if saved}<p class="notice"><AdminIcon name="check" size={16} />{messages.saved}</p>{/if}
	</div>

	<!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users need to focus this region to scroll the table.) -->
	<div class="table-wrapper" role="region" aria-labelledby={`${id}-title`} tabindex="0">
		<table>
			<caption class="sr-only">{messages.title} — {common.sampleData}</caption>
			<thead>
				<tr>
					<th scope="col">{common.student}</th>
					<th scope="col" class="cohort-cell">{common.cohort}</th>
					<th scope="col">{common.status}</th>
					<th scope="col" class="score-cell">{messages.score}</th>
					<th scope="col">{messages.progress}</th>
					<th scope="col">{messages.lastActive}</th>
					<th scope="col" class="actions-cell"><span class="sr-only">{common.actions}</span></th>
				</tr>
			</thead>
			<tbody>
				{#each visibleStudents as student (student.id)}
					<tr>
						<th scope="row">
							<div class="student-identity">
								<span class="avatar" aria-hidden="true">{initials(student.name)}</span>
								<div class="student-details">
									<span class="student-name">{student.name}</span>
									<span class="student-email">{student.email}</span>
								</div>
							</div>
						</th>
						<td class="cohort-cell mono">{student.cohort}</td>
						<td><span class={`status-badge ${student.status}`}>{common.statusLabels[student.status]}</span></td>
						<td class="score-cell mono" class:low-score={student.score !== null && student.score < 70}>
							{#if student.score === null}
								<span class="no-score" aria-label={messages.noScore}>{common.notAvailable}</span>
							{:else}
								{numberFormat.format(student.score)}
							{/if}
						</td>
						<td>
							<div class="student-progress">
								<span class="progress-track" aria-hidden="true"><span style:width={`${student.progress}%`}></span></span>
								<span class="progress-value mono">{percentFormat.format(student.progress / 100)}</span>
							</div>
						</td>
						<td class="last-active">{lastActive(student.lastActiveMinutes)}</td>
						<td class="actions-cell">
							<button class="button-ghost edit-button" type="button" aria-label={messages.editLabel.replace('{name}', student.name)} title={messages.edit} onclick={() => openStudent(student)}>
								<AdminIcon name="edit" size={16} />
							</button>
						</td>
					</tr>
				{:else}
					<tr><td class="empty-state" colspan="7">{messages.empty}</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
</section>

<dialog class="modal student-modal" bind:this={dialog} aria-labelledby={`${id}-modal-title`} aria-describedby={`${id}-form-note`} onclose={() => { formError = false; }}>
	<div class="modal-heading student-modal-heading">
		<h2 id={`${id}-modal-title`}>{editingId === null ? messages.addTitle : messages.editTitle}</h2>
		<button class="button-ghost close-button" type="button" aria-label={common.close} onclick={() => dialog?.close()}><AdminIcon name="close" size={20} /></button>
	</div>
	<p class="form-note" id={`${id}-form-note`}>{messages.formNote}</p>
	<form novalidate onsubmit={saveStudent}>
		<div class="form-grid student-form-grid">
			<div class="field full-width">
				<label for={`${id}-name`}>{messages.name}</label>
				<input id={`${id}-name`} name="name" type="text" required autocomplete="off" placeholder={messages.namePlaceholder} bind:value={name} />
			</div>
			<div class="field full-width">
				<label for={`${id}-email`}>{messages.email}</label>
				<input id={`${id}-email`} name="email" type="email" required autocomplete="off" placeholder={messages.emailPlaceholder} bind:value={email} />
			</div>
			<div class="field">
				<label for={`${id}-cohort`}>{messages.cohort}</label>
				<input id={`${id}-cohort`} name="cohort" type="text" required autocomplete="off" placeholder={messages.cohortPlaceholder} bind:value={cohort} />
			</div>
			<div class="field">
				<label for={`${id}-status`}>{messages.status}</label>
				<select id={`${id}-status`} name="status" bind:value={status}>
					{#each statuses as option}<option value={option}>{common.statusLabels[option]}</option>{/each}
				</select>
			</div>
			<div class="field">
				<label for={`${id}-score`}>{messages.scoreLabel}</label>
				<input id={`${id}-score`} name="score" type="number" min="0" max="100" step="any" placeholder={messages.noScore} bind:value={score} />
			</div>
			<div class="field">
				<label for={`${id}-progress`}>{messages.progressLabel}</label>
				<input id={`${id}-progress`} name="progress" type="number" min="0" max="100" step="any" required bind:value={progress} />
			</div>
		</div>
		{#if formError}<p class="notice form-error" role="alert">{messages.validation}</p>{/if}
		<div class="modal-actions student-modal-actions">
			<button class="button-secondary" type="button" onclick={() => dialog?.close()}>{common.cancel}</button>
			<button class="button-primary" type="submit"><AdminIcon name={editingId === null ? 'plus' : 'check'} size={16} />{editingId === null ? common.create : common.save}</button>
		</div>
	</form>
</dialog>

<style>
	.student-panel { min-width: 0; max-width: 100%; }
	.roster-heading { flex-wrap: wrap; gap: 1rem; }
	.view-all { display: inline-flex; align-items: center; gap: 0.5rem; white-space: nowrap; }
	.roster-filters { display: flex; align-items: center; flex-wrap: wrap; gap: 0.75rem; padding: 1.1rem 1.35rem; }
	.search-field { flex: 1 1 16rem; min-width: 0; }
	.search-input { position: relative; }
	.search-input :global(svg) { position: absolute; inset: 50% auto auto 0.85rem; transform: translateY(-50%); color: var(--console-muted); pointer-events: none; }
	.search-input input { padding-left: 2.6rem; }
	.status-filter { flex: 0 1 12rem; min-width: 0; }
	.roster-count { margin: 0; color: var(--console-muted); font-size: 0.72rem; white-space: nowrap; }
	.roster-notice:has(.notice) { padding: 0 1.35rem 1rem; }
	.roster-notice .notice { display: flex; align-items: flex-start; gap: 0.5rem; margin: 0; }
	.roster-notice :global(svg) { flex-shrink: 0; margin-top: 0.15rem; }
	.table-wrapper { position: relative; width: 100%; max-width: 100%; overflow-x: auto; overscroll-behavior-x: contain; border-radius: 0 0 6px 6px; }
	.table-wrapper:focus-visible { outline: 2px solid var(--console-sage); outline-offset: -2px; }
	table { width: 100%; min-width: 880px; border-collapse: collapse; text-align: left; font-size: 0.8rem; }
	thead { background: var(--console-bg); }
	thead th { padding: 0.85rem 1rem; color: var(--console-muted); font-size: 0.64rem; font-weight: 600; letter-spacing: 0.09em; text-transform: uppercase; white-space: nowrap; }
	tbody th, tbody td { padding: 1rem; border-top: 1px solid var(--console-border); }
	tr > :first-child { padding-left: 1.35rem; }
	tr > :last-child { padding-right: 1.35rem; }
	tbody tr:hover { background: color-mix(in srgb, var(--console-sage) 4%, var(--console-panel)); }
	.student-identity { display: flex; align-items: center; gap: 0.75rem; }
	.avatar { display: grid; place-items: center; flex-shrink: 0; width: 2.15rem; height: 2.15rem; border: 1px solid color-mix(in srgb, var(--console-sage) 22%, var(--console-border)); border-radius: 6px; background: color-mix(in srgb, var(--console-sage) 9%, var(--console-panel)); color: var(--console-sage); font-size: 0.67rem; font-weight: 600; letter-spacing: 0.04em; }
	.student-details { display: grid; gap: 0.3rem; }
	.student-name { color: var(--console-text); font-size: 0.8rem; font-weight: 600; white-space: nowrap; }
	.student-email { color: var(--console-muted); font-size: 0.68rem; font-weight: 400; }
	.cohort-cell { color: var(--console-muted); font-size: 0.72rem; white-space: nowrap; }
	.score-cell { text-align: right; }
	td.score-cell { color: var(--console-sage); font-weight: 600; }
	td.low-score { color: var(--console-amber); }
	.no-score { color: var(--console-muted); font-weight: 400; }
	.student-progress { display: flex; align-items: center; gap: 0.65rem; }
	.progress-track { display: block; width: 4.5rem; height: 4px; overflow: hidden; background: var(--console-border); }
	.progress-track > span { display: block; height: 100%; background: var(--console-sage); }
	.progress-value { min-width: 2.75rem; color: var(--console-muted); font-size: 0.7rem; text-align: right; white-space: nowrap; }
	.last-active { color: var(--console-muted); font-size: 0.72rem; white-space: nowrap; }
	.actions-cell { width: 3rem; text-align: right; }
	.edit-button, .close-button { display: inline-flex; align-items: center; justify-content: center; width: 2.25rem; min-height: 2.25rem; padding: 0; color: var(--console-muted); }
	.edit-button:hover, .close-button:hover { color: var(--console-sage); }
	.empty-state { padding: 2.75rem 1.35rem; color: var(--console-muted); text-align: center; }
	.compact table { min-width: 640px; }
		.compact .cohort-cell { display: none; }
		.compact thead th, .compact tbody th, .compact tbody td { padding-inline: 0.75rem; }
		.compact tr > :first-child { padding-left: 1.35rem; }
		.compact tr > :last-child { padding-right: 1rem; }
	.compact tbody th, .compact tbody td { padding-top: 0.85rem; padding-bottom: 0.85rem; }
	.compact .avatar { width: 1.95rem; height: 1.95rem; }
	.compact .progress-track { width: 3.25rem; }
	.student-modal { box-sizing: border-box; width: min(35rem, calc(100% - 2rem)); max-height: calc(100dvh - 2rem); padding: 1.5rem; overflow-y: auto; border: 1px solid var(--console-border); border-radius: 6px; background: var(--console-panel); color: var(--console-text); color-scheme: dark; }
	.student-modal::backdrop { background: color-mix(in srgb, var(--console-bg) 80%, transparent); backdrop-filter: blur(4px); }
	.student-modal-heading { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 0.75rem; }
	.student-modal-heading h2 { margin: 0; font-size: 1.2rem; font-weight: 600; }
	.form-note { margin: 0 0 1.5rem; color: var(--console-muted); font-size: 0.8rem; line-height: 1.6; }
	.student-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
	.full-width { grid-column: 1 / -1; }
	.form-error { margin-top: 1rem; color: var(--console-amber); }
	.student-modal-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 0.65rem; margin-top: 1.5rem; }

	@media (max-width: 600px) {
		.roster-filters { gap: 0.65rem; }
		.search-field { flex-basis: 100%; }
		.status-filter { flex: 1 1 10rem; }
		.student-modal { padding: 1.15rem; }
		.student-form-grid { grid-template-columns: minmax(0, 1fr); }
	}
</style>
