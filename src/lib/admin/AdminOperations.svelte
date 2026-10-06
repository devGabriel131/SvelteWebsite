<script lang="ts">
	import AdminIcon from '#lib/admin/AdminIcon.svelte';
	import { previewLink, type AdminSection, type AdminStudent } from '#lib/admin/demo.ts';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button, buttonVariants } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as NativeSelect from '#lib/components/ui/native-select/index.js';

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
	let refundOpen = $state(false);
	let refundTrigger: HTMLElement | null = null;

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

	function openRefund(event: MouseEvent & { currentTarget: HTMLElement }) {
		refundTrigger = event.currentTarget;
		refundOpen = true;
	}

	function restoreRefundFocus(event: Event) {
		event.preventDefault();
		if (!refundReviewed && refundTrigger?.isConnected && !refundTrigger.matches(':disabled, [aria-disabled="true"]')) {
			refundTrigger.focus();
		} else {
			document.getElementById('console-title')?.focus();
		}
	}

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
				<section aria-labelledby={`${id}-payment-title`}>
					<Card.Root class="gap-0 p-0 min-w-0">
						<div class="panel-heading">
							<div><p class="eyebrow module-code" aria-hidden="true">FIN / 02</p><h2 class="panel-title" id={`${id}-payment-title`}>{messages.payments.createTitle}</h2><p class="panel-subtitle">{messages.payments.createDescription}</p></div>
							<AdminIcon name="payments" size={24} />
						</div>
						<form class="operation-form" onsubmit={createPayment}>
							<div class="operation-field">
								<Label class="text-muted-foreground text-[0.74rem]" for={`${id}-payment-name`}>{messages.payments.label}</Label>
								<Input id={`${id}-payment-name`} bind:value={paymentName} placeholder={messages.payments.labelPlaceholder} maxlength={100} required />
							</div>
							<div class="operation-field">
								<Label class="text-muted-foreground text-[0.74rem]" for={`${id}-payment-student`}>{messages.payments.recipient}</Label>
								<NativeSelect.Root id={`${id}-payment-student`} bind:value={paymentStudent} required>
									<NativeSelect.Option value="">{common.selectStudent}</NativeSelect.Option>
									{#each students as student (student.id)}<NativeSelect.Option value={student.id}>{student.name}</NativeSelect.Option>{/each}
								</NativeSelect.Root>
							</div>
							<div class="operation-field">
								<Label class="text-muted-foreground text-[0.74rem]" for={`${id}-payment-amount`}>{messages.payments.amount}</Label>
								<div class="amount-field">
									<span class="mono" aria-hidden="true">$</span>
									<Input class="pl-8 pr-16" id={`${id}-payment-amount`} type="number" min="1" max="10000" step="0.01" bind:value={paymentAmount} placeholder={messages.payments.amountPlaceholder} required />
									<span class="currency-label mono" aria-hidden="true">{common.usd}</span>
								</div>
							</div>
							<div class="form-footer">
								<span class="local-label"><AdminIcon name="shield" size={14} />{common.localOnly}</span>
								<Button size="sm" class="max-[40rem]:w-full" type="submit">{messages.payments.generate}<AdminIcon name="arrow" size={16} /></Button>
							</div>
						</form>
					</Card.Root>
				</section>
				<section aria-labelledby={`${id}-refunds-title`}>
					<Card.Root class="gap-0 p-0 min-w-0">
						<div class="panel-heading">
							<div><h2 class="panel-title" id={`${id}-refunds-title`}>{messages.payments.refundsTitle}</h2><p class="panel-subtitle">{messages.payments.refundsDescription}</p></div>
							<Badge variant="outline" class="h-auto whitespace-normal font-mono text-[0.59rem] text-warning bg-warning/10 border-warning/40">{common.sampleData}</Badge>
						</div>
						<div class="refund-body">
							<div class="refund-top"><span class="refund-avatar mono" aria-hidden="true">DT</span><div><h3>Daniel Torres</h3><p>daniel.torres@example.com</p></div><strong class="refund-amount mono">{currency.format(250)}</strong></div>
							<p class="refund-reason">{messages.payments.refundReason}</p>
							<div class="refund-bottom">
								<Badge variant="outline" class={refundReviewed ? 'h-auto whitespace-normal font-mono text-[0.59rem] text-primary bg-primary/10 border-primary/30' : 'h-auto whitespace-normal font-mono text-[0.59rem] text-warning bg-warning/10 border-warning/40'}>{refundReviewed ? messages.payments.refundReviewed : messages.payments.refundRequested}</Badge>
								<Button type="button" variant="outline" size="sm" disabled={refundReviewed} onclick={openRefund}>{messages.payments.reviewRefund}<AdminIcon name="arrow" size={15} /></Button>
							</div>
						</div>
						<div class="integration-note">
							<Alert.Root role="note" class="flex items-start gap-3 rounded-none border-0 bg-transparent p-0 text-muted-foreground text-[0.68rem] leading-[1.8]"><AdminIcon name="shield" size={18} /><span>{messages.payments.refundNote}</span></Alert.Root>
						</div>
					</Card.Root>
				</section>
			</div>
			<section aria-labelledby={`${id}-payment-links`}>
				<Card.Root class="gap-0 p-0 min-w-0">
					<div class="panel-heading">
						<div><h2 class="panel-title" id={`${id}-payment-links`}>{messages.payments.linksTitle}</h2><p class="panel-subtitle">{messages.payments.linksDescription}</p></div>
						<Badge variant="outline" class="font-mono text-primary text-[0.7rem]">{paymentLinks.length.toString().padStart(2, '0')}</Badge>
					</div>
					<ul class="preview-list">
						{#each paymentLinks as link (link.id)}
							<li>
								<span class="list-icon"><AdminIcon name="payments" size={20} /></span>
								<div class="link-info">
									<h3>{link.name || messages.payments.sampleName}</h3>
									<p>{link.recipient}<span aria-hidden="true"> · </span><span class="mono">{currency.format(link.amount)}</span></p>
									<Label class="sr-only" for={`${id}-pay-link-${link.id}`}>{common.demoLink}</Label>
									<Input id={`${id}-pay-link-${link.id}`} class="font-mono text-[0.62rem] text-primary text-ellipsis" readonly value={link.url} onclick={(event) => event.currentTarget.select()} />
								</div>
								<div class="link-actions">
									<Badge variant="outline" class="h-auto whitespace-normal font-mono text-[0.59rem] text-secondary bg-secondary/10 border-secondary/30">{messages.payments.draft}</Badge>
									<Button variant="outline" size="sm" type="button" onclick={() => copyLink(link.url)}><AdminIcon name="copy" size={15} />{common.copy}</Button>
								</div>
							</li>
						{/each}
					</ul>
				</Card.Root>
			</section>
			<Dialog.Root bind:open={refundOpen}>
				<Dialog.Content closeLabel={common.close} class="admin-console-dialog bg-card" lang={language.current} interactOutsideBehavior="ignore" onCloseAutoFocus={restoreRefundFocus}>
					<Dialog.Title class="pr-12 text-[1.3rem] leading-normal font-bold">{messages.payments.refundTitle}</Dialog.Title>
					<div class="refund-modal-summary">
						<Card.Root class="gap-0 flex-row justify-between p-4"><strong>Daniel Torres</strong><span class="mono">{currency.format(250)}</span></Card.Root>
					</div>
					<Dialog.Description class="text-[0.85rem] leading-[1.8]">{messages.payments.refundNote}</Dialog.Description>
					<div class="modal-actions">
						<Button variant="outline" size="sm" type="button" onclick={() => refundOpen = false}>{common.cancel}</Button>
						<Button size="sm" type="button" onclick={() => { refundReviewed = true; refundOpen = false; notify('refundSuccess'); }}><AdminIcon name="check" size={16} />{messages.payments.confirmRefund}</Button>
					</div>
				</Dialog.Content>
			</Dialog.Root>
		{:else if section === 'invitations'}
			<div class="operations-grid invitations-grid">
				<section aria-labelledby={`${id}-invite-title`}>
					<Card.Root class="gap-0 p-0 min-w-0">
						<div class="panel-heading">
							<div><p class="eyebrow module-code" aria-hidden="true">REC / 03</p><h2 class="panel-title" id={`${id}-invite-title`}>{messages.invitations.createTitle}</h2><p class="panel-subtitle">{messages.invitations.createDescription}</p></div>
							<AdminIcon name="invitations" size={24} />
						</div>
						<form class="operation-form" onsubmit={createInvitation}>
							<div class="form-grid">
								<div class="operation-field">
									<Label class="text-muted-foreground text-[0.74rem]" for={`${id}-invite-name`}>{messages.invitations.name}</Label>
									<Input id={`${id}-invite-name`} bind:value={inviteName} maxlength={100} placeholder={messages.students.namePlaceholder} required />
								</div>
								<div class="operation-field">
									<Label class="text-muted-foreground text-[0.74rem]" for={`${id}-invite-email`}>{messages.invitations.email}</Label>
									<Input id={`${id}-invite-email`} type="email" bind:value={inviteEmail} maxlength={200} placeholder={messages.students.emailPlaceholder} required />
								</div>
								<div class="operation-field">
									<Label class="text-muted-foreground text-[0.74rem]" for={`${id}-invite-cohort`}>{messages.invitations.cohort}</Label>
									<Input id={`${id}-invite-cohort`} bind:value={inviteCohort} maxlength={100} placeholder={messages.students.cohortPlaceholder} required />
								</div>
								<div class="operation-field">
									<Label class="text-muted-foreground text-[0.74rem]" id={`${id}-invite-expiry`}>{messages.invitations.expires}</Label>
									<div class="operation-choices" role="group" aria-labelledby={`${id}-invite-expiry`}>
										<Button type="button" size="sm" variant={inviteExpiry === 7 ? 'default' : 'outline'} aria-pressed={inviteExpiry === 7} onclick={() => inviteExpiry = 7}>{messages.invitations.sevenDays}</Button>
										<Button type="button" size="sm" variant={inviteExpiry === 30 ? 'default' : 'outline'} aria-pressed={inviteExpiry === 30} onclick={() => inviteExpiry = 30}>{messages.invitations.thirtyDays}</Button>
									</div>
								</div>
							</div>
							<div class="form-footer">
								<span class="local-label"><AdminIcon name="shield" size={14} />{common.localOnly}</span>
								<Button size="sm" class="max-[40rem]:w-full" type="submit">{messages.invitations.generate}<AdminIcon name="arrow" size={16} /></Button>
							</div>
						</form>
					</Card.Root>
				</section>
				<div class="invitation-instrument">
					<Card.Root class="gap-0 h-full w-full items-center justify-center px-8 py-6">
						<div class="invitation-radar" aria-hidden="true"><span class="orbit orbit-one"></span><span class="orbit orbit-two"></span><span class="orbit orbit-three"></span><span class="radar-axis"></span><div class="radar-center"><AdminIcon name="invitations" size={38} /></div><span class="radar-point point-one"></span><span class="radar-point point-two"></span><span class="radar-point point-three"></span></div>
						<p class="eyebrow">{messages.sections.invitations}</p><h2>{messages.invitations.linksDescription}</h2><p>{messages.invitations.createDescription}</p>
						<Badge variant="outline" class="h-auto whitespace-normal font-mono text-[0.59rem] text-secondary bg-secondary/10 border-secondary/30">{common.notConnected}</Badge>
					</Card.Root>
				</div>
			</div>
			<section aria-labelledby={`${id}-invite-links`}>
				<Card.Root class="gap-0 p-0 min-w-0">
					<div class="panel-heading">
						<div><h2 class="panel-title" id={`${id}-invite-links`}>{messages.invitations.linksTitle}</h2><p class="panel-subtitle">{messages.invitations.linksDescription}</p></div>
						<Badge variant="outline" class="font-mono text-primary text-[0.7rem]">{invitationLinks.length.toString().padStart(2, '0')}</Badge>
					</div>
					<ul class="preview-list">
						{#each invitationLinks as link (link.id)}
							<li>
								<span class="list-icon"><AdminIcon name="invitations" size={20} /></span>
								<div class="link-info">
									<h3>{link.name}</h3><p>{link.email}<span aria-hidden="true"> · </span>{link.cohort}<span aria-hidden="true"> · </span>{messages.invitations.expiresIn.replace('{count}', String(link.expires))}</p>
									<Label class="sr-only" for={`${id}-invite-link-${link.id}`}>{common.demoLink}</Label>
									<Input id={`${id}-invite-link-${link.id}`} class="font-mono text-[0.62rem] text-primary text-ellipsis" readonly value={link.url} onclick={(event) => event.currentTarget.select()} />
								</div>
								<div class="link-actions">
									<Badge variant="outline" class="h-auto whitespace-normal font-mono text-[0.59rem] text-secondary bg-secondary/10 border-secondary/30">{messages.invitations.queued}</Badge>
									<Button variant="outline" size="sm" type="button" onclick={() => copyLink(link.url)}><AdminIcon name="copy" size={15} />{common.copy}</Button>
								</div>
							</li>
						{/each}
					</ul>
				</Card.Root>
			</section>
		{:else if section === 'reports'}
			<div class="import-steps">
				<Card.Root class="gap-0 p-0">
					<div class="import-step-grid">
						{#each ['one', 'two', 'three'] as step, index}
							<div class:current={index === 0}><span class="step-number mono">0{index + 1}</span><div><strong>{messages.reports.steps[step as 'one' | 'two' | 'three']}</strong>{#if index > 0}<small>{messages.reports.future}</small>{/if}</div>{#if index < 2}<span class="step-arrow" aria-hidden="true"><AdminIcon name="arrow" size={18} /></span>{/if}</div>
						{/each}
					</div>
				</Card.Root>
			</div>
			<div class="operations-grid">
				<section aria-labelledby={`${id}-upload-title`}>
					<Card.Root class="gap-0 p-0 min-w-0">
						<div class="panel-heading"><div><h2 class="panel-title" id={`${id}-upload-title`}>{messages.reports.uploadTitle}</h2><p class="panel-subtitle">{messages.reports.uploadDescription}</p></div><AdminIcon name="reports" size={24} /></div>
						<div class="upload-body">
							<div class="upload-zone">
								<span class="upload-symbol"><AdminIcon name="upload" size={30} /></span><h3>{messages.reports.dropTitle}</h3><p>{messages.reports.dropDescription}</p>
								<Label class={buttonVariants({ class: 'file-label [&_svg]:text-primary-foreground' })} for={`${id}-csv`}>
									<AdminIcon name="plus" size={16} />{messages.reports.choose}
									<input id={`${id}-csv`} type="file" accept=".csv,text/csv" aria-label={messages.reports.inputLabel} bind:this={fileInput} onchange={stageCSV} />
								</Label>
							</div>
							{#if stagedFile}
								<div class="staged-file">
									<Card.Root class="gap-3 flex-row items-center p-4 bg-primary/10 ring-primary/30">
										<span class="list-icon"><AdminIcon name="reports" size={20} /></span>
										<div class="staged-details"><strong>{stagedFile.name}</strong><span class="file-size mono">{messages.reports.size}: {numbers.format(stagedFile.size / 1024)} KiB</span><Badge variant="outline" class="h-auto whitespace-normal font-mono text-[0.59rem] text-primary bg-primary/10 border-primary/30">{messages.reports.selected}</Badge></div>
										<Button type="button" variant="ghost" size="icon-sm" aria-label={messages.reports.remove} onclick={removeFile}><AdminIcon name="close" size={18} /></Button>
									</Card.Root>
								</div>
							{/if}
							<div class="staging-note"><Alert.Root role="note" class="flex items-start gap-2.5 border-0 bg-transparent p-0 text-muted-foreground text-[0.7rem] leading-[1.8]"><AdminIcon name="shield" size={17} /><span>{messages.reports.notImported}</span></Alert.Root></div>
						</div>
					</Card.Root>
				</section>
				<section class="format-panel" aria-labelledby={`${id}-format-title`}>
					<Card.Root class="gap-0 p-0 min-w-0">
						<div class="panel-heading"><div><p class="eyebrow module-code" aria-hidden="true">CSV / 04</p><h2 class="panel-title" id={`${id}-format-title`}>{messages.reports.formatTitle}</h2><p class="panel-subtitle">{messages.reports.formatDescription}</p></div></div>
						<div class="format-body">
							<div class="schema-row"><span class="column-number mono">01</span><div><strong class="mono">student_id</strong><small>{messages.reports.columns.student}</small></div><Badge variant="outline" class="ml-auto font-mono text-[0.54rem] text-muted-foreground" aria-hidden="true">ID</Badge></div>
							<div class="schema-row"><span class="column-number mono">02</span><div><strong class="mono">practice_score</strong><small>{messages.reports.columns.score}</small></div><Badge variant="outline" class="ml-auto font-mono text-[0.54rem] text-muted-foreground" aria-hidden="true">0–100</Badge></div>
							<div class="schema-row"><span class="column-number mono">03</span><div><strong class="mono">assessment_date</strong><small>{messages.reports.columns.date}</small></div><Badge variant="outline" class="ml-auto font-mono text-[0.54rem] text-muted-foreground" aria-hidden="true">ISO</Badge></div>
							<Button variant="outline" size="sm" class="w-full mt-[1.6rem]" type="button" onclick={downloadTemplate}><AdminIcon name="reports" size={16} />{messages.reports.template}<AdminIcon name="arrow" size={15} /></Button>
						</div>
					</Card.Root>
				</section>
			</div>
			<section aria-labelledby={`${id}-report-history`}>
				<Card.Root class="gap-0 p-0 min-w-0">
					<div class="panel-heading"><div><h2 class="panel-title" id={`${id}-report-history`}>{messages.reports.historyTitle}</h2><p class="panel-subtitle">{messages.reports.historyDescription}</p></div><Badge variant="outline" class="h-auto whitespace-normal font-mono text-[0.59rem] text-secondary bg-secondary/10 border-secondary/30">{common.sampleData}</Badge></div>
					<ul class="report-history">
						{#each reportRows as report}
							<li>
								<span class="list-icon"><AdminIcon name="reports" size={20} /></span><div><h3 class="mono">{report.name}</h3><p>{messages.reports.rows}: {report.rows}</p></div>
								<Badge variant="outline" class={report.state === 'pending' ? 'ml-auto max-[40rem]:ml-[3.4rem] h-auto whitespace-normal font-mono text-[0.59rem] text-secondary bg-secondary/10 border-secondary/30' : 'ml-auto max-[40rem]:ml-[3.4rem] h-auto whitespace-normal font-mono text-[0.59rem] text-primary bg-primary/10 border-primary/30'}>{messages.reports[report.state]}</Badge>
							</li>
						{/each}
					</ul>
				</Card.Root>
			</section>
		{:else if section === 'events'}
			<div class="placeholder-banner">
				<Alert.Root role="note" class="flex items-center gap-4 px-6 py-[1.3rem] max-[40rem]:flex-wrap max-[40rem]:p-[1.1rem] text-warning bg-warning/10 border-warning/40">
					<span class="placeholder-icon"><AdminIcon name="events" size={25} /></span>
					<div class="placeholder-copy"><h2>{messages.events.placeholder}</h2><p>{messages.events.placeholderDescription}</p></div>
					<Badge variant="outline" class="ml-auto max-[40rem]:ml-10 h-auto whitespace-normal font-mono text-[0.59rem] text-warning bg-warning/10 border-warning/40">{common.notConnected}</Badge>
				</Alert.Root>
			</div>
			<div class="operations-grid">
				<section aria-labelledby={`${id}-schedule-title`}>
					<Card.Root class="gap-0 p-0 min-w-0">
						<div class="panel-heading"><h2 class="panel-title" id={`${id}-schedule-title`}>{messages.events.scheduleTitle}</h2><Badge variant="outline" class="h-auto whitespace-normal font-mono text-[0.59rem] text-secondary bg-secondary/10 border-secondary/30">{common.sampleData}</Badge></div>
						<ol class="schedule-list">{#each sampleEvents as event}<li><div class="schedule-date mono"><strong>{messages.events.dates[event.key]}</strong><span>{event.time}</span></div><div class="schedule-details"><p class="eyebrow">{messages.events[event.type]}</p><h3>{messages.events[event.key]}</h3><p><AdminIcon name="students" size={14} />{event.cohort}</p></div><span class="schedule-mark" aria-hidden="true">+</span></li>{/each}</ol>
					</Card.Root>
				</section>
				<section aria-labelledby={`${id}-assignment-title`}>
					<Card.Root class="gap-0 p-0 min-w-0">
						<div class="panel-heading"><div><h2 class="panel-title" id={`${id}-assignment-title`}>{messages.events.assignmentTitle}</h2><p class="panel-subtitle">{messages.events.assignmentDescription}</p></div></div>
						<form class="operation-form" onsubmit={previewAssignment}>
							<div class="operation-field">
								<Label class="text-muted-foreground text-[0.74rem]" id={`${id}-assign-event`}>{messages.events.event}</Label>
								<div class="operation-choices" role="group" aria-labelledby={`${id}-assign-event`}>
									{#each sampleEvents as event}
										<Button type="button" size="sm" variant={assignmentEvent === event.key ? 'default' : 'outline'} aria-pressed={assignmentEvent === event.key} onclick={() => assignmentEvent = event.key}>{messages.events[event.key]}</Button>
									{/each}
								</div>
							</div>
							<div class="operation-field">
								<Label class="text-muted-foreground text-[0.74rem]" for={`${id}-assign-student`}>{messages.events.student}</Label>
								<NativeSelect.Root id={`${id}-assign-student`} bind:value={assignmentStudent} required>
									<NativeSelect.Option value="">{common.selectStudent}</NativeSelect.Option>
									{#each students as student (student.id)}<NativeSelect.Option value={student.id}>{student.name}</NativeSelect.Option>{/each}
								</NativeSelect.Root>
							</div>
							<Button size="sm" class="justify-self-end mt-2" type="submit">{messages.events.assign}<AdminIcon name="arrow" size={16} /></Button>
							{#if assignment}
								<div class="assignment-preview"><AdminIcon name="check" size={17} /><span><strong>{assignment.name}</strong><small>{messages.events[assignment.event]}</small></span><Badge variant="outline" class="h-auto whitespace-normal font-mono text-[0.59rem] text-secondary bg-secondary/10 border-secondary/30">{common.preview}</Badge></div>
							{/if}
						</form>
					</Card.Root>
				</section>
			</div>
			<div class="attendance-panel">
				<Card.Root class="relative gap-0 min-h-60 w-full items-center px-4 py-10">
					<div class="attendance-grid" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span></div>
					<AdminIcon name="target" size={30} /><h2>{messages.events.attendance}</h2><p>{messages.events.attendanceNote}</p>
					<Badge variant="outline" class="h-auto whitespace-normal font-mono text-[0.59rem] text-secondary bg-secondary/10 border-secondary/30">{messages.reports.future}</Badge>
				</Card.Root>
			</div>
		{/if}
		<div class="operation-feedback" aria-live="polite" aria-atomic="true">
			{#if feedback?.section === section}
				<Alert.Root role="status" class={isError ? 'flex items-center gap-3 px-4 py-3 shadow-[0_8px_32px_#0007] border-[#8e6545] text-[#efbf9e] bg-[#33261e]' : 'flex items-center gap-3 px-4 py-3 shadow-[0_8px_32px_#0007] border-primary/30 text-primary bg-primary/10'}>
					<span class="min-w-0 flex-1">{feedbackText}</span>
					<Button variant="ghost" size="icon-sm" type="button" aria-label={common.close} onclick={() => feedback = null}><AdminIcon name="close" size={17} /></Button>
				</Alert.Root>
			{/if}
		</div>
	</div>
{/if}

<style>
	.operations-content { display: grid; gap: 1.4rem; }
	.operations-grid { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 1.3rem; align-items: start; }
	.operations-content section { min-width: 0; }
	.module-code { margin-bottom: 0.45rem !important; font-size: 0.55rem !important; }
	.panel-heading > :global(svg) { flex-shrink: 0; color: var(--primary); }
	.operation-form { display: grid; gap: 1.2rem; padding: 1.5rem; }
	.operation-field { display: flex; flex-direction: column; gap: 0.5rem; min-width: 0; }
	.operation-choices { display: flex; flex-wrap: wrap; gap: 0.5rem; min-width: 0; }
	.operation-choices :global([data-slot="button"]) { max-width: 100%; flex: 1 1 auto; }
	.amount-field { position: relative; display: flex; align-items: center; }
	.amount-field > span:first-child { position: absolute; left: 0.85rem; color: var(--primary); }
	.currency-label { position: absolute; right: 1rem; color: var(--muted-foreground); font-size: 0.65rem; }
	.form-footer { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem; margin-top: 0.5rem; padding-top: 1rem; border-top: 1px solid var(--border); }
	.local-label { display: flex; align-items: center; gap: 0.4rem; color: var(--muted-foreground); font-size: 0.61rem; }
	.refund-body { padding: 1.5rem; }
	.refund-top { display: flex; align-items: center; gap: 0.7rem; }
	.refund-avatar { display: grid; flex-shrink: 0; place-items: center; width: 2.5rem; height: 2.5rem; border: 1px solid #5f5140; border-radius: 4px; background: #322c23; color: var(--warning); font-size: 0.76rem; }
	.refund-top h3 { margin: 0; font-size: 0.86rem; }
	.refund-top p { margin: 0.2rem 0 0; color: var(--muted-foreground); font-size: 0.67rem; overflow-wrap: anywhere; }
	.refund-amount { margin-left: auto; font-size: 1.2rem; font-weight: 500; }
	.refund-reason { margin: 1.5rem 0; padding: 0.8rem 0.9rem; border-left: 2px solid #8f7751; background: #242722; color: var(--muted-foreground); font-size: 0.76rem; }
	.refund-bottom { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem; }
	.integration-note { padding: 1rem 1.5rem; border-top: 1px solid var(--border); }
	.integration-note :global(svg) { flex-shrink: 0; margin-top: 0.2rem; color: var(--warning); }
	.refund-modal-summary span { color: var(--warning); }
	.preview-list, .report-history, .schedule-list { list-style: none; margin: 0; padding: 0; }
	.preview-list li { display: flex; align-items: center; gap: 1rem; padding: 1.4rem 1.5rem; border-bottom: 1px solid var(--border); }
	.preview-list li:last-child, .report-history li:last-child { border-bottom: 0; }
	.list-icon { display: grid; flex-shrink: 0; place-items: center; width: 2.7rem; height: 2.7rem; border: 1px solid #3f4e42; border-radius: 4px; background: #222d25; color: var(--primary); }
	.list-icon :global(svg) { color: var(--primary); }
	.link-info { flex: 1; min-width: 0; }
	.link-info h3 { margin: 0; font-size: 0.84rem; }
	.link-info p { margin: 0.3rem 0 0.5rem; color: var(--muted-foreground); font-size: 0.68rem; overflow-wrap: anywhere; }
	.link-actions { display: flex; align-items: flex-end; flex-direction: column; gap: 0.7rem; }
	.invitations-grid { grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); align-items: stretch; }
	.invitation-instrument { position: relative; display: flex; min-width: 0; overflow: hidden; text-align: center; }
	.invitation-instrument :global([data-slot="card"]) { background: radial-gradient(ellipse at 50% 28%, #2b382a80, transparent 65%), var(--card); }
	.invitation-instrument h2 { margin: 0.65rem 0 0; font-size: 1.2rem; letter-spacing: -0.03em; }
	.invitation-instrument p:not(.eyebrow) { margin: 0.7rem 0 1rem; color: var(--muted-foreground); font-size: 0.72rem; line-height: 1.8; }
	.invitation-radar { position: relative; width: 11rem; height: 11rem; margin-bottom: 0.5rem; }
	.orbit { position: absolute; top: 50%; left: 50%; border: 1px solid #526448; border-radius: 50%; transform: translate(-50%, -50%); }
	.orbit-one { width: 100%; height: 100%; opacity: 0.4; } .orbit-two { width: 73%; height: 73%; opacity: 0.6; } .orbit-three { width: 40%; height: 40%; background: #2b382b; }
	.radar-axis { position: absolute; inset: 50% 0 auto; border-top: 1px dashed #637357; opacity: 0.5; }
	.radar-axis::after { position: absolute; left: 50%; top: -5.5rem; height: 11rem; content: ''; border-left: 1px dashed #637357; }
	.radar-center { position: absolute; inset: 0; display: grid; place-items: center; color: var(--primary); }
	.radar-center :global(svg) { color: var(--primary); }
	.radar-point { position: absolute; width: 6px; height: 6px; border: 1px solid var(--primary); border-radius: 50%; background: #657f49; box-shadow: 0 0 8px #bed29c50; }
	.point-one { top: 16%; left: 37%; } .point-two { top: 52%; right: 10%; } .point-three { bottom: 19%; left: 24%; }
	.import-step-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); padding: 1rem 1.3rem; }
	.import-step-grid > div { display: flex; align-items: center; gap: 0.7rem; color: var(--muted-foreground); }
	.step-number { display: grid; flex-shrink: 0; place-items: center; width: 2rem; height: 2rem; border: 1px solid var(--border); border-radius: 4px; font-size: 0.65rem; }
	.current .step-number { color: var(--primary); border-color: #526347; background: #283528; }
	.import-steps strong { display: block; font-weight: 500; font-size: 0.76rem; } .import-steps .current strong { color: var(--primary); }
	.import-steps small { display: block; margin-top: 0.2rem; color: var(--muted-foreground); font-size: 0.57rem; }
	.step-arrow { margin: 0 auto; padding: 0 0.7rem; color: #6d7d70; }
	.upload-body { padding: 1.5rem; }
	.upload-zone { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 17rem; padding: 2rem 1rem; border: 1px dashed #546646; border-radius: 4px; background: linear-gradient(#19231d90, #10191b80); text-align: center; }
	.upload-symbol { display: grid; place-items: center; width: 4rem; height: 4rem; margin-bottom: 1.4rem; border: 1px solid #4b5b40; border-radius: 6px; background: #253225; color: var(--primary); }
	.upload-symbol :global(svg) { color: var(--primary); }
	.upload-zone h3 { margin: 0; font-size: 1.1rem; } .upload-zone p { margin: 0.6rem 0 1.5rem; color: var(--muted-foreground); font-size: 0.69rem; }
	.upload-zone :global([data-slot="label"]) { position: relative; cursor: pointer; }
	.upload-zone input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
	.staged-file { margin-top: 1.2rem; }
	.staged-details { flex: 1; min-width: 0; }
	.staged-file strong { display: block; font-size: 0.77rem; overflow-wrap: anywhere; }
	.file-size { display: block; margin: 0.25rem 0 0.4rem; color: var(--muted-foreground); font-size: 0.62rem; }
	.staging-note { margin: 1.2rem 0 0; }
	.staging-note :global(svg) { flex-shrink: 0; margin-top: 0.15rem; color: var(--warning); }
	.format-body { padding: 0.7rem 1.4rem 1.4rem; }
	.schema-row { display: flex; align-items: center; gap: 0.8rem; padding: 1.2rem 0; border-bottom: 1px solid var(--border); }
	.column-number { color: #99ad88; font-size: 0.63rem; }
	.schema-row strong { font-weight: 500; font-size: 0.75rem; } .schema-row small { display: block; margin-top: 0.3rem; color: var(--muted-foreground); font-size: 0.68rem; }
	.report-history li { display: flex; align-items: center; gap: 1rem; padding: 1.3rem 1.5rem; border-bottom: 1px solid var(--border); }
	.report-history h3 { margin: 0; font-size: 0.78rem; font-weight: 500; overflow-wrap: anywhere; } .report-history p { margin: 0.3rem 0 0; color: var(--muted-foreground); font-size: 0.69rem; }
	.placeholder-icon :global(svg) { color: var(--warning); }
	.placeholder-copy { min-width: 0; flex: 1; }
	.placeholder-banner h2 { margin: 0; font-size: 0.9rem; }
	.placeholder-banner p { margin: 0.4rem 0 0; color: var(--muted-foreground); font-size: 0.74rem; line-height: 1.8; }
	.schedule-list { padding: 0 1.4rem; }
	.schedule-list li { position: relative; display: flex; gap: 1.2rem; padding: 1.6rem 0; border-bottom: 1px solid var(--border); }
	.schedule-list li:last-child { border-bottom: 0; }
	.schedule-date { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.4rem; min-width: 4rem; height: 4rem; border: 1px solid #45513f; border-radius: 4px; color: var(--primary); background: #253025; }
	.schedule-date strong { font-weight: 500; font-size: 0.73rem; } .schedule-date span { color: var(--muted-foreground); font-size: 0.62rem; }
	.schedule-details .eyebrow { font-size: 0.52rem; } .schedule-details h3 { margin: 0.4rem 0; font-size: 0.85rem; }
	.schedule-details > p:last-child { display: flex; align-items: center; gap: 0.4rem; margin: 0; color: var(--muted-foreground); font-size: 0.65rem; }
	.schedule-mark { margin-left: auto; color: #7e9670; }
	.assignment-preview { display: flex; align-items: center; gap: 0.6rem; padding-top: 1rem; border-top: 1px solid var(--border); color: var(--primary); }
	.assignment-preview > :global(svg) { color: var(--primary); }
	.assignment-preview > span:first-of-type { flex: 1; } .assignment-preview strong { font-size: 0.73rem; } .assignment-preview small { display: block; margin-top: 0.2rem; color: var(--muted-foreground); font-size: 0.62rem; }
	.attendance-panel { min-width: 0; text-align: center; }
	.attendance-panel :global([data-slot="card"] > svg) { color: var(--primary); }
	.attendance-panel h2 { margin: 1rem 0 0; font-size: 1.1rem; }
	.attendance-panel p { margin: 0.5rem 0 1rem; color: var(--muted-foreground); font-size: 0.76rem; }
	.attendance-grid { position: absolute; inset: 1.2rem; display: grid; grid-template-columns: repeat(6, 1fr); pointer-events: none; opacity: 0.12; }
	.attendance-grid span { border: 1px solid var(--primary); border-right: 0; } .attendance-grid span:last-child { border-right: 1px solid var(--primary); }
	.operation-feedback { position: fixed; right: 1.5rem; bottom: 1.5rem; z-index: 20; width: min(30rem, calc(100vw - 2rem)); }
	@media (max-width: 70rem) { .operations-grid, .invitations-grid { grid-template-columns: minmax(0, 1fr); } .invitation-instrument { display: none; } }
	@media (max-width: 40rem) {
		.operation-form, .refund-body, .upload-body { padding: 1.1rem; }
		.preview-list li { flex-wrap: wrap; gap: 0.8rem; padding: 1.1rem; } .link-info { flex-basis: calc(100% - 3.5rem); }
		.link-actions { width: 100%; flex-direction: row; justify-content: space-between; align-items: center; }
		.import-step-grid { grid-template-columns: minmax(0, 1fr); gap: 1rem; } .step-arrow { display: none; }
		.report-history li { flex-wrap: wrap; gap: 0.7rem; padding: 1rem; } .report-history li > div { flex: 1; min-width: 0; }
		.schedule-list { padding: 0 1rem; } .schedule-list li { gap: 0.8rem; } .schedule-mark { display: none; }
		.refund-top { flex-wrap: wrap; } .refund-amount { width: 100%; margin-top: 0.4rem; }
	}
</style>
