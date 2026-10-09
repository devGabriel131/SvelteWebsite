<script lang="ts">
	import type { AdminStudent } from './roster';
	import AdminStudents from './AdminStudents.svelte';
	import * as Card from '#lib/components/ui/card/index.js';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	let { students }: { students: AdminStudent[] } = $props();
	const language = useLanguage();
	const messages = $derived(language.messages.admin.roster);
	const numbers = $derived(new Intl.NumberFormat(language.current));
	const metrics = $derived([
		{ label: messages.total, value: students.length },
		{ label: messages.statuses.active, value: students.filter((student) => student.status === 'active').length },
		{ label: messages.statuses.inactive, value: students.filter((student) => student.status === 'inactive').length },
		{ label: messages.statuses.invited, value: students.filter((student) => student.status === 'invited').length }
	]);
</script>
<div class="overview-content">
	<div class="metrics">
		{#each metrics as metric}<Card.Root><h2 class="panel-title">{metric.label}</h2><p class="font-mono text-3xl">{numbers.format(metric.value)}</p></Card.Root>{/each}
	</div>
	<AdminStudents {students} />
</div>
<style>
	.overview-content { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1.5rem; }
	.metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: 1rem; }
	@media (max-width: 40rem) { .metrics { grid-template-columns: 1fr; } }
</style>
