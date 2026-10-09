<script lang="ts">
	import '../app.css';

	import { page } from '$app/state';
	import { asset } from '$app/paths';
	import StudentShell from '#lib/components/StudentShell.svelte';
	import { provideLanguage } from '#lib/i18n/language.svelte.ts';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();
	const language = provideLanguage(() => data.language);

	$effect(() => {
		document.documentElement.lang = language.current;
	});
</script>

<svelte:head>
	<link rel="icon" type="image/png" href={asset('logo.png')} />
</svelte:head>

<a class="skip-link" href="#main-content">{language.messages.accessibility.skipToContent}</a>

{#if page.route.id === '/admin' || page.route.id?.startsWith('/admin/')}
	{@render children()}
{:else}
	<StudentShell>
		{@render children()}
	</StudentShell>
{/if}

<style>

	.skip-link {
		position: absolute;
		top: 1rem;
		left: 1rem;
		z-index: 100;
		padding: 0.75rem 1rem;
		border-radius: 0.5rem;
		background: var(--card);
		color: var(--foreground);
		border: 1px solid var(--primary);
		text-decoration: none;
		transform: translateY(calc(-100% - 2rem));
	}

	.skip-link:focus {
		transform: translateY(0);
	}

</style>
