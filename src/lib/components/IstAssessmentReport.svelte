<script lang="ts">
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import type { IstReport } from '#lib/ist/presentation.ts';

	let { report }: { report: IstReport } = $props();
	const language = useLanguage();
</script>

<div class="overall" class:passed={report.passed}>
	<p class="label">{report.overallLabel}</p>
	<h3>{report.overall}</h3>
	<p class="below"><strong>{report.belowBaselineLabel}:</strong> {report.belowBaseline}</p>
</div>

<dl class="details">
	{#each report.details as detail}
		<div><dt>{detail.label}</dt><dd>{detail.value}</dd></div>
	{/each}
</dl>

<div class="result-grid">
	{#each report.rows as row (row.key)}
		<article class="result-card">
			<div class="result-heading">
				<h3>{row.label}</h3>
				<span class="grade" class:green={row.grade === 'green'} class:yellow={row.grade === 'yellow'} class:red={row.grade === 'red'}>
					{row.gradeLabel}
				</span>
			</div>
			<dl>
				<div class="recorded-result"><dt>{report.columns.result}</dt><dd>{row.result}</dd></div>
				<div class="outcome"><dt>{report.columns.outcome}</dt><dd>{row.outcome}</dd></div>
			</dl>
			<p class="threshold-label">{report.columns.thresholds}</p>
			<ul>{#each row.thresholds as threshold}<li>{threshold}</li>{/each}</ul>
		</article>
	{/each}
</div>
<p class="snapshot-note">{language.messages.ist.snapshotNote}</p>
<p class="disclaimer">{report.disclaimer}</p>

<style>
	.overall { padding: 1.25rem; border: 1px solid #f0a6a6; border-radius: 0.75rem; background: color-mix(in srgb, #f0a6a6 6%, var(--color-surface)); }
	.overall.passed { border-color: var(--color-accent); background: var(--color-accent-soft); }
	.label { margin: 0 0 0.4rem; color: var(--color-muted); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
	h3 { margin: 0; font-size: 1rem; overflow-wrap: anywhere; }
	.overall h3 { font-size: 1.25rem; }
	.below { margin: 0.75rem 0 0; font-size: 0.875rem; }
	dl { margin: 0; }
	.details { display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: 1rem 1.5rem; margin-block: 1.5rem; }
	dt { color: var(--color-muted); font-size: 0.75rem; }
	dd { margin: 0.25rem 0 0; overflow-wrap: anywhere; font-size: 0.875rem; }
	.result-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
	.result-card { min-width: 0; padding: 1.25rem; border: 1px solid var(--color-border); border-radius: 0.75rem; background: var(--color-background); }
	.result-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.65rem; }
	.grade { padding: 0.2rem 0.55rem; border-radius: 0.35rem; font-size: 0.75rem; font-weight: 700; }
	.green { color: #c6dfac; background: #28362b; }
	.yellow { color: #ffe39c; background: #393322; }
	.red { color: #f0a6a6; background: #3b272b; }
	.result-card dl { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 1rem; margin-block: 1.1rem; }
	.recorded-result dd { font-weight: 700; font-size: 1rem; }
	.outcome { text-align: right; }
	.threshold-label { margin: 0; font-size: 0.75rem; font-weight: 700; color: var(--color-muted); }
	ul { margin: 0.35rem 0 0; padding: 0; list-style: none; }
	li { font-size: 0.8125rem; overflow-wrap: anywhere; line-height: 1.8; }
	.snapshot-note, .disclaimer { color: var(--color-muted); font-size: 0.8125rem; }
	.snapshot-note { margin: 1.25rem 0 0.5rem; }
	.disclaimer { margin: 0; padding-top: 0.75rem; border-top: 1px solid var(--color-border); }
	@media (max-width: 45rem) { .result-grid { grid-template-columns: minmax(0, 1fr); } }
</style>
