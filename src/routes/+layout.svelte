<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import DashboardHeader from '#lib/components/DashboardHeader.svelte';
	import DashboardSidebar from '#lib/components/DashboardSidebar.svelte';
	import { provideLanguage } from '#lib/i18n/language.svelte.ts';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();
	const language = provideLanguage(() => data.language);

	$effect(() => {
		document.documentElement.lang = language.current;
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<a class="skip-link" href="#main-content">{language.messages.accessibility.skipToContent}</a>

<div class="dashboard-shell">
	<DashboardHeader />
	<div class="dashboard-body">
		<DashboardSidebar />
		<main id="main-content" tabindex="-1">
			{@render children()}
		</main>
	</div>
</div>

<style>
	.dashboard-shell {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		min-height: 100dvh;
	}

	.dashboard-body {
		display: grid;
		flex: 1;
		grid-template-columns: 15rem minmax(0, 1fr);
	}

	main {
		min-width: 0;
		padding: clamp(1.5rem, 4vw, 3.5rem);
	}

	.skip-link {
		position: absolute;
		top: 1rem;
		left: 1rem;
		z-index: 1;
		padding: 0.75rem 1rem;
		border-radius: 0.5rem;
		background: var(--color-surface);
		color: var(--color-text);
		border: 1px solid var(--color-accent);
		text-decoration: none;
		transform: translateY(calc(-100% - 2rem));
	}

	.skip-link:focus {
		transform: translateY(0);
	}

	@media (max-width: 40rem) {
		.dashboard-body {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: auto 1fr;
		}
	}
</style>
