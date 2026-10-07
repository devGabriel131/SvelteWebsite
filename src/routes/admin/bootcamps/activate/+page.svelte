<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '#lib/components/ui/button/index.js';
	import EventEditor from '#lib/bootcamp/EventEditor.svelte';
	import FormFeedback from '#lib/bootcamp/FormFeedback.svelte';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import type { PageProps } from './$types';
	import '#lib/bootcamp/bootcamp.css';

	let { form }: PageProps = $props();
	const language = useLanguage();
	const messages = $derived(language.messages.bootcamp);
</script>

<svelte:head>
	<title>{messages.admin.activatePageTitle}</title>
	<meta name="description" content={messages.admin.activateDescription} />
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="bootcamp bc-admin" lang={language.current}>
	<header class="bc-heading">
		<div><Button variant="outline" href={resolve('/admin/bootcamps')}>{messages.admin.backToEvents}</Button></div>
		<h1>{messages.admin.create}</h1>
	</header>
	<FormFeedback result={form} />
	<EventEditor />
</div>
