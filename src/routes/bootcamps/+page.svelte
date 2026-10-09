<script lang="ts">
	import { onMount } from 'svelte';
	import FormFeedback from '#lib/bootcamp/FormFeedback.svelte';
	import StudentEvent from '#lib/bootcamp/StudentEvent.svelte';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import type { PageProps } from './$types';
	import '#lib/bootcamp/bootcamp.css';

	let { data, form }: PageProps = $props();
	let enhancedSubmission = $state(false);
	const language = useLanguage();
	const messages = $derived(language.messages.bootcamp);
	let now = $state(Date.now());
	onMount(() => {
		const refresh = () => { now = Date.now(); };
		refresh();
		const timer = setInterval(refresh, 1000);
		document.addEventListener('visibilitychange', refresh);
		return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
	});
</script>

<svelte:head>
	<title>{messages.pageTitle}</title>
	<meta name="description" content={messages.description} />
	<meta name="robots" content="noindex" />
</svelte:head>

	<div class="bootcamp" onsubmitcapture={() => enhancedSubmission = true}>
		<header class="bc-heading">
			<p class="bc-eyebrow">{messages.eyebrow}</p>
			<h1>{messages.title}</h1>
			<p class="bc-hint">{messages.introduction}</p>
		</header>
		{#if !enhancedSubmission}<FormFeedback result={form} />{/if}
		{#if !data.student}<p class="bc-notice">{messages.notLinked}</p>{/if}
		<div class="bc-stack">
			{#each data.events as event (event.id)}
				<StudentEvent {event} registration={data.registrations.find((registration) => registration.eventId === event.id)} student={data.student} paymentEnabled={data.paymentEnabled} {now} />
			{:else}<p class="bc-notice">{messages.empty}</p>{/each}
		</div>
	</div>
