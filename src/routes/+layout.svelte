<script lang="ts">
	import '../app.css';

	import { page } from '$app/state';
	import { asset, resolve } from '$app/paths';
	import DashboardHeader from '#lib/components/DashboardHeader.svelte';
	import DashboardSidebar from '#lib/components/DashboardSidebar.svelte';
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

{#if page.url.pathname === resolve('/admin') || page.url.pathname.startsWith(`${resolve('/admin')}/`)}
	{@render children()}
{:else if page.route.id === '/ist' || page.route.id === '/attendance' || page.route.id === '/enroll'}
	<main id="main-content" class="home-main" tabindex="-1">
		<StudentShell activePage={page.route.id === '/ist' ? 'ist' : page.route.id === '/attendance' ? 'attendance' : 'enroll'}>
			{@render children()}
		</StudentShell>
	</main>
{:else if page.route.id === '/' || page.route.id === '/design-preview' || page.route.id === '/courses-preview' || page.route.id === '/speed-math' || page.route.id === '/frequency' || page.route.id === '/bootcamps'}
	<main id="main-content" class="home-main" tabindex="-1">
		{@render children()}
	</main>
{:else}
	<div class="dashboard-shell">
		<DashboardHeader />
		<div class="dashboard-body">
			<DashboardSidebar />
			<main id="main-content" tabindex="-1">
				{@render children()}
			</main>
		</div>
	</div>
{/if}

<style>
	.home-main {
		padding: 0;
	}

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

	@media (max-width: 40rem) {
		.dashboard-body {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: auto 1fr;
		}
	}
</style>
