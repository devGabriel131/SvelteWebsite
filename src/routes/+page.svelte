<script lang="ts">
	import StudentHome from '#lib/components/StudentHome.svelte';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';

	const language = useLanguage();
</script>

<svelte:head>
	<title>{language.messages.home.pageTitle}</title>
	<meta name="description" content={language.messages.home.description} />
</svelte:head>

<StudentHome />
