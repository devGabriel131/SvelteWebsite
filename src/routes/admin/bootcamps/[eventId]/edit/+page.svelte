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
	const language = useLanguage();
	const messages = $derived(language.messages.bootcamp);
</script>

<svelte:head>
	<title>{formatMessage(messages.admin.editPageTitle, { title: data.event.title })}</title>
	<meta name="description" content={messages.admin.editDescription} />
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="bootcamp bc-admin" lang={language.current}>
	<header class="bc-heading">
		<div class="bc-actions">
			<Button variant="outline" href={resolve('/admin/bootcamps')}>{messages.admin.backToEvents}</Button>
			<Button variant="outline" href={resolve('/admin/bootcamps/[eventId]/report', { eventId: data.event.id })}>{messages.admin.report}</Button>
		</div>
		<h1>{formatMessage(messages.admin.editing, { title: data.event.title })}</h1>
	</header>
	<FormFeedback result={form} />
	{#key `${data.event.id}:${data.event.revision}`}
		<EventEditor event={data.event} />
	{/key}
</div>
