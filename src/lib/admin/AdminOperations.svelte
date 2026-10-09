<script lang="ts">
	import AdminIcon from '#lib/admin/AdminIcon.svelte';
	import { isAdminPreviewSection, type AdminSection } from '#lib/admin/navigation.ts';
	import type { AdminStudent } from '#lib/admin/roster.ts';
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

	type Feedback = 'created' | 'copied' | 'copyFailed' | 'refundSuccess' | 'invalidAmount' | 'invalidFile' | 'required';
	let feedback = $state<{ section: AdminSection; key: Feedback } | null>(null);
	const feedbackText = $derived(feedback ? (
		feedback.key === 'refundSuccess' ? messages.payments.refundSuccess :
		feedback.key === 'invalidAmount' ? messages.payments.invalidAmount :
		feedback.key === 'invalidFile' ? messages.reports.invalidFile : common[feedback.key]
	) : '');
	const isError = $derived(feedback && ['invalidAmount', 'invalidFile', 'required', 'copyFailed'].includes(feedback.key));

	interface PaymentPreview { id: number; name: string; amount: number; recipient: string; url: string }
	let paymentName = $state('');
	let paymentAmount = $state<number | undefined>(250);
	let paymentStudent = $state('');
	let paymentLinks = $state<PaymentPreview[]>([{ id: 1, name: '', amount: 250, recipient: 'Alex Rivera', url: previewPaymentLink(1) }]);
	let refundReviewed = $state(false);
	let refundOpen = $state(false);
	let refundTrigger: HTMLElement | null = null;


	let stagedFile = $state<{ name: string; size: number } | null>(null);
	let fileInput = $state<HTMLInputElement>();
	const reportRows = [
		{ name: 'alpha-01-practice.csv', rows: 4, state: 'reviewed' as const },
		{ name: 'bravo-02-baseline.csv', rows: 4, state: 'pending' as const }
	];


	function previewPaymentLink(sequence: number): string {
		return `https://preview.example.invalid/payment/demo-${String(sequence).padStart(3, '0')}`;
	}

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
		paymentLinks = [{ id: nextId, name: paymentName.trim(), amount: paymentAmount, recipient: student.name, url: previewPaymentLink(nextId) }, ...paymentLinks];
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
</script>

{#if isAdminPreviewSection(section)}
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
				<Dialog.Content closeLabel={common.close} class="admin-console-dialog bg-card" interactOutsideBehavior="ignore" onCloseAutoFocus={restoreRefundFocus}>
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
	.preview-list, .report-history { list-style: none; margin: 0; padding: 0; }
	.preview-list li { display: flex; align-items: center; gap: 1rem; padding: 1.4rem 1.5rem; border-bottom: 1px solid var(--border); }
	.preview-list li:last-child, .report-history li:last-child { border-bottom: 0; }
	.list-icon { display: grid; flex-shrink: 0; place-items: center; width: 2.7rem; height: 2.7rem; border: 1px solid #3f4e42; border-radius: 4px; background: #222d25; color: var(--primary); }
	.list-icon :global(svg) { color: var(--primary); }
	.link-info { flex: 1; min-width: 0; }
	.link-info h3 { margin: 0; font-size: 0.84rem; }
	.link-info p { margin: 0.3rem 0 0.5rem; color: var(--muted-foreground); font-size: 0.68rem; overflow-wrap: anywhere; }
	.link-actions { display: flex; align-items: flex-end; flex-direction: column; gap: 0.7rem; }

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
	.operation-feedback { position: fixed; right: 1.5rem; bottom: 1.5rem; z-index: 20; width: min(30rem, calc(100vw - 2rem)); }
	@media (max-width: 70rem) { .operations-grid { grid-template-columns: minmax(0, 1fr); } }
	@media (max-width: 40rem) {
		.operation-form, .refund-body, .upload-body { padding: 1.1rem; }
		.preview-list li { flex-wrap: wrap; gap: 0.8rem; padding: 1.1rem; } .link-info { flex-basis: calc(100% - 3.5rem); }
		.link-actions { width: 100%; flex-direction: row; justify-content: space-between; align-items: center; }
		.import-step-grid { grid-template-columns: minmax(0, 1fr); gap: 1rem; } .step-arrow { display: none; }
		.report-history li { flex-wrap: wrap; gap: 0.7rem; padding: 1rem; } .report-history li > div { flex: 1; min-width: 0; }
		.refund-top { flex-wrap: wrap; } .refund-amount { width: 100%; margin-top: 0.4rem; }
	}
</style>
