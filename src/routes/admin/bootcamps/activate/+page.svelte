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

<div class="bootcamp bc-admin bc-ledger" lang={language.current}>
	<nav class="bc-ledger-nav" aria-label={messages.admin.title}>
		<Button variant="ghost" href={resolve('/admin/bootcamps')}>{messages.admin.events}</Button>
		<Button variant="secondary" href={resolve('/admin/bootcamps/activate')} aria-current="page">{messages.admin.create}</Button>
	</nav>
	<div class="bc-ledger-main">
		<header class="bc-ledger-heading">
			<h1>{messages.admin.create}</h1>
		</header>
		<FormFeedback result={form} />
		<EventEditor />
	</div>
</div>
