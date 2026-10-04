<script lang="ts">
	import AdminIcon from '#lib/admin/AdminIcon.svelte';
	import { previewLink, type AdminSection, type AdminStudent } from '#lib/admin/demo.ts';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';

	let { section, students }: { section: AdminSection; students: AdminStudent[] } = $props();
	const language = useLanguage();
	const id = $props.id();
	const messages = $derived(language.messages.admin);
	const common = $derived(messages.common);
	const currency = $derived(new Intl.NumberFormat(language.current, { style: 'currency', currency: 'USD' }));
	const numbers = $derived(new Intl.NumberFormat(language.current, { maximumFractionDigits: 1 }));
	const isOperation = $derived(section !== 'overview' && section !== 'students');

	type Feedback = 'created' | 'copied' | 'copyFailed' | 'refundSuccess' | 'assigned' | 'invalidAmount' | 'invalidFile' | 'required';
	let feedback = $state<{ section: AdminSection; key: Feedback } | null>(null);
	const feedbackText = $derived(feedback ? (
		feedback.key === 'refundSuccess' ? messages.payments.refundSuccess :
		feedback.key === 'assigned' ? messages.events.assigned :
		feedback.key === 'invalidAmount' ? messages.payments.invalidAmount :
		feedback.key === 'invalidFile' ? messages.reports.invalidFile : common[feedback.key]
	) : '');
	const isError = $derived(feedback && ['invalidAmount', 'invalidFile', 'required', 'copyFailed'].includes(feedback.key));

	interface PaymentPreview { id: number; name: string; amount: number; recipient: string; url: string }
	let paymentName = $state('');
	let paymentAmount = $state<number | undefined>(250);
	let paymentStudent = $state('MM-001');
	let paymentLinks = $state<PaymentPreview[]>([{ id: 1, name: '', amount: 250, recipient: 'Alex Rivera', url: previewLink('payment', 1) }]);
	let refundReviewed = $state(false);
	let refundDialog = $state<HTMLDialogElement>();

	interface InvitationPreview { id: number; name: string; email: string; cohort: string; expires: number; url: string }
	let inviteName = $state('');
	let inviteEmail = $state('');
	let inviteCohort = $state('Alpha 01');
	let inviteExpiry = $state(7);
	let invitationLinks = $state<InvitationPreview[]>([{ id: 1, name: 'Emma Wilson', email: 'emma.wilson@example.com', cohort: 'Bravo 02', expires: 7, url: previewLink('invitation', 1) }]);

	let stagedFile = $state<{ name: string; size: number } | null>(null);
	let fileInput = $state<HTMLInputElement>();
	const reportRows = [
		{ name: 'alpha-01-practice.csv', rows: 4, state: 'reviewed' as const },
		{ name: 'bravo-02-baseline.csv', rows: 4, state: 'pending' as const }
	];

	const sampleEvents = [
		{ key: 'session' as const, type: 'briefing' as const, time: '18:00', cohort: 'Alpha 01 + Bravo 02' },
		{ key: 'practice' as const, type: 'assessment' as const, time: '10:00', cohort: 'Alpha 01' },
		{ key: 'checkIn' as const, type: 'coaching' as const, time: '16:30', cohort: 'Bravo 02' }
	];
	let assignmentEvent = $state<'session' | 'practice' | 'checkIn'>('session');
	let assignmentStudent = $state('MM-001');
	let assignment = $state<{ event: 'session' | 'practice' | 'checkIn'; name: string } | null>(null);

	function notify(key: Feedback) { feedback = { section, key }; }

	function createPayment(event: SubmitEvent) {
		event.preventDefault();
		const student = students.find((student) => student.id === paymentStudent);
		if (!paymentName.trim() || paymentAmount === undefined || !Number.isFinite(paymentAmount) || paymentAmount < 1 || paymentAmount > 10000) {
			notify('invalidAmount');
			return;
		}
		if (!student) { notify('required'); return; }
		const nextId = paymentLinks.length + 1;
		paymentLinks = [{ id: nextId, name: paymentName.trim(), amount: paymentAmount, recipient: student.name, url: previewLink('payment', nextId) }, ...paymentLinks];
		notify('created');
	}

	function createInvitation(event: SubmitEvent) {
		event.preventDefault();
		if (!inviteName.trim() || !inviteEmail.trim() || !inviteCohort.trim()) { notify('required'); return; }
		const nextId = invitationLinks.length + 1;
		invitationLinks = [{ id: nextId, name: inviteName.trim(), email: inviteEmail.trim(), cohort: inviteCohort.trim(), expires: inviteExpiry, url: previewLink('invitation', nextId) }, ...invitationLinks];
		notify('created');
	}

	async function copyLink(url: string) {
		const source = section;
		try {
			await navigator.clipboard.writeText(url);
			feedback = { section: source, key: 'copied' };
		} catch {
			feedback = { section: source, key: 'copyFailed' };
		}
	}

	function stageCSV(event: Event & { currentTarget: HTMLInputElement }) {
		const file = event.currentTarget.files?.[0];
		if (!file) return;
		if (!file.name.toLowerCase().endsWith('.csv') || file.size > 5 * 1024 * 1024) {
			stagedFile = null;
			event.currentTarget.value = '';
			notify('invalidFile');
			return;
		}
		// Only file metadata is used; grade contents never leave the browser or get parsed.
		stagedFile = { name: file.name, size: file.size };
		feedback = null;
	}

	function removeFile() {
		stagedFile = null;
		if (fileInput) fileInput.value = '';
		feedback = null;
	}

	function downloadTemplate() {
		const csv = 'student_id,practice_score,assessment_date\nMM-001,86,2026-10-01\nMM-002,92,2026-10-01\n';
		const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
		const link = document.createElement('a');
		link.href = url;
		link.download = messages.reports.fileName;
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	function previewAssignment(event: SubmitEvent) {
		event.preventDefault();
		const student = students.find((student) => student.id === assignmentStudent);
		if (!student) { notify('required'); return; }
		assignment = { event: assignmentEvent, name: student.name };
		notify('assigned');
	}
</script>

{#if isOperation}
	<div class="operations-content">
		{#if section === 'payments'}
			<div class="operations-grid">
				<section class="panel form-panel" aria-labelledby={`${id}-payment-title`}>
					<div class="panel-heading"><div><p class="eyebrow module-code" aria-hidden="true">FIN / 02</p><h2 class="panel-title" id={`${id}-payment-title`}>{messages.payments.createTitle}</h2><p class="panel-subtitle">{messages.payments.createDescription}</p></div><AdminIcon name="payments" size={24} /></div>
					<form class="operation-form" onsubmit={createPayment}>
						<div class="field"><label for={`${id}-payment-name`}>{messages.payments.label}</label><input id={`${id}-payment-name`} bind:value={paymentName} placeholder={messages.payments.labelPlaceholder} maxlength="100" required /></div>
						<div class="field"><label for={`${id}-payment-student`}>{messages.payments.recipient}</label><select id={`${id}-payment-student`} bind:value={paymentStudent} required><option value="">{common.selectStudent}</option>{#each students as student (student.id)}<option value={student.id}>{student.name}</option>{/each}</select></div>
						<div class="field"><label for={`${id}-payment-amount`}>{messages.payments.amount}</label><div class="amount-field"><span class="mono" aria-hidden="true">$</span><input id={`${id}-payment-amount`} type="number" min="1" max="10000" step="0.01" bind:value={paymentAmount} placeholder={messages.payments.amountPlaceholder} required /><span class="currency-label mono" aria-hidden="true">{common.usd}</span></div></div>
						<div class="form-footer"><span class="local-label"><AdminIcon name="shield" size={14} />{common.localOnly}</span><button class="button-primary" type="submit">{messages.payments.generate}<AdminIcon name="arrow" size={16} /></button></div>
					</form>
				</section>
				<section class="panel refund-panel" aria-labelledby={`${id}-refunds-title`}>
					<div class="panel-heading"><div><h2 class="panel-title" id={`${id}-refunds-title`}>{messages.payments.refundsTitle}</h2><p class="panel-subtitle">{messages.payments.refundsDescription}</p></div><span class="status-badge warning">{common.sampleData}</span></div>
					<div class="refund-body"><div class="refund-top"><span class="refund-avatar mono" aria-hidden="true">DT</span><div><h3>Daniel Torres</h3><p>daniel.torres@example.com</p></div><strong class="refund-amount mono">{currency.format(250)}</strong></div><p class="refund-reason">{messages.payments.refundReason}</p><div class="refund-bottom"><span class="status-badge" class:warning={!refundReviewed}>{refundReviewed ? messages.payments.refundReviewed : messages.payments.refundRequested}</span><button type="button" class="button-secondary" disabled={refundReviewed} onclick={() => refundDialog?.showModal()}>{messages.payments.reviewRefund}<AdminIcon name="arrow" size={15} /></button></div></div>
					<div class="integration-note"><AdminIcon name="shield" size={18} /><span>{messages.payments.refundNote}</span></div>
				</section>
			</div>
			<section class="panel" aria-labelledby={`${id}-payment-links`}>
				<div class="panel-heading"><div><h2 class="panel-title" id={`${id}-payment-links`}>{messages.payments.linksTitle}</h2><p class="panel-subtitle">{messages.payments.linksDescription}</p></div><span class="list-count mono">{paymentLinks.length.toString().padStart(2, '0')}</span></div>
				<ul class="preview-list">{#each paymentLinks as link (link.id)}<li><span class="list-icon"><AdminIcon name="payments" size={20} /></span><div class="link-info"><h3>{link.name || messages.payments.sampleName}</h3><p>{link.recipient}<span aria-hidden="true"> · </span><span class="mono">{currency.format(link.amount)}</span></p><label class="sr-only" for={`${id}-pay-link-${link.id}`}>{common.demoLink}</label><input id={`${id}-pay-link-${link.id}`} class="preview-url mono" readonly value={link.url} onclick={(event) => event.currentTarget.select()} /></div><div class="link-actions"><span class="status-badge neutral">{messages.payments.draft}</span><button class="button-secondary" type="button" onclick={() => copyLink(link.url)}><AdminIcon name="copy" size={15} />{common.copy}</button></div></li>{/each}</ul>
			</section>
			<dialog class="modal" bind:this={refundDialog} aria-labelledby={`${id}-refund-title`} aria-describedby={`${id}-refund-note`}>
				<div class="modal-heading"><h2 id={`${id}-refund-title`}>{messages.payments.refundTitle}</h2><button class="button-ghost" type="button" aria-label={common.close} onclick={() => refundDialog?.close()}><AdminIcon name="close" /></button></div>
				<div class="refund-modal-summary"><strong>Daniel Torres</strong><span class="mono">{currency.format(250)}</span></div><p id={`${id}-refund-note`} class="modal-note">{messages.payments.refundNote}</p>
				<div class="modal-actions"><button class="button-secondary" type="button" onclick={() => refundDialog?.close()}>{common.cancel}</button><button class="button-primary" type="button" onclick={() => { refundReviewed = true; refundDialog?.close(); notify('refundSuccess'); }}><AdminIcon name="check" size={16} />{messages.payments.confirmRefund}</button></div>
			</dialog>
		{:else if section === 'invitations'}
			<div class="operations-grid invitations-grid">
				<section class="panel" aria-labelledby={`${id}-invite-title`}>
					<div class="panel-heading"><div><p class="eyebrow module-code" aria-hidden="true">REC / 03</p><h2 class="panel-title" id={`${id}-invite-title`}>{messages.invitations.createTitle}</h2><p class="panel-subtitle">{messages.invitations.createDescription}</p></div><AdminIcon name="invitations" size={24} /></div>
					<form class="operation-form" onsubmit={createInvitation}>
						<div class="form-grid"><div class="field"><label for={`${id}-invite-name`}>{messages.invitations.name}</label><input id={`${id}-invite-name`} bind:value={inviteName} maxlength="100" placeholder={messages.students.namePlaceholder} required /></div><div class="field"><label for={`${id}-invite-email`}>{messages.invitations.email}</label><input id={`${id}-invite-email`} type="email" bind:value={inviteEmail} maxlength="200" placeholder={messages.students.emailPlaceholder} required /></div><div class="field"><label for={`${id}-invite-cohort`}>{messages.invitations.cohort}</label><input id={`${id}-invite-cohort`} bind:value={inviteCohort} maxlength="100" placeholder={messages.students.cohortPlaceholder} required /></div><div class="field"><label for={`${id}-invite-expiry`}>{messages.invitations.expires}</label><select id={`${id}-invite-expiry`} bind:value={inviteExpiry}><option value={7}>{messages.invitations.sevenDays}</option><option value={30}>{messages.invitations.thirtyDays}</option></select></div></div>
						<div class="form-footer"><span class="local-label"><AdminIcon name="shield" size={14} />{common.localOnly}</span><button class="button-primary" type="submit">{messages.invitations.generate}<AdminIcon name="arrow" size={16} /></button></div>
					</form>
				</section>
				<div class="invitation-instrument panel"><div class="invitation-radar" aria-hidden="true"><span class="orbit orbit-one"></span><span class="orbit orbit-two"></span><span class="orbit orbit-three"></span><span class="radar-axis"></span><div class="radar-center"><AdminIcon name="invitations" size={38} /></div><span class="radar-point point-one"></span><span class="radar-point point-two"></span><span class="radar-point point-three"></span></div><p class="eyebrow">{messages.sections.invitations}</p><h2>{messages.invitations.linksDescription}</h2><p>{messages.invitations.createDescription}</p><span class="status-badge neutral">{common.notConnected}</span></div>
			</div>
			<section class="panel" aria-labelledby={`${id}-invite-links`}><div class="panel-heading"><div><h2 class="panel-title" id={`${id}-invite-links`}>{messages.invitations.linksTitle}</h2><p class="panel-subtitle">{messages.invitations.linksDescription}</p></div><span class="list-count mono">{invitationLinks.length.toString().padStart(2, '0')}</span></div><ul class="preview-list">{#each invitationLinks as link (link.id)}<li><span class="list-icon"><AdminIcon name="invitations" size={20} /></span><div class="link-info"><h3>{link.name}</h3><p>{link.email}<span aria-hidden="true"> · </span>{link.cohort}<span aria-hidden="true"> · </span>{messages.invitations.expiresIn.replace('{count}', String(link.expires))}</p><label class="sr-only" for={`${id}-invite-link-${link.id}`}>{common.demoLink}</label><input id={`${id}-invite-link-${link.id}`} class="preview-url mono" readonly value={link.url} onclick={(event) => event.currentTarget.select()} /></div><div class="link-actions"><span class="status-badge neutral">{messages.invitations.queued}</span><button class="button-secondary" type="button" onclick={() => copyLink(link.url)}><AdminIcon name="copy" size={15} />{common.copy}</button></div></li>{/each}</ul></section>
		{:else if section === 'reports'}
			<div class="import-steps">{#each ['one', 'two', 'three'] as step, index}<div class:current={index === 0}><span class="step-number mono">0{index + 1}</span><div><strong>{messages.reports.steps[step as 'one' | 'two' | 'three']}</strong>{#if index > 0}<small>{messages.reports.future}</small>{/if}</div>{#if index < 2}<span class="step-arrow" aria-hidden="true"><AdminIcon name="arrow" size={18} /></span>{/if}</div>{/each}</div>
			<div class="operations-grid">
				<section class="panel" aria-labelledby={`${id}-upload-title`}><div class="panel-heading"><div><h2 class="panel-title" id={`${id}-upload-title`}>{messages.reports.uploadTitle}</h2><p class="panel-subtitle">{messages.reports.uploadDescription}</p></div><AdminIcon name="reports" size={24} /></div><div class="upload-body"><div class="upload-zone"><span class="upload-symbol"><AdminIcon name="upload" size={30} /></span><h3>{messages.reports.dropTitle}</h3><p>{messages.reports.dropDescription}</p><label class="button-primary file-label" for={`${id}-csv`}><AdminIcon name="plus" size={16} />{messages.reports.choose}<input id={`${id}-csv`} type="file" accept=".csv,text/csv" aria-label={messages.reports.inputLabel} bind:this={fileInput} onchange={stageCSV} /></label></div>{#if stagedFile}<div class="staged-file"><span class="list-icon"><AdminIcon name="reports" size={20} /></span><div><strong>{stagedFile.name}</strong><span class="file-size mono">{messages.reports.size}: {numbers.format(stagedFile.size / 1024)} KiB</span><span class="status-badge">{messages.reports.selected}</span></div><button type="button" class="button-ghost" aria-label={messages.reports.remove} onclick={removeFile}><AdminIcon name="close" size={18} /></button></div>{/if}<p class="staging-note"><AdminIcon name="shield" size={17} />{messages.reports.notImported}</p></div></section>
				<section class="panel format-panel" aria-labelledby={`${id}-format-title`}><div class="panel-heading"><div><p class="eyebrow module-code" aria-hidden="true">CSV / 04</p><h2 class="panel-title" id={`${id}-format-title`}>{messages.reports.formatTitle}</h2><p class="panel-subtitle">{messages.reports.formatDescription}</p></div></div><div class="format-body"><div class="schema-row"><span class="column-number mono">01</span><div><strong class="mono">student_id</strong><small>{messages.reports.columns.student}</small></div><span class="schema-type mono" aria-hidden="true">ID</span></div><div class="schema-row"><span class="column-number mono">02</span><div><strong class="mono">practice_score</strong><small>{messages.reports.columns.score}</small></div><span class="schema-type mono" aria-hidden="true">0–100</span></div><div class="schema-row"><span class="column-number mono">03</span><div><strong class="mono">assessment_date</strong><small>{messages.reports.columns.date}</small></div><span class="schema-type mono" aria-hidden="true">ISO</span></div><button class="button-secondary template-button" type="button" onclick={downloadTemplate}><AdminIcon name="reports" size={16} />{messages.reports.template}<AdminIcon name="arrow" size={15} /></button></div></section>
			</div>
			<section class="panel" aria-labelledby={`${id}-report-history`}><div class="panel-heading"><div><h2 class="panel-title" id={`${id}-report-history`}>{messages.reports.historyTitle}</h2><p class="panel-subtitle">{messages.reports.historyDescription}</p></div><span class="status-badge neutral">{common.sampleData}</span></div><ul class="report-history">{#each reportRows as report}<li><span class="list-icon"><AdminIcon name="reports" size={20} /></span><div><h3 class="mono">{report.name}</h3><p>{messages.reports.rows}: {report.rows}</p></div><span class="status-badge" class:neutral={report.state === 'pending'}>{messages.reports[report.state]}</span></li>{/each}</ul></section>
		{:else if section === 'events'}
			<div class="placeholder-banner"><span class="placeholder-icon"><AdminIcon name="events" size={25} /></span><div><h2>{messages.events.placeholder}</h2><p>{messages.events.placeholderDescription}</p></div><span class="status-badge warning">{common.notConnected}</span></div>
			<div class="operations-grid">
				<section class="panel" aria-labelledby={`${id}-schedule-title`}><div class="panel-heading"><h2 class="panel-title" id={`${id}-schedule-title`}>{messages.events.scheduleTitle}</h2><span class="status-badge neutral">{common.sampleData}</span></div><ol class="schedule-list">{#each sampleEvents as event}<li><div class="schedule-date mono"><strong>{messages.events.dates[event.key]}</strong><span>{event.time}</span></div><div class="schedule-details"><p class="eyebrow">{messages.events[event.type]}</p><h3>{messages.events[event.key]}</h3><p><AdminIcon name="students" size={14} />{event.cohort}</p></div><span class="schedule-mark" aria-hidden="true">+</span></li>{/each}</ol></section>
				<section class="panel" aria-labelledby={`${id}-assignment-title`}><div class="panel-heading"><div><h2 class="panel-title" id={`${id}-assignment-title`}>{messages.events.assignmentTitle}</h2><p class="panel-subtitle">{messages.events.assignmentDescription}</p></div></div><form class="operation-form" onsubmit={previewAssignment}><div class="field"><label for={`${id}-assign-event`}>{messages.events.event}</label><select id={`${id}-assign-event`} bind:value={assignmentEvent}>{#each sampleEvents as event}<option value={event.key}>{messages.events[event.key]}</option>{/each}</select></div><div class="field"><label for={`${id}-assign-student`}>{messages.events.student}</label><select id={`${id}-assign-student`} bind:value={assignmentStudent} required><option value="">{common.selectStudent}</option>{#each students as student (student.id)}<option value={student.id}>{student.name}</option>{/each}</select></div><button class="button-primary assignment-button" type="submit">{messages.events.assign}<AdminIcon name="arrow" size={16} /></button>{#if assignment}<div class="assignment-preview"><AdminIcon name="check" size={17} /><span><strong>{assignment.name}</strong><small>{messages.events[assignment.event]}</small></span><span class="status-badge neutral">{common.preview}</span></div>{/if}</form></section>
			</div>
			<div class="panel attendance-panel"><div class="attendance-grid" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span></div><AdminIcon name="target" size={30} /><h2>{messages.events.attendance}</h2><p>{messages.events.attendanceNote}</p><span class="status-badge neutral">{messages.reports.future}</span></div>
		{/if}
		<div class="operation-feedback" role="status" aria-live="polite" aria-atomic="true">{#if feedback?.section === section}<div class="notice feedback-message" class:error={isError}><span>{feedbackText}</span><button class="button-ghost" type="button" aria-label={common.close} onclick={() => feedback = null}><AdminIcon name="close" size={17} /></button></div>{/if}</div>
	</div>
{/if}

<style>
	.operations-content { display: grid; gap: 1.4rem; }
	.operations-grid { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 1.3rem; align-items: start; }
	.module-code { margin-bottom: 0.45rem !important; font-size: 0.55rem !important; }
	.panel-heading > :global(svg) { flex-shrink: 0; color: var(--console-sage); }
	.operation-form { display: grid; gap: 1.2rem; padding: 1.5rem; }
	.amount-field { position: relative; display: flex; align-items: center; }
	.amount-field > span:first-child { position: absolute; left: 0.85rem; color: var(--console-sage); }
	.amount-field input { padding-left: 2rem; padding-right: 4rem; }
	.currency-label { position: absolute; right: 1rem; color: var(--console-muted); font-size: 0.65rem; }
	.form-footer { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem; margin-top: 0.5rem; padding-top: 1rem; border-top: 1px solid var(--console-border); }
	.local-label { display: flex; align-items: center; gap: 0.4rem; color: var(--console-muted); font-size: 0.61rem; }
	.refund-body { padding: 1.5rem; }
	.refund-top { display: flex; align-items: center; gap: 0.7rem; }
	.refund-avatar { display: grid; flex-shrink: 0; place-items: center; width: 2.5rem; height: 2.5rem; border: 1px solid #5f5140; border-radius: 4px; background: #322c23; color: var(--console-amber); font-size: 0.76rem; }
	.refund-top h3 { margin: 0; font-size: 0.86rem; }
	.refund-top p { margin: 0.2rem 0 0; color: var(--console-muted); font-size: 0.67rem; overflow-wrap: anywhere; }
	.refund-amount { margin-left: auto; font-size: 1.2rem; font-weight: 500; }
	.refund-reason { margin: 1.5rem 0; padding: 0.8rem 0.9rem; border-left: 2px solid #8f7751; background: #242722; color: var(--console-muted); font-size: 0.76rem; }
	.refund-bottom { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem; }
	.integration-note { display: flex; align-items: start; gap: 0.8rem; padding: 1rem 1.5rem; border-top: 1px solid var(--console-border); color: var(--console-muted); font-size: 0.68rem; line-height: 1.8; }
	.integration-note :global(svg) { flex-shrink: 0; margin-top: 0.2rem; color: var(--console-amber); }
	.refund-modal-summary { display: flex; justify-content: space-between; gap: 1rem; padding: 1rem; border: 1px solid var(--console-border); border-radius: 4px; }
	.refund-modal-summary span { color: var(--console-amber); }
	.modal-note { color: var(--console-muted); line-height: 1.8; font-size: 0.85rem; }
	.list-count { display: grid; place-items: center; width: 1.8rem; height: 1.6rem; border: 1px solid var(--console-border); border-radius: 3px; color: var(--console-sage); font-size: 0.7rem; }
	.preview-list, .report-history, .schedule-list { list-style: none; margin: 0; padding: 0; }
	.preview-list li { display: flex; align-items: center; gap: 1rem; padding: 1.4rem 1.5rem; border-bottom: 1px solid var(--console-border); }
	.preview-list li:last-child, .report-history li:last-child { border-bottom: 0; }
	.list-icon { display: grid; flex-shrink: 0; place-items: center; width: 2.7rem; height: 2.7rem; border: 1px solid #3f4e42; border-radius: 4px; background: #222d25; color: var(--console-sage); }
	.link-info { flex: 1; min-width: 0; }
	.link-info h3 { margin: 0; font-size: 0.84rem; }
	.link-info p { margin: 0.3rem 0 0.5rem; color: var(--console-muted); font-size: 0.68rem; overflow-wrap: anywhere; }
	.preview-url { width: 100%; min-width: 0; padding: 0.35rem 0.5rem; border: 1px solid #33443b; border-radius: 3px; color: var(--console-sage); background: #101a16; font-size: 0.62rem; text-overflow: ellipsis; }
	.link-actions { display: flex; align-items: flex-end; flex-direction: column; gap: 0.7rem; }
	.link-actions .button-secondary { min-height: 2.2rem; padding: 0.4rem 0.7rem; font-size: 0.68rem; }
	.invitations-grid { grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); align-items: stretch; }
	.invitation-instrument { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1.5rem 2rem; overflow: hidden; text-align: center; background: radial-gradient(ellipse at 50% 28%, #2b382a80, transparent 65%), var(--console-panel); }
	.invitation-instrument h2 { margin: 0.65rem 0 0; font-size: 1.2rem; letter-spacing: -0.03em; }
	.invitation-instrument > p:not(.eyebrow) { margin: 0.7rem 0 1rem; color: var(--console-muted); font-size: 0.72rem; line-height: 1.8; }
	.invitation-radar { position: relative; width: 11rem; height: 11rem; margin-bottom: 0.5rem; }
	.orbit { position: absolute; top: 50%; left: 50%; border: 1px solid #526448; border-radius: 50%; transform: translate(-50%, -50%); }
	.orbit-one { width: 100%; height: 100%; opacity: 0.4; } .orbit-two { width: 73%; height: 73%; opacity: 0.6; } .orbit-three { width: 40%; height: 40%; background: #2b382b; }
	.radar-axis { position: absolute; inset: 50% 0 auto; border-top: 1px dashed #637357; opacity: 0.5; }
	.radar-axis::after { position: absolute; left: 50%; top: -5.5rem; height: 11rem; content: ''; border-left: 1px dashed #637357; }
	.radar-center { position: absolute; inset: 0; display: grid; place-items: center; color: var(--console-sage); }
	.radar-point { position: absolute; width: 6px; height: 6px; border: 1px solid var(--console-sage); border-radius: 50%; background: #657f49; box-shadow: 0 0 8px #bed29c50; }
	.point-one { top: 16%; left: 37%; } .point-two { top: 52%; right: 10%; } .point-three { bottom: 19%; left: 24%; }
	.import-steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); padding: 1rem 1.3rem; border: 1px solid var(--console-border); border-radius: 4px; background: #141d20; }
	.import-steps > div { display: flex; align-items: center; gap: 0.7rem; color: var(--console-muted); }
	.step-number { display: grid; flex-shrink: 0; place-items: center; width: 2rem; height: 2rem; border: 1px solid var(--console-border); border-radius: 4px; font-size: 0.65rem; }
	.current .step-number { color: var(--console-sage); border-color: #526347; background: #283528; }
	.import-steps strong { display: block; font-weight: 500; font-size: 0.76rem; } .import-steps .current strong { color: var(--console-sage); }
	.import-steps small { display: block; margin-top: 0.2rem; color: var(--console-muted); font-size: 0.57rem; }
	.step-arrow { margin: 0 auto; padding: 0 0.7rem; color: #6d7d70; }
	.upload-body { padding: 1.5rem; }
	.upload-zone { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 17rem; padding: 2rem 1rem; border: 1px dashed #546646; border-radius: 4px; background: linear-gradient(#19231d90, #10191b80); text-align: center; }
	.upload-symbol { display: grid; place-items: center; width: 4rem; height: 4rem; margin-bottom: 1.4rem; border: 1px solid #4b5b40; border-radius: 6px; background: #253225; color: var(--console-sage); }
	.upload-zone h3 { margin: 0; font-size: 1.1rem; } .upload-zone p { margin: 0.6rem 0 1.5rem; color: var(--console-muted); font-size: 0.69rem; }
	.file-label { position: relative; cursor: pointer; }
	.file-label input { position: absolute; inset: 0; width: 100%; opacity: 0; cursor: pointer; }
	.file-label:has(input:focus-visible) { outline: 2px solid var(--console-sage); outline-offset: 4px; }
	.staged-file { display: flex; align-items: center; gap: 0.75rem; margin-top: 1.2rem; padding: 1rem; border: 1px solid #4b5b40; border-radius: 4px; background: #202b24; }
	.staged-file > div { flex: 1; min-width: 0; } .staged-file strong { display: block; font-size: 0.77rem; overflow-wrap: anywhere; }
	.file-size { display: block; margin: 0.25rem 0 0.4rem; color: var(--console-muted); font-size: 0.62rem; }
	.staging-note { display: flex; align-items: start; gap: 0.65rem; margin: 1.2rem 0 0; color: var(--console-muted); font-size: 0.7rem; line-height: 1.8; }
	.staging-note :global(svg) { flex-shrink: 0; margin-top: 0.15rem; color: var(--console-amber); }
	.format-body { padding: 0.7rem 1.4rem 1.4rem; }
	.schema-row { display: flex; align-items: center; gap: 0.8rem; padding: 1.2rem 0; border-bottom: 1px solid var(--console-border); }
	.column-number { color: #99ad88; font-size: 0.63rem; }
	.schema-row strong { font-weight: 500; font-size: 0.75rem; } .schema-row small { display: block; margin-top: 0.3rem; color: var(--console-muted); font-size: 0.68rem; }
	.schema-type { margin-left: auto; padding: 0.18rem 0.4rem; border: 1px solid var(--console-border); border-radius: 3px; color: var(--console-muted); font-size: 0.54rem; }
	.template-button { width: 100%; margin-top: 1.6rem; }
	.report-history li { display: flex; align-items: center; gap: 1rem; padding: 1.3rem 1.5rem; border-bottom: 1px solid var(--console-border); }
	.report-history h3 { margin: 0; font-size: 0.78rem; font-weight: 500; overflow-wrap: anywhere; } .report-history p { margin: 0.3rem 0 0; color: var(--console-muted); font-size: 0.69rem; }
	.report-history li > .status-badge { margin-left: auto; }
	.placeholder-banner { display: flex; align-items: center; gap: 1rem; padding: 1.3rem 1.5rem; border: 1px solid #5f543b; border-radius: 5px; background: #25281f; }
	.placeholder-icon { color: var(--console-amber); } .placeholder-banner h2 { margin: 0; font-size: 0.9rem; }
	.placeholder-banner p { margin: 0.4rem 0 0; color: var(--console-muted); font-size: 0.74rem; line-height: 1.8; }
	.placeholder-banner > .status-badge { flex-shrink: 0; margin-left: auto; }
	.schedule-list { padding: 0 1.4rem; }
	.schedule-list li { position: relative; display: flex; gap: 1.2rem; padding: 1.6rem 0; border-bottom: 1px solid var(--console-border); }
	.schedule-list li:last-child { border-bottom: 0; }
	.schedule-date { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.4rem; min-width: 4rem; height: 4rem; border: 1px solid #45513f; border-radius: 4px; color: var(--console-sage); background: #253025; }
	.schedule-date strong { font-weight: 500; font-size: 0.73rem; } .schedule-date span { color: var(--console-muted); font-size: 0.62rem; }
	.schedule-details .eyebrow { font-size: 0.52rem; } .schedule-details h3 { margin: 0.4rem 0; font-size: 0.85rem; }
	.schedule-details > p:last-child { display: flex; align-items: center; gap: 0.4rem; margin: 0; color: var(--console-muted); font-size: 0.65rem; }
	.schedule-mark { margin-left: auto; color: #7e9670; }
	.assignment-button { justify-self: end; margin-top: 0.5rem; }
	.assignment-preview { display: flex; align-items: center; gap: 0.6rem; padding-top: 1rem; border-top: 1px solid var(--console-border); color: var(--console-sage); }
	.assignment-preview > span:first-of-type { flex: 1; } .assignment-preview strong { font-size: 0.73rem; } .assignment-preview small { display: block; margin-top: 0.2rem; color: var(--console-muted); font-size: 0.62rem; }
	.attendance-panel { position: relative; display: flex; flex-direction: column; align-items: center; min-height: 15rem; padding: 2.5rem 1rem; overflow: hidden; text-align: center; }
	.attendance-panel > :global(svg) { color: var(--console-sage); } .attendance-panel h2 { margin: 1rem 0 0; font-size: 1.1rem; }
	.attendance-panel p { margin: 0.5rem 0 1rem; color: var(--console-muted); font-size: 0.76rem; }
	.attendance-grid { position: absolute; inset: 1.2rem; display: grid; grid-template-columns: repeat(6, 1fr); pointer-events: none; opacity: 0.12; }
	.attendance-grid span { border: 1px solid var(--console-sage); border-right: 0; } .attendance-grid span:last-child { border-right: 1px solid var(--console-sage); }
	.operation-feedback { position: fixed; right: 1.5rem; bottom: 1.5rem; z-index: 20; width: min(30rem, calc(100vw - 2rem)); }
	.operation-feedback .notice { margin-top: 0; box-shadow: 0 8px 32px #0007; }
	.feedback-message { display: flex; align-items: center; gap: 0.7rem; }
	.feedback-message .button-ghost { flex-shrink: 0; min-height: 2rem; padding: 0.4rem; }
	@media (max-width: 70rem) { .operations-grid, .invitations-grid { grid-template-columns: minmax(0, 1fr); } .invitation-instrument { display: none; } }
	@media (max-width: 40rem) {
		.operation-form, .refund-body, .upload-body { padding: 1.1rem; }
		.preview-list li { flex-wrap: wrap; gap: 0.8rem; padding: 1.1rem; } .link-info { flex-basis: calc(100% - 3.5rem); }
		.link-actions { width: 100%; flex-direction: row; justify-content: space-between; align-items: center; }
		.import-steps { grid-template-columns: minmax(0, 1fr); gap: 1rem; } .step-arrow { display: none; }
		.report-history li { flex-wrap: wrap; gap: 0.7rem; padding: 1rem; } .report-history li > div { flex: 1; min-width: 0; } .report-history li > .status-badge { margin-left: 3.4rem; }
		.placeholder-banner { flex-wrap: wrap; padding: 1.1rem; } .placeholder-banner > div { flex: 1; } .placeholder-banner > .status-badge { margin-left: 2.5rem; }
		.schedule-list { padding: 0 1rem; } .schedule-list li { gap: 0.8rem; } .schedule-mark { display: none; }
		.refund-top { flex-wrap: wrap; } .refund-amount { width: 100%; margin-top: 0.4rem; }
		.form-footer .button-primary { width: 100%; }
	}
</style>
