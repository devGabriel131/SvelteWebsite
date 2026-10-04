<script lang="ts">
	import AdminIcon, { type IconName } from '#lib/admin/AdminIcon.svelte';
	import AdminStudents from '#lib/admin/AdminStudents.svelte';
	import {
		activitySeries,
		chartPoints,
		sampleStudents,
		studentMetrics,
		type AdminSection,
		type AdminStudent
	} from '#lib/admin/demo.ts';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';

	let {
		students = $bindable<AdminStudent[]>(),
		openAdd = $bindable(false),
		onNavigate
	}: {
		students: AdminStudent[];
		openAdd?: boolean;
		onNavigate: (section: AdminSection) => void;
	} = $props();

	type MetricKey = 'total' | 'active' | 'average' | 'attention';
	type FeedKey = 'assessment' | 'lesson' | 'invitation' | 'report';

	const language = useLanguage();
	const id = $props.id();
	const targetScore = 80;
	const chartWidth = 600;
	const chartHeight = 150;
	const messages = $derived(language.messages.admin.overview);
	const common = $derived(language.messages.admin.common);
	const numberFormat = $derived(new Intl.NumberFormat(language.current, { maximumFractionDigits: 0 }));
	const metrics = $derived(studentMetrics(students));
	const attentionStudents = $derived(students.filter((student) =>
		student.status === 'paused' || (student.score !== null && student.score < 70)
	));
	const scoreSparkline = $derived(chartPoints(
		students.flatMap((student) => student.score === null ? [] : [student.score]), 84, 28
	));
	const metricTiles = $derived([
		{ key: 'total', icon: 'students', value: metrics.total, bars: students.slice(0, 8).map((student) => student.progress) },
		{ key: 'active', icon: 'pulse', value: metrics.active, bars: students.filter((student) => student.status === 'active').slice(0, 8).map((student) => student.progress) },
		{ key: 'average', icon: 'target', value: metrics.averageScore, bars: [] },
		{ key: 'attention', icon: 'shield', value: metrics.needsAttention, bars: attentionStudents.slice(0, 8).map((student) => student.score ?? student.progress) }
	] satisfies { key: MetricKey; icon: IconName; value: number; bars: number[] }[]);

	let period = $state<'week' | 'month'>('week');
	const sessions = $derived(activitySeries[period]);
	const sessionTotal = $derived(sessions.reduce((sum, value) => sum + value, 0));
	const sessionMaximum = $derived(Math.max(...sessions, 1));
	const sessionPoints = $derived(chartPoints(sessions, chartWidth, chartHeight));
	const areaPoints = $derived(`0,${chartHeight} ${sessionPoints} ${chartWidth},${chartHeight}`);
	const weekLabels = $derived(Object.values(messages.days));
	const chartTicks = $derived([sessionMaximum, Math.round(sessionMaximum * 2 / 3), Math.round(sessionMaximum / 3), 0]);

	const activityFeed: { key: FeedKey; student: AdminStudent; icon: IconName }[] = [
		{ key: 'assessment', student: sampleStudents[0], icon: 'target' },
		{ key: 'lesson', student: sampleStudents[1], icon: 'check' },
		{ key: 'invitation', student: sampleStudents[5], icon: 'invitations' },
		{ key: 'report', student: sampleStudents[2], icon: 'reports' }
	];
</script>

<div class="overview-content">
	<div class="metrics-grid">
		{#each metricTiles as metric, index (metric.key)}
			<article class="panel metric-tile" class:warning={metric.key === 'attention' && metrics.needsAttention > 0} aria-labelledby={`${id}-metric-${metric.key}`}>
				<div class="metric-heading">
					<span class="metric-icon"><AdminIcon name={metric.icon} size={17} /></span>
					<h2 class="metric-label" id={`${id}-metric-${metric.key}`}>{messages.metrics[metric.key]}</h2>
					<span class="instrument-index mono" aria-hidden="true">{numberFormat.format(index + 1).padStart(2, '0')}</span>
				</div>
				<div class="metric-reading">
					<p class="metric-value mono">{numberFormat.format(metric.value)}</p>
					<svg class="metric-decoration" width="84" height="28" viewBox="0 0 84 28" aria-hidden="true">
						<path class="mini-baseline" d="M0 27.5H84" />
						{#if metric.key === 'average'}
							<polyline class="mini-sparkline" points={scoreSparkline} />
						{:else}
							{#each metric.bars as value, barIndex}
								<rect x={barIndex * 11} y={27 - Math.max(3, value * 0.24)} width="6" height={Math.max(3, value * 0.24)} rx="1" />
							{/each}
						{/if}
					</svg>
				</div>
				<p class="metric-hint">{messages.metricHints[metric.key]}</p>
			</article>
		{/each}
	</div>

	<div class="dashboard-grid">
		<section class="panel activity-panel" aria-labelledby={`${id}-activity-title`}>
			<div class="panel-heading activity-heading">
				<div>
					<h2 class="panel-title" id={`${id}-activity-title`}>{messages.activityTitle}</h2>
					<p class="panel-subtitle">{messages.activitySubtitle}</p>
				</div>
				<div class="period-toggle" role="group" aria-label={messages.periodLabel}>
					<button class:selected={period === 'week'} type="button" aria-pressed={period === 'week'} onclick={() => period = 'week'}>{messages.week}</button>
					<button class:selected={period === 'month'} type="button" aria-pressed={period === 'month'} onclick={() => period = 'month'}>{messages.month}</button>
				</div>
			</div>
			<div class="activity-body">
				<div class="chart-summary">
					<p class="session-total"><strong class="mono">{numberFormat.format(sessionTotal)}</strong><span>{messages.sessions}</span></p>
					<div class="sample-change">
						<span class="change-value mono">{messages.activityChange}</span>
						<span class="sample-label mono">{common.sampleData}</span>
					</div>
				</div>
				<figure class="session-chart">
					<svg class="activity-chart" viewBox="-36 -4 652 166" role="img" aria-labelledby={`${id}-chart-title`} aria-describedby={`${id}-chart-description`}>
						<title id={`${id}-chart-title`}>{messages.chartLabel} — {messages[period]}</title>
						<desc id={`${id}-chart-description`}>{messages.chartDescription}</desc>
						<defs>
							<linearGradient id={`${id}-session-fill`} x1="0" y1="0" x2="0" y2="1">
								<stop offset="0%" stop-color="var(--console-sage)" stop-opacity="0.2" />
								<stop offset="100%" stop-color="var(--console-sage)" stop-opacity="0.015" />
							</linearGradient>
						</defs>
						<g aria-hidden="true">
							{#each chartTicks as tick, index}
								<line class="chart-grid-line" x1="0" y1={15 + index * 45} x2={chartWidth} y2={15 + index * 45} />
								<text class="chart-axis-value mono" x="-12" y={19 + index * 45} text-anchor="end">{numberFormat.format(tick)}</text>
							{/each}
							{#each [0, 100, 200, 300, 400, 500, 600] as x}
								<line class="chart-guide" x1={x} y1="15" x2={x} y2={chartHeight} />
							{/each}
							<polygon points={areaPoints} fill={`url(#${id}-session-fill)`} />
							<polyline class="session-line" points={sessionPoints} vector-effect="non-scaling-stroke" />
							{#each sessions as value, index}
								<circle class="session-point" class:last-point={index === sessions.length - 1} cx={index / (sessions.length - 1) * chartWidth} cy={chartHeight - value / sessionMaximum * (chartHeight - 15)} r={index === sessions.length - 1 ? 4 : 2.5} />
							{/each}
						</g>
					</svg>
					<div class="chart-axis mono" class:monthly={period === 'month'} aria-hidden="true">
						{#if period === 'week'}
							{#each weekLabels as day}<span>{day}</span>{/each}
						{:else}
							<span>{messages.monthStart}</span><span>{messages.monthMiddle}</span><span>{messages.monthEnd}</span>
						{/if}
					</div>
					<ol class="sr-only" aria-label={`${messages.chartLabel} — ${messages[period]}`}>
						{#each sessions as value, index}
							<li>{#if period === 'week'}{weekLabels[index]}: {/if}{numberFormat.format(value)} {messages.sessions}</li>
						{/each}
					</ol>
					<figcaption class="chart-caption"><span class="legend-line" aria-hidden="true"></span>{messages.chartLabel}</figcaption>
				</figure>
			</div>
		</section>

		<section class="panel readiness-panel" aria-labelledby={`${id}-readiness-title`}>
			<div class="panel-heading">
				<div>
					<h2 class="panel-title" id={`${id}-readiness-title`}>{messages.readinessTitle}</h2>
					<p class="panel-subtitle">{messages.readinessSubtitle}</p>
				</div>
				<span class="panel-instrument" aria-hidden="true"><AdminIcon name="target" size={19} /></span>
			</div>
			<div class="readiness-body">
				<svg class="readiness-gauge" viewBox="0 0 240 240" role="img" aria-labelledby={`${id}-gauge-title`} aria-describedby={`${id}-gauge-description`}>
					<title id={`${id}-gauge-title`}>{messages.readinessTitle}</title>
					<desc id={`${id}-gauge-description`}>{messages.readinessSubtitle}: {numberFormat.format(metrics.averageScore)}. {messages.target}: {numberFormat.format(targetScore)}. {messages.readinessNote}</desc>
					<g aria-hidden="true">
						<path class="radar-crosshair" d="M120 9V231M9 120H231" />
						<circle class="radar-ring" cx="120" cy="120" r="104" />
						{#each Array.from({ length: 40 }, (_, index) => index) as tick}
							<line class="gauge-tick" class:major-tick={tick % 5 === 0} x1="120" y1="18" x2="120" y2={tick % 5 === 0 ? 27 : 23} transform={`rotate(${tick * 9} 120 120)`} />
						{/each}
						<circle class="gauge-track" cx="120" cy="120" r="78" />
						<circle class="gauge-progress" cx="120" cy="120" r="78" pathLength="100" stroke-dasharray={`${metrics.averageScore} 100`} transform="rotate(-90 120 120)" />
						<line class="gauge-target" x1="189" y1="120" x2="207" y2="120" transform={`rotate(${targetScore * 3.6 - 90} 120 120)`} />
						<circle class="radar-inner" cx="120" cy="120" r="57" />
						<text class="gauge-value mono" x="120" y="124" text-anchor="middle">{numberFormat.format(metrics.averageScore)}</text>
						<text class="gauge-scale mono" x="120" y="147" text-anchor="middle">/ {numberFormat.format(100)}</text>
					</g>
				</svg>
				<p class="target-summary mono"><span class="target-marker" aria-hidden="true"></span>{messages.target}<strong>{numberFormat.format(targetScore)}</strong></p>
				<div class="readiness-note">
					<p class="readiness-focus">{messages.focus}</p>
					<p>{messages.readinessNote}</p>
				</div>
			</div>
		</section>

		<div class="roster-region">
			<AdminStudents compact bind:students bind:openAdd onViewAll={() => onNavigate('students')} />
		</div>

		<section class="panel event-panel" aria-labelledby={`${id}-event-title`}>
			<div class="panel-heading">
				<h2 class="panel-title" id={`${id}-event-title`}>{messages.eventTitle}</h2>
				<span class="panel-instrument" aria-hidden="true"><AdminIcon name="events" size={19} /></span>
			</div>
			<div class="event-body">
				<p class="eyebrow">{messages.eventType}</p>
				<h3 class="event-name">{messages.eventName}</h3>
				<p class="event-time mono"><AdminIcon name="events" size={17} />{messages.eventTime}</p>
				<dl class="event-cohort">
					<dt>{common.cohort}</dt>
					<dd class="mono">{messages.eventCohort}</dd>
				</dl>
				<div class="event-preview"><span class="status-badge neutral">{common.preview}</span><p>{messages.eventNote}</p></div>
				<button class="button-secondary schedule-button" type="button" onclick={() => onNavigate('events')}>{messages.viewSchedule}<AdminIcon name="arrow" size={16} /></button>
			</div>
		</section>

		<section class="panel feed-panel" aria-labelledby={`${id}-feed-title`}>
			<div class="panel-heading">
				<div>
					<h2 class="panel-title" id={`${id}-feed-title`}>{messages.feedTitle}</h2>
					<p class="panel-subtitle">{messages.feedSubtitle}</p>
				</div>
				<span class="sample-label mono">{common.sampleData}</span>
			</div>
			<ol class="activity-feed">
				{#each activityFeed as event (event.key)}
					<li>
						<span class="feed-icon"><AdminIcon name={event.icon} size={16} /></span>
						<div class="feed-details"><span class="feed-student">{event.student.name}</span><p>{messages.feed[event.key]}</p></div>
						<span class="feed-time mono">{messages.feedTime[event.key]}</span>
					</li>
				{/each}
			</ol>
			<div class="feed-footer"><span>{common.localOnly}</span><button class="text-link" type="button" onclick={() => onNavigate('reports')}>{messages.uploadGrades}<AdminIcon name="upload" size={15} /></button></div>
		</section>

		{#if metrics.needsAttention > 0}
			<section class="panel attention-panel" aria-labelledby={`${id}-attention-title`}>
				<div class="attention-heading">
					<span class="attention-icon"><AdminIcon name="pulse" size={21} /></span>
					<span class="attention-count mono">{numberFormat.format(metrics.needsAttention)}<span>{messages.metrics.attention}</span></span>
				</div>
				<h2 class="panel-title" id={`${id}-attention-title`}>{messages.attentionTitle}</h2>
				<p class="attention-description">{messages.attentionDescription.replace('{count}', numberFormat.format(metrics.needsAttention))}</p>
				<ul class="attention-students">
					{#each attentionStudents.slice(0, 3) as student (student.id)}
						<li><span>{student.name}</span><span class="status-badge" class:warning={student.status === 'paused'}>{common.statusLabels[student.status]}</span></li>
					{/each}
				</ul>
				<button class="button-secondary review-button" type="button" onclick={() => onNavigate('students')}>{messages.reviewStudents}<AdminIcon name="arrow" size={16} /></button>
			</section>
		{/if}
	</div>
</div>

<style>
	.overview-content { display: grid; gap: 1.3rem; min-width: 0; }
	.metrics-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1rem; }
	.metric-tile { position: relative; padding: 1.15rem 1.25rem 1rem; }
	.metric-tile::before, .metric-tile::after { position: absolute; width: 7px; height: 7px; content: ''; pointer-events: none; opacity: 0.5; }
	.metric-tile::before { top: 5px; left: 5px; border-top: 1px solid var(--console-sage); border-left: 1px solid var(--console-sage); }
	.metric-tile::after { right: 5px; bottom: 5px; border-right: 1px solid var(--console-sage); border-bottom: 1px solid var(--console-sage); }
	.metric-heading { display: flex; align-items: center; gap: 0.55rem; min-width: 0; }
	.metric-icon { display: inline-flex; flex-shrink: 0; color: var(--console-sage); }
	.metric-label { margin: 0; color: var(--console-muted); font-size: 0.72rem; font-weight: 500; line-height: 1.4; }
	.instrument-index { margin-left: auto; padding-left: 0.2rem; color: var(--console-muted); font-size: 0.58rem; opacity: 0.7; }
	.metric-reading { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-top: 1.1rem; }
	.metric-value { margin: 0; color: var(--console-text); font-size: clamp(1.75rem, 2.6vw, 2.3rem); font-weight: 500; letter-spacing: -0.065em; line-height: 1; }
	.metric-decoration { flex-shrink: 0; width: min(84px, 45%); overflow: visible; color: var(--console-sage); }
	.metric-decoration rect { fill: currentColor; opacity: 0.5; }
	.mini-baseline { fill: none; stroke: var(--console-border); stroke-width: 1; }
	.mini-sparkline { fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
	.metric-hint { margin: 0.7rem 0 0; color: var(--console-muted); font-size: 0.65rem; line-height: 1.6; }
	.metric-tile.warning { border-color: color-mix(in srgb, var(--console-amber) 35%, var(--console-border)); }
	.warning .metric-icon, .warning .metric-value, .warning .metric-decoration { color: var(--console-amber); }
	.metric-tile.warning::before, .metric-tile.warning::after { border-color: var(--console-amber); }
	.dashboard-grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(18rem, 1fr); align-items: start; gap: 1.3rem; }
	.dashboard-grid > * { min-width: 0; }
	.activity-panel, .readiness-panel { align-self: stretch; }
	.activity-heading { flex-wrap: wrap; }
	.period-toggle { display: inline-flex; flex-shrink: 0; padding: 3px; border: 1px solid var(--console-border); border-radius: 4px; background: var(--console-bg); }
	.period-toggle button { min-height: 2rem; padding: 0.35rem 0.75rem; border: 1px solid transparent; border-radius: 2px; background: transparent; color: var(--console-muted); font-family: inherit; font-size: 0.68rem; font-weight: 600; }
	.period-toggle button:hover { color: var(--console-text); }
	.period-toggle button.selected { border-color: color-mix(in srgb, var(--console-sage) 20%, var(--console-border)); background: color-mix(in srgb, var(--console-sage) 10%, var(--console-panel)); color: var(--console-sage); }
	.activity-body { padding: 1.35rem 1.4rem 1.2rem; }
	.chart-summary { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.9rem; margin-bottom: 1.7rem; }
	.session-total { display: flex; align-items: baseline; gap: 0.65rem; margin: 0; }
	.session-total strong { font-size: 1.85rem; font-weight: 500; letter-spacing: -0.06em; }
	.session-total > span { color: var(--console-muted); font-size: 0.73rem; }
	.sample-change { display: grid; justify-items: end; gap: 0.35rem; }
	.change-value { color: var(--console-sage); font-size: 0.66rem; }
	.sample-label { color: var(--console-muted); font-size: 0.58rem; letter-spacing: 0.04em; }
	.session-chart { margin: 0; }
	.activity-chart { display: block; width: 100%; height: auto; overflow: visible; }
	.chart-grid-line { stroke: var(--console-border); stroke-width: 1; stroke-dasharray: 3 5; }
	.chart-guide { stroke: var(--console-border); stroke-width: 1; opacity: 0.3; }
	.chart-axis-value { fill: var(--console-muted); font-size: 10px; }
	.session-line { fill: none; stroke: var(--console-sage); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
	.session-point { fill: var(--console-panel); stroke: var(--console-sage); stroke-width: 1.5; }
	.last-point { fill: var(--console-sage); }
	.chart-axis { display: flex; justify-content: space-between; gap: 0.2rem; margin: 0.35rem 2.45% 0 5.5%; color: var(--console-muted); font-size: 0.6rem; }
	.chart-axis span { text-align: center; }
	.chart-axis span:first-child { text-align: left; }
	.chart-axis span:last-child { text-align: right; }
	.chart-caption { display: flex; align-items: center; gap: 0.55rem; margin-top: 1.4rem; color: var(--console-muted); font-size: 0.65rem; line-height: 1.5; }
	.legend-line { display: block; flex-shrink: 0; width: 1.1rem; height: 2px; background: var(--console-sage); }
	.panel-instrument { display: inline-flex; flex-shrink: 0; color: var(--console-muted); }
	.readiness-body { display: grid; justify-items: center; padding: 0.55rem 1.4rem 1.2rem; }
	.readiness-gauge { display: block; width: min(100%, 232px); height: auto; }
	.radar-crosshair { fill: none; stroke: var(--console-border); stroke-width: 1; opacity: 0.4; }
	.radar-ring { fill: none; stroke: var(--console-border); stroke-width: 1; opacity: 0.6; }
	.gauge-tick { stroke: var(--console-muted); stroke-width: 1; opacity: 0.4; }
	.major-tick { opacity: 0.8; }
	.gauge-track { fill: none; stroke: var(--console-border); stroke-width: 7; }
	.gauge-progress { fill: none; stroke: var(--console-sage); stroke-width: 7; }
	.gauge-target { stroke: var(--console-amber); stroke-width: 2; }
	.radar-inner { fill: var(--console-panel); stroke: var(--console-border); stroke-width: 1; stroke-dasharray: 2 5; }
	.gauge-value { fill: var(--console-text); font-size: 45px; font-weight: 500; letter-spacing: -3px; }
	.gauge-scale { fill: var(--console-muted); font-size: 12px; }
	.target-summary { display: flex; align-items: center; gap: 0.55rem; margin: 0.1rem 0 1rem; color: var(--console-muted); font-size: 0.65rem; }
	.target-marker { width: 8px; height: 2px; background: var(--console-amber); }
	.target-summary strong { color: var(--console-amber); font-weight: 500; }
	.readiness-note { width: 100%; padding-top: 1rem; border-top: 1px solid var(--console-border); text-align: center; }
	.readiness-note p { margin: 0; color: var(--console-muted); font-size: 0.65rem; line-height: 1.65; }
	.readiness-note .readiness-focus { margin-bottom: 0.3rem; color: var(--console-text); font-size: 0.75rem; font-weight: 600; }
	.roster-region { max-width: 100%; }
	.event-panel { align-self: stretch; }
	.event-body { display: flex; flex-direction: column; align-items: flex-start; padding: 1.5rem 1.4rem 1.4rem; }
	.event-name { max-width: 17rem; margin: 0.75rem 0 1.2rem; color: var(--console-text); font-size: 1.35rem; font-weight: 600; letter-spacing: -0.04em; line-height: 1.35; }
	.event-time { display: flex; align-items: center; gap: 0.65rem; margin: 0; color: var(--console-sage); font-size: 0.76rem; }
	.event-time :global(svg) { flex-shrink: 0; }
	.event-cohort { display: grid; gap: 0.4rem; width: 100%; margin: 1.3rem 0; padding: 1rem 0; border-top: 1px solid var(--console-border); border-bottom: 1px solid var(--console-border); }
	.event-cohort dt { color: var(--console-muted); font-size: 0.65rem; }
	.event-cohort dd { margin: 0; color: var(--console-text); font-size: 0.72rem; line-height: 1.5; }
	.event-preview { display: grid; gap: 0.65rem; justify-items: start; }
	.event-preview p { margin: 0; color: var(--console-muted); font-size: 0.66rem; line-height: 1.7; }
	.schedule-button { justify-content: space-between; width: 100%; margin-top: 1.4rem; text-align: left; }
	.schedule-button :global(svg) { flex-shrink: 0; }
	.activity-feed { margin: 0; padding: 0; list-style: none; }
	.activity-feed li { display: grid; grid-template-columns: 2rem minmax(0, 1fr) auto; align-items: center; gap: 0.8rem; padding: 1rem 1.4rem; }
	.activity-feed li + li { border-top: 1px solid color-mix(in srgb, var(--console-border) 65%, transparent); }
	.feed-icon { display: grid; place-items: center; width: 2rem; height: 2rem; border: 1px solid var(--console-border); border-radius: 4px; background: color-mix(in srgb, var(--console-sage) 5%, var(--console-panel)); color: var(--console-sage); }
	.feed-student { color: var(--console-text); font-size: 0.75rem; font-weight: 600; }
	.feed-details p { margin: 0.3rem 0 0; color: var(--console-muted); font-size: 0.69rem; line-height: 1.5; }
	.feed-time { color: var(--console-muted); font-size: 0.61rem; white-space: nowrap; }
	.feed-footer { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.8rem; padding: 0.9rem 1.4rem; border-top: 1px solid var(--console-border); }
	.feed-footer > span { color: var(--console-muted); font-size: 0.62rem; }
	.attention-panel { position: relative; padding: 1.4rem; border-color: color-mix(in srgb, var(--console-amber) 35%, var(--console-border)); background: linear-gradient(135deg, color-mix(in srgb, var(--console-amber) 5%, var(--console-panel)), var(--console-panel) 70%); }
	.attention-heading { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1.25rem; }
	.attention-icon { display: grid; place-items: center; width: 2.5rem; height: 2.5rem; border: 1px solid color-mix(in srgb, var(--console-amber) 35%, var(--console-border)); border-radius: 4px; color: var(--console-amber); }
	.attention-count { display: flex; align-items: center; gap: 0.6rem; color: var(--console-amber); font-size: 1.5rem; }
	.attention-count > span { max-width: 7rem; color: var(--console-muted); font-size: 0.59rem; line-height: 1.5; }
	.attention-description { margin: 0.75rem 0 1rem; color: var(--console-muted); font-size: 0.73rem; line-height: 1.75; }
	.attention-students { display: grid; gap: 0.7rem; margin: 0; padding: 1rem 0; border-top: 1px solid var(--console-border); list-style: none; }
	.attention-students li { display: flex; align-items: center; justify-content: space-between; gap: 0.65rem; }
	.attention-students li > span:first-child { color: var(--console-text); font-size: 0.71rem; }
	.review-button { justify-content: space-between; width: 100%; margin-top: 0.65rem; text-align: left; }
	.review-button :global(svg) { flex-shrink: 0; }

	@media (max-width: 75rem) {
		.metrics-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
		.dashboard-grid { grid-template-columns: minmax(0, 1.7fr) minmax(17rem, 1fr); }
	}
	@media (max-width: 60rem) {
		.dashboard-grid { grid-template-columns: minmax(0, 1fr); }
		.readiness-body { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: center; gap: 0 1.5rem; padding-top: 1rem; }
		.readiness-gauge { grid-row: 1 / 3; }
		.target-summary { align-self: end; margin: 0 0 1rem; }
		.readiness-note { align-self: start; }
	}
	@media (max-width: 40rem) {
		.overview-content, .dashboard-grid { gap: 1rem; }
		.metrics-grid { gap: 0.75rem; }
		.metric-tile { padding: 1rem; }
		.instrument-index { display: none; }
		.metric-decoration { width: min(64px, 45%); }
		.activity-body, .event-body { padding: 1.1rem 1rem; }
		.chart-summary { margin-bottom: 1.4rem; }
		.change-value { font-size: 0.61rem; }
		.chart-axis { font-size: 0.55rem; }
		.readiness-body { gap: 0 0.85rem; padding: 1rem; }
		.activity-feed li { grid-template-columns: 2rem minmax(0, 1fr); gap: 0.35rem 0.7rem; padding: 1rem; }
		.feed-icon { grid-row: 1 / 3; }
		.feed-time { grid-column: 2; }
		.feed-footer, .attention-panel { padding: 1rem; }
	}
	@media (max-width: 26rem) {
		.metrics-grid { grid-template-columns: minmax(0, 1fr); }
		.metric-decoration { width: 84px; }
		.readiness-body { grid-template-columns: minmax(0, 1fr); }
		.readiness-gauge { grid-row: auto; }
		.target-summary { margin-top: 0.2rem; }
		.sample-change { justify-items: start; }
	}
</style>
