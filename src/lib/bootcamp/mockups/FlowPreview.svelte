<script lang="ts">
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import { formatMessage } from '#lib/i18n/translations.ts';
	import { priceCents, depositCents, eventTimeZone, sectionKeys } from '../types';
	import { defaultLegalText } from '../legal';
	import { parseEventSchedule } from '../rules';
	import { canOpenPreviewRegistration, classTypes, registrationCoverage, previewRows, seedEvent, savePreviewEvent, previewSteps, type PreviewDesign, type PreviewStep, type PreviewStudent } from './model';
	let { design, roster }: { design: PreviewDesign; roster: PreviewStudent[] } = $props();
	const language = useLanguage();
	const m = $derived(language.messages.bootcampMockups);
	const messages = $derived(language.messages.bootcamp);
	let step = $state<PreviewStep>('list');
	let event = $state(seedEvent());
	let draft = $state(seedEvent());
		const steps = $derived(previewSteps(event.activated));
	let search = $state('');
	let filter = $state<'all' | 'registered' | 'unregistered'>('all');
		let classFilter = $state<'all' | PreviewStudent['classType']>('all');
	let feedback = $state<'saved' | 'activated' | null>(null);
	const schedule = $derived(parseEventSchedule(draft.date, draft.start, draft.end));
	const cutoffPassed = $derived(Boolean(schedule && schedule.registrationClosesAt.getTime() <= Date.now()));
	const mayOpen = $derived(canOpenPreviewRegistration(event));
	const isOpen = $derived(event.open && mayOpen);
	const legalPreview = $derived.by(() => {
		const venue = draft.venue.trim().normalize('NFC');
		return venue && schedule ? defaultLegalText({ venue, ...schedule }).es : null;
	});
		const scheduleDate = (value: Date) => new Intl.DateTimeFormat(language.current === 'es' ? 'es-PR' : 'en-US', {
			dateStyle: 'medium', timeStyle: 'short', timeZone: eventTimeZone, hourCycle: 'h23'
		}).format(value);
		const rows = $derived(previewRows(roster));
	const registered = $derived(rows.filter(row => row.registered));
		const coverage = $derived(registrationCoverage(rows));
	const collected = $derived(registered.reduce((sum, row) => sum + row.paidCents, 0));
	const balance = $derived(registered.reduce((sum, row) => sum + row.remainingCents, 0));
	const visible = $derived(rows.filter(row =>
		(filter === 'all' || row.registered === (filter === 'registered')) &&
				(classFilter === 'all' || row.classType === classFilter) &&
		`${row.name} ${row.email}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())));
	const title = $derived(event.title || m.eventTitle);
	const venue = $derived(event.venue || m.venue);
	const money = (cents: number) => new Intl.NumberFormat(language.current === 'es' ? 'es-PR' : 'en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
	const date = (value: string) => new Intl.DateTimeFormat(language.current === 'es' ? 'es-PR' : 'en-US', { dateStyle: 'long', timeZone: 'America/Puerto_Rico' }).format(new Date(`${value}T12:00:00-04:00`));
	function go(next: PreviewStep) {
		if (next === 'activate' || next === 'edit') next = event.activated ? 'edit' : 'activate';
		if (next === 'activate' || next === 'edit') draft = { ...event, title, venue };
		feedback = null;
		step = next;
	}
	function save() {
		const saved = savePreviewEvent(draft, event);
		if (!saved) return;
		event = saved;
		feedback = step === 'activate' ? 'activated' : 'saved';
		step = step === 'activate' ? 'edit' : 'report';
		draft = { ...event };
	}
	function toggleRegistration() {
		if (!event.open && !canOpenPreviewRegistration(event)) return;
		event.open = !event.open;
	}
	function reset() { event = seedEvent(); draft = seedEvent(); step = 'list'; feedback = null; search = ''; filter = 'all'; classFilter = 'all'; }
</script>

{#snippet navigation()}
	<nav aria-label={m.flow}>
		{#each steps as item}
			<button type="button" class:current={step === item} aria-current={step === item ? 'step' : undefined} onclick={() => go(item)}>{m[item]}</button>
		{/each}
	</nav>
{/snippet}

{#snippet stats()}
	<div class="stats">
		<div><span>{m.registered}</span><strong>{registered.length}<small> / {rows.length}</small></strong></div>
		<div><span>{m.collected}</span><strong>{money(collected)}</strong></div>
		<div><span>{m.balance}</span><strong>{money(balance)}</strong></div>
	</div>
{/snippet}

{#snippet brief()}
	<aside class="brief">
		<p class="overline">{m.brief}</p><h3>{title}</h3><p>{venue}</p>
		<dl><div><dt>{m.date}</dt><dd>{date(event.date)}</dd></div><div><dt>{m.start} / {m.end}</dt><dd>{event.start} — {event.end}</dd></div><div><dt>{m.fee} / {m.deposit}</dt><dd>{money(priceCents)} / {money(depositCents)}</dd></div></dl>
		<p class="subtle">{m.timezone}</p>
		<div class="coverage"><span>{m.progress}</span><strong>{rows.length ? Math.round(registered.length / rows.length * 100) : 0}%</strong></div>
		<progress aria-label={m.progress} value={registered.length} max={rows.length || 1}></progress>
		<span class="badge" class:open={isOpen}>{isOpen ? m.open : m.closed}</span>
	</aside>
{/snippet}

{#snippet studentTable()}
	<section class="roster">
		<div class="section-heading"><h3>{m.roster}</h3><span class="subtle">{formatMessage(m.count, { count: visible.length })}</span></div>
		<p class="subtle">{formatMessage(m.rosterNote, { registered: registered.length, total: rows.length })}</p>
					<div class="class-coverage">
						{#each coverage as group (group.classType)}
							<div>
								<div class="section-heading"><h3>{m[group.classType]}</h3><strong>{group.registered} / {group.total}</strong></div>
								<progress aria-label={formatMessage(m.classCoverage, { classType: m[group.classType] })} value={group.registered} max={group.total || 1}></progress>
								<span class="subtle">{m.progress} · {group.percent}%</span>
							</div>
						{/each}
					</div>
					<div class="filters class-filters" role="group" aria-label={m.classFilters}>
						{#each ['all', ...classTypes] as choice}
							<button type="button" class:chosen={classFilter === choice} aria-pressed={classFilter === choice} onclick={() => classFilter = choice as typeof classFilter}>{choice === 'all' ? m.allClasses : m[choice as PreviewStudent['classType']]}</button>
						{/each}
					</div>
		<div class="toolbar">
			<label class="search"><span class="sr-only">{m.search}</span><input type="search" bind:value={search} placeholder={m.searchPlaceholder} /></label>
			<div class="filters" role="group" aria-label={m.filters}>{#each ['all', 'registered', 'unregistered'] as choice}<button type="button" class:chosen={filter === choice} aria-pressed={filter === choice} onclick={() => filter = choice as typeof filter}>{m[choice as 'all' | 'registered' | 'unregistered']}</button>{/each}</div>
		</div>
		<!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users need to scroll the wide student table.) -->
		<div class="table-scroll" role="region" aria-label={m.roster} tabindex="0">
			<table><caption class="sr-only">{m.roster} — {title} — {m.demo}</caption><thead><tr><th scope="col">{m.student}</th><th scope="col">{m.classType}</th><th scope="col">{m.status}</th><th scope="col">{m.paid}</th><th scope="col">{m.remaining}</th>{#if step === 'report'}<th scope="col">{m.documents}</th>{/if}</tr></thead>
				<tbody>{#each visible as row (row.id)}<tr><th scope="row"><strong>{row.name}</strong><small>{row.email}</small></th><td><span class="badge">{m[row.classType]}</span></td><td><span class="badge" class:open={row.registered}>{row.registered ? (row.remainingCents ? m.payment : m.confirm) : m.unregistered}</span></td><td>{money(row.paidCents)}</td><td>{row.registered ? money(row.remainingCents) : '—'}</td>{#if step === 'report'}<td class="subtle">{m.noDocuments}</td>{/if}</tr>{:else}<tr><td colspan={step === 'report' ? 6 : 5}>{rows.length ? m.empty : m.emptyRoster}</td></tr>{/each}</tbody>
			</table>
		</div>
	</section>
{/snippet}

{#snippet eventActions()}
	<div class="actions"><button class="primary" type="button" onclick={() => go(event.activated ? 'edit' : 'activate')}>{event.activated ? m.editEvent : m.create} <span aria-hidden="true">↗</span></button><button type="button" onclick={() => go('report')}>{m.viewReport}</button></div>
{/snippet}

{#snippet content()}
	<div class="content-heading"><div><p class="overline">{m[design]} / 0{steps.indexOf(step) + 1}</p><h2>{m[`${step}Title`]}</h2></div><span class="badge">{m.demo}</span></div>
	{#if feedback}<p class="feedback" role="status">{m[feedback]}</p>{/if}
	{#if step === 'list'}
		{#if design === 'ledger'}
			<div class="table-scroll"><table class="event-ledger"><thead><tr><th scope="col">{m.event}</th><th scope="col">{m.date}</th><th scope="col">{m.status}</th></tr></thead><tbody><tr><th scope="row">{title}<small>{venue}</small></th><td>{date(event.date)}</td><td><span class="badge" class:open={isOpen}>{isOpen ? m.open : m.closed}</span></td></tr></tbody></table></div>
			{@render eventActions()}
		{:else if design === 'board'}
			<div class="stage-cards">
				{#each steps.slice(1) as stage, i}<button type="button" class="stage-card" onclick={() => go(stage)}><span class="overline">0{i + 2}</span><strong>{m[stage]}</strong><span>{stage === 'report' ? formatMessage(m.count, { count: registered.length }) : venue}</span><span aria-hidden="true">↗</span></button>{/each}
			</div>
		{:else}
			<article class="event-card"><div class="date-tile"><span>{new Intl.DateTimeFormat(language.current, { month: 'short' }).format(new Date(`${event.date}T12:00:00`))}</span><strong>{event.date.slice(8)}</strong><span>{event.date.slice(0, 4)}</span></div><div><span class="badge" class:open={isOpen}>{isOpen ? m.open : m.closed}</span><h3>{title}</h3><p>{venue} · {event.start} — {event.end}</p>{@render eventActions()}</div></article>
		{/if}
		{@render stats()}
		{@render studentTable()}
	{:else if step === 'activate' || step === 'edit'}
		<p>{step === 'activate' ? messages.admin.activationHint : messages.admin.editWarning}</p>
		<form onsubmit={(e) => { e.preventDefault(); save(); }}>
			<div class="editor-fields"><label class="wide">{m.event}<input bind:value={draft.title} maxlength="200" required /></label><label class="wide">{m.location}<input bind:value={draft.venue} maxlength="300" required /></label><label>{m.date}<input type="date" bind:value={draft.date} required /></label><label>{m.start}<input type="time" bind:value={draft.start} required /></label><label>{m.end}<input type="time" bind:value={draft.end} min={draft.start} required /></label></div>
			<div class="schedule" aria-live="polite">
								{#if schedule}
									<span>{m.arrival} · {scheduleDate(schedule.arrivalAt)}</span>
									<span>{m.deadline} · {scheduleDate(schedule.registrationClosesAt)}</span>
								{:else}<span>{m.scheduleInvalid}</span>{/if}
								<span>{m.timezone}</span>
							</div>
			{#if step === 'activate' && cutoffPassed}<p role="status">{messages.admin.cutoffPassed}</p>{/if}
			<section class="legal">
				<h3>{m.legal}</h3><p>{m.legalNote}</p>
				{#if legalPreview}
					{#each sectionKeys as section (section)}
						<details>
							<summary>{formatMessage(messages.admin.legalLabel, { section: messages.waiver.sections[section] })}</summary>
							<!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard access to the read-only agreement preview.) -->
							<div class="legal-text" role="region" tabindex="0" aria-label={formatMessage(messages.admin.legalLabel, { section: messages.waiver.sections[section] })} lang="es">{legalPreview[section]}</div>
						</details>
					{/each}
				{:else}<p>{messages.admin.legalPreviewPending}</p>{/if}
			</section>
			<div class="actions"><button type="submit" class="primary" disabled={!schedule || (step === 'activate' && cutoffPassed)}>{step === 'activate' ? m.create : m.save}</button><button type="button" onclick={() => go('list')}>{m.cancel}</button><button type="button" onclick={() => go('report')}>{m.viewReport}</button></div>
		</form>
	{:else}
		{@render stats()}
		<div class="report-heading"><div><h3>{title}</h3><p class="subtle">{date(event.date)} · {venue}</p></div><button type="button" onclick={() => go('edit')}>{m.editEvent}</button></div>
		{@render studentTable()}
		<details class="tools"><summary>{m.tools}</summary><p>{m.toolsNote}</p></details>
	{/if}
{/snippet}

<div class="preview {design}">
	{#if design === 'board'}
		<div class="board-top">{@render navigation()}<button type="button" class="reset" onclick={reset}>{m.reset}</button></div>
		<div class="board-layout">{@render brief()}<div class="main-panel">{@render content()}</div></div>
	{:else if design === 'ledger'}
		<div class="ledger-rail">{@render navigation()}<button type="button" class="reset" onclick={reset}>{m.reset}</button></div><div class="main-panel">{@render content()}</div>
	{:else}
		<div class="editorial-top">{@render navigation()}<button type="button" class="reset" onclick={reset}>{m.reset}</button></div>
		<div class="main-panel">{@render content()}</div>
	{/if}
	<footer><span>{formatMessage(m.revision, { revision: event.revision })}</span><button type="button" class="text-button" disabled={!event.activated || (!event.open && !mayOpen)} onclick={toggleRegistration}>{event.open ? m.closeRegistration : m.openRegistration}</button></footer>
</div>

<style>
	.class-coverage { display: flex; flex-wrap: wrap; gap: 16px; margin: 18px 0; }
	.class-coverage > div { flex: 1 1 200px; border: 1px solid var(--border); border-radius: 8px; padding: 14px; }
	.class-coverage h3 { font-size: 13px; }
	.class-coverage progress { display: block; width: 100%; height: 6px; margin: 10px 0; accent-color: var(--accent); }
	.class-filters { margin-bottom: 12px; }
	.preview { --accent: #315a4c; --wash: #edf3ef; border: 1px solid var(--border); border-radius: 16px; overflow: hidden; background: var(--card); color: var(--card-foreground); }
	button, input { font: inherit; } button { cursor: pointer; border: 1px solid var(--border); background: var(--card); border-radius: 7px; padding: 9px 13px; font-size: 12px; font-weight: 550; transition: background .15s; }
	button:hover { background: var(--muted); } button:focus-visible, input:focus-visible, summary:focus-visible, .table-scroll:focus-visible, .legal-text:focus-visible { outline: 2px solid var(--ring); outline-offset: 3px; }
	.primary { background: var(--accent); color: white; border-color: var(--accent); } .primary:hover { background: var(--accent); filter: brightness(1.1); }
	nav { display: flex; gap: 6px; flex-wrap: wrap; } nav button { background: transparent; border-color: transparent; color: var(--muted-foreground); display: flex; align-items: center; gap: 9px; } nav button.current { color: var(--foreground); background: var(--muted); }

	.editorial-top, .board-top { padding: 16px 26px; display: flex; justify-content: space-between; gap: 12px; align-items: center; border-bottom: 1px solid var(--border); }
	.reset { color: var(--muted-foreground); font-size: 11px; background: transparent; }
	.main-panel { padding: clamp(18px, 3vw, 36px); min-width: 0; }
	.content-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 26px; }
	.overline { font-size: 10px; text-transform: uppercase; letter-spacing: .16em; color: var(--muted-foreground); margin-bottom: 9px; }
	h2 { font-size: clamp(23px, 3vw, 32px); letter-spacing: -.04em; font-weight: 600; line-height: 1.15; } h3 { font-size: 17px; font-weight: 600; letter-spacing: -.02em; } p { font-size: 13px; color: var(--muted-foreground); line-height: 1.6; }
	.editorial h2, .editorial .event-card h3 { font-family: Georgia, serif; font-weight: 400; } .editorial h2 { font-size: 36px; } .editorial .event-card h3 { font-size: 28px; margin: 12px 0 6px; }
	.badge { display: inline-block; width: fit-content; font-size: 10px; border-radius: 5px; background: var(--muted); color: var(--muted-foreground); padding: 5px 8px; white-space: nowrap; } .badge.open { background: var(--wash); color: var(--accent); }
	.event-card { display: flex; gap: 28px; padding: 28px; border: 1px solid var(--border); border-radius: 12px; align-items: center; }
	.date-tile { align-self: stretch; min-width: 100px; padding: 20px 14px; display: flex; flex-direction: column; align-items: center; justify-content: center; background: var(--accent); color: var(--wash); border-radius: 8px; gap: 6px; } .date-tile span { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; } .date-tile strong { font-size: 46px; font-weight: 400; font-family: Georgia, serif; line-height: 1; }
	.actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 20px; }
	.stats { display: grid; grid-template-columns: repeat(3, 1fr); margin: 24px 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); padding: 22px 0; }
	.stats > div { padding: 0 22px; border-right: 1px solid var(--border); } .stats > div:first-child { padding-left: 0; } .stats > div:last-child { border: 0; } .stats span { font-size: 11px; color: var(--muted-foreground); } .stats strong { display: block; font-size: 27px; font-weight: 550; letter-spacing: -.03em; margin-top: 6px; } .stats small { font-size: 14px; font-weight: 400; color: var(--muted-foreground); }
	.section-heading, .report-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; } .subtle { font-size: 11px; color: var(--muted-foreground); }
	.toolbar { display: flex; justify-content: space-between; gap: 12px; margin: 18px 0; flex-wrap: wrap; }
	input { width: 100%; border: 1px solid var(--border); border-radius: 7px; background: var(--background); color: var(--foreground); padding: 10px 12px; font-size: 13px; min-width: 0; } .search { flex: 1; max-width: 320px; min-width: 180px; }
	.filters { display: flex; gap: 4px; flex-wrap: wrap; } .filters button { font-size: 11px; border-color: transparent; background: transparent; } .filters .chosen { background: var(--muted); border-color: var(--border); }
	.table-scroll { overflow-x: auto; border: 1px solid var(--border); border-radius: 8px; } table { width: 100%; border-collapse: collapse; text-align: left; font-size: 12px; white-space: nowrap; } th, td { padding: 14px 16px; border-bottom: 1px solid var(--border); } thead th { font-size: 10px; font-weight: 550; color: var(--muted-foreground); background: var(--muted); } tbody th { font-weight: 500; } tbody th strong { font-weight: 550; } tbody small { display: block; font-size: 10px; color: var(--muted-foreground); margin-top: 4px; } tbody tr:last-child > * { border-bottom: 0; } td { font-variant-numeric: tabular-nums; }
	.editor-fields { display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 20px; max-width: 850px; } .editor-fields label { display: flex; flex-direction: column; gap: 8px; font-size: 12px; } .wide { grid-column: 1 / -1; }
	.schedule { display: flex; gap: 14px; flex-wrap: wrap; font-size: 11px; color: var(--muted-foreground); padding: 20px 0; }
	.legal { background: var(--muted); border-radius: 10px; padding: 20px; margin: 8px 0; } .legal p { margin: 8px 0 16px; max-width: 650px; font-size: 12px; } .legal details { margin-top: 12px; font-size: 12px; } .legal-text { max-height: 18rem; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.6; padding: 12px; margin-top: 8px; background: var(--background); border: 1px solid var(--border); border-radius: 7px; }
	.feedback { border-left: 3px solid var(--accent); padding: 9px 12px; background: var(--wash); color: var(--accent); margin-bottom: 20px; font-size: 12px; }
	.tools { font-size: 12px; padding: 18px 0 0; color: var(--muted-foreground); } summary { cursor: pointer; } .tools p { font-size: 12px; margin-top: 10px; }
	footer { border-top: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; padding: 12px 26px; gap: 12px; font-size: 10px; color: var(--muted-foreground); } .text-button { background: transparent; border: 0; font-size: 11px; padding: 4px; text-decoration: underline; text-underline-offset: 3px; }
	.board { --accent: #405ea3; --wash: #edf1fb; } .board-layout { display: grid; grid-template-columns: 250px minmax(0, 1fr); } .board .main-panel { background: var(--background); } .brief { padding: 28px 24px; border-right: 1px solid var(--border); } .brief h3 { margin-bottom: 10px; font-size: 22px; } .brief dl { margin: 26px 0 12px; } .brief dl div { margin-bottom: 20px; } dt { font-size: 10px; color: var(--muted-foreground); margin-bottom: 5px; } dd { font-size: 12px; } .coverage { display: flex; justify-content: space-between; font-size: 10px; margin-top: 28px; } progress { display: block; width: 100%; height: 5px; accent-color: var(--accent); margin: 10px 0 24px; } .stage-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; } .stage-card { padding: 20px; display: flex; flex-direction: column; align-items: start; gap: 12px; text-align: left; border-top: 3px solid var(--accent); } .stage-card strong { font-size: 18px; } .stage-card > span:not(.overline) { font-size: 11px; font-weight: 400; color: var(--muted-foreground); }
	.ledger { --accent: #755237; --wash: #f5eee8; display: grid; grid-template-columns: 150px minmax(0, 1fr); border-radius: 8px; } .ledger-rail { border-right: 1px solid var(--border); padding: 20px 12px; display: flex; flex-direction: column; gap: 24px; background: var(--muted); } .ledger nav { flex-direction: column; } .ledger nav button { text-align: left; } .ledger nav .current { background: var(--card); box-shadow: 0 1px 3px #0000000a; } .ledger .main-panel { padding: 24px; } .ledger footer { grid-column: 1 / -1; } .ledger h2 { font-size: 24px; } .ledger .stats { padding: 14px 0; margin: 18px 0; } .ledger .stats strong { font-size: 22px; font-variant-numeric: tabular-nums; } .ledger th, .ledger td { padding: 10px 12px; } .ledger .content-heading { margin-bottom: 18px; }
	.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
	@media (max-width: 1050px) { .board-layout { grid-template-columns: 200px minmax(0, 1fr); } .stage-cards { grid-template-columns: 1fr; } .stage-card { flex-direction: row; align-items: center; flex-wrap: wrap; padding: 14px; } .stage-card .overline { margin: 0; } }
	@media (max-width: 750px) { .board-layout { grid-template-columns: 1fr; } .brief { border-right: 0; border-bottom: 1px solid var(--border); padding: 20px; } .brief dl { display: flex; gap: 20px; flex-wrap: wrap; margin-top: 16px; } .brief dl div { margin-bottom: 0; } .brief .coverage, .brief progress { display: none; } .brief > .badge { margin-top: 12px; } .ledger { display: block; } .ledger-rail { border-right: 0; border-bottom: 1px solid var(--border); padding: 12px; } .ledger nav { flex-direction: row; } .ledger-rail .reset { align-self: start; } .editorial-top, .board-top { flex-wrap: wrap; padding: 12px; } .event-card { padding: 18px; gap: 16px; align-items: start; } .date-tile { min-width: 64px; padding: 18px 8px; } .date-tile strong { font-size: 32px; } .editorial .event-card h3 { font-size: 22px; } .stats strong { font-size: 20px; } .stats > div { padding: 0 10px; } .stats span { font-size: 10px; } .editor-fields { grid-template-columns: 1fr 1fr; } .editor-fields label:nth-child(3) { grid-column: 1 / -1; } footer { padding: 12px 18px; flex-wrap: wrap; } }
</style>
