<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '#lib/components/ui/button/index.js';
	import EventEditor from '#lib/bootcamp/EventEditor.svelte';
	import FormFeedback from '#lib/bootcamp/FormFeedback.svelte';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import { formatMessage } from '#lib/i18n/translations.ts';
	import type { PageProps } from './$types';
	import '#lib/bootcamp/bootcamp.css';

	let { data, form }: PageProps = $props();
	let enhancedSubmission = $state(false);
	const language = useLanguage();
	const messages = $derived(language.messages.bootcamp);
</script>

<svelte:head>
	<title>{formatMessage(messages.admin.editPageTitle, { title: data.event.title })}</title>
	<meta name="description" content={messages.admin.editDescription} />
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="bootcamp bc-ledger" onsubmitcapture={() => enhancedSubmission = true}>
	<nav class="bc-ledger-nav" aria-label={messages.admin.title}>
		<Button variant="ghost" href={resolve('/admin/bootcamps')}>{messages.admin.events}</Button>
		<Button variant="secondary" href={resolve('/admin/bootcamps/[eventId]/edit', { eventId: data.event.id })} aria-current="page">{messages.admin.edit}</Button>
		<Button variant="ghost" href={resolve('/admin/bootcamps/[eventId]/report', { eventId: data.event.id })}>{messages.admin.report}</Button>
	</nav>
	<div class="bc-ledger-main">
		<header class="bc-ledger-heading">
			<h1>{formatMessage(messages.admin.editing, { title: data.event.title })}</h1>
		</header>
		{#if !enhancedSubmission}<FormFeedback result={form} />{/if}
		<EventEditor event={data.event} />
	</div>
</div>
