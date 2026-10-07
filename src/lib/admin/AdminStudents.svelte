<script lang="ts">
	import { page } from '$app/state';
		import StudentEditor from './StudentEditor.svelte';
		import { filterStudents, subjects, type AdminStudent, type StudentStatus } from './roster';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	let { students }: { students: AdminStudent[] } = $props();
	const language = useLanguage();
	const messages = $derived(language.messages.admin.roster);
	const id = $props.id();
	let query = $state('');
	let status = $state<StudentStatus | 'all'>('all');
	const visible = $derived(filterStudents(students, query, status));
	const numbers = $derived(new Intl.NumberFormat(language.current));
</script>

<section aria-labelledby={`${id}-title`}>
	<Card.Root class="gap-0 p-0">
		<div class="panel-heading">
			<div><h2 class="panel-title" id={`${id}-title`}>{messages.title}</h2><p class="panel-subtitle">{messages.readOnly}</p></div>
		</div>
		<div class="filters">
			<div class="search"><Label for={`${id}-search`}>{messages.searchLabel}</Label><Input id={`${id}-search`} type="search" bind:value={query} placeholder={messages.search} /></div>
			<div role="group" aria-label={messages.filterLabel} class="choices">
				{#each ['all', 'active', 'inactive', 'invited'] as option}
					<Button variant="outline" type="button" aria-pressed={status === option} onclick={() => status = option as typeof status}>{messages.statuses[option as keyof typeof messages.statuses]}</Button>
				{/each}
			</div>
			<p role="status">{messages.count.replace('{count}', numbers.format(visible.length))}</p>
		</div>
		{#if page.form?.studentEdit?.success}<p role="status" class="fixture-note">{messages.edit.success}</p>{/if}
				<p class="fixture-note" id={`${id}-fixture`}>{messages.fixtureNote}</p>
		<Table.Root class="min-w-[760px] text-left" containerProps={{ role: 'region', 'aria-labelledby': `${id}-title`, tabindex: 0, class: 'overflow-x-auto focus-visible:outline-2 focus-visible:outline-primary' }}>
			<Table.Caption class="sr-only">{messages.title} — {messages.fixtureNote}</Table.Caption>
			<Table.Header><Table.Row>
				<Table.Head scope="col">{messages.student}</Table.Head>
				<Table.Head scope="col">{messages.classType}</Table.Head>
				<Table.Head scope="col">{messages.status}</Table.Head>
				{#each subjects as subject}<Table.Head scope="col" class="text-right" title={messages.subjects[subject]} aria-label={messages.subjects[subject]}>{messages.abbreviations[subject]}</Table.Head>{/each}
			</Table.Row></Table.Header>
			<Table.Body>
				{#each visible as student (student.id)}
					<Table.Row>
						<Table.Head scope="row"><span class="name">{student.name}</span><span class="email">{student.email}</span></Table.Head>
						<Table.Cell>{messages.classes[student.classType]}</Table.Cell>
						<Table.Cell>{messages.statuses[student.status]}</Table.Cell>
						{#each subjects as subject}<Table.Cell class="text-right font-mono" aria-describedby={student.subjectScores?.isFixture ? `${id}-fixture` : undefined}>{#if student.subjectScores}{numbers.format(student.subjectScores[subject])}{:else}<span aria-label={messages.noScore}>{language.messages.admin.common.notAvailable}</span>{/if}</Table.Cell>{/each}
					</Table.Row>
					<Table.Row><Table.Cell colspan={7}><StudentEditor {student} /></Table.Cell></Table.Row>
				{:else}<Table.Row><Table.Cell colspan={7}>{messages.empty}</Table.Cell></Table.Row>{/each}
			</Table.Body>
		</Table.Root>
	</Card.Root>
</section>

<style>
	.filters { display: flex; flex-wrap: wrap; align-items: end; gap: 1rem; padding: 1.25rem; }
	.search { display: grid; gap: 0.5rem; flex: 1 1 16rem; }
	.choices { display: flex; flex-wrap: wrap; gap: 0.4rem; }
	.fixture-note { margin: 0; padding: 0 1.25rem 1.25rem; color: var(--muted-foreground); font-size: 0.8rem; line-height: 1.6; }
	.name, .email { display: block; }
	.email { color: var(--muted-foreground); font-weight: normal; font-size: 0.75rem; margin-top: 0.3rem; }
</style>
