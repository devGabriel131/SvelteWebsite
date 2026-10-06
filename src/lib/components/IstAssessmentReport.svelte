<script lang="ts">
	import { Badge } from '#lib/components/ui/badge/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import type { IstReport } from '#lib/ist/presentation.ts';

	let { report }: { report: IstReport } = $props();
	const language = useLanguage();
</script>

<Card.Root class={`gap-0 rounded-xl border p-5 ring-0 ${report.passed
	? 'border-primary bg-accent'
	: 'border-[#f0a6a6] bg-[color-mix(in_srgb,#f0a6a6_6%,var(--card))]'}`}>
	<p class="label">{report.overallLabel}</p>
	<h3 class="overall-heading">{report.overall}</h3>
	<p class="below"><strong>{report.belowBaselineLabel}:</strong> {report.belowBaseline}</p>
</Card.Root>

<dl class="details">
	{#each report.details as detail}
		<div><dt>{detail.label}</dt><dd>{detail.value}</dd></div>
	{/each}
</dl>

<div class="result-grid">
	{#each report.rows as row (row.key)}
		<article class="result-card">
			<Card.Root class="h-full gap-0 rounded-xl border border-border bg-background p-5 ring-0">
			<div class="result-heading">
				<h3>{row.label}</h3>
				<Badge variant="outline" class={`h-auto whitespace-normal ${row.grade === 'green'
					? 'green bg-[#28362b] text-[#c6dfac]'
					: row.grade === 'yellow'
						? 'yellow bg-[#393322] text-[#ffe39c]'
						: 'red bg-[#3b272b] text-[#f0a6a6]'}`}>
					{row.gradeLabel}
				</Badge>
			</div>
			<dl>
				<div class="recorded-result"><dt>{report.columns.result}</dt><dd>{row.result}</dd></div>
				<div class="outcome"><dt>{report.columns.outcome}</dt><dd>{row.outcome}</dd></div>
			</dl>
			<p class="threshold-label">{report.columns.thresholds}</p>
			<ul>{#each row.thresholds as threshold}<li>{threshold}</li>{/each}</ul>
			</Card.Root>
		</article>
	{/each}
</div>
<p class="snapshot-note">{language.messages.ist.snapshotNote}</p>
<p class="disclaimer">{report.disclaimer}</p>

<style>
	.label { margin: 0 0 0.4rem; color: var(--muted-foreground); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
	h3 { margin: 0; font-size: 1rem; overflow-wrap: anywhere; }
	.overall-heading { font-size: 1.25rem; }
	.below { margin: 0.75rem 0 0; font-size: 0.875rem; }
	dl { margin: 0; }
	.details { display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: 1rem 1.5rem; margin-block: 1.5rem; }
	dt { color: var(--muted-foreground); font-size: 0.75rem; }
	dd { margin: 0.25rem 0 0; overflow-wrap: anywhere; font-size: 0.875rem; }
	.result-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
	.result-card { min-width: 0; }
	.result-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.65rem; }
	.result-card dl { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 1rem; margin-block: 1.1rem; }
	.recorded-result dd { font-weight: 700; font-size: 1rem; }
	.outcome { text-align: right; }
	.threshold-label { margin: 0; font-size: 0.75rem; font-weight: 700; color: var(--muted-foreground); }
	ul { margin: 0.35rem 0 0; padding: 0; list-style: none; }
	li { font-size: 0.8125rem; overflow-wrap: anywhere; line-height: 1.8; }
	.snapshot-note, .disclaimer { color: var(--muted-foreground); font-size: 0.8125rem; }
	.snapshot-note { margin: 1.25rem 0 0.5rem; }
	.disclaimer { margin: 0; padding-top: 0.75rem; border-top: 1px solid var(--border); }
	@media (max-width: 45rem) { .result-grid { grid-template-columns: minmax(0, 1fr); } }
</style>
