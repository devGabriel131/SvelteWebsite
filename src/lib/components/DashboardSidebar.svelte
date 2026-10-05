<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';

	const language = useLanguage();
</script>

<aside class="dashboard-sidebar">
	<nav aria-label={language.messages.navigation.label}>
		<a
			class="dashboard-link"
			href={resolve('/')}
			aria-current={page.url.pathname === resolve('/') ? 'page' : undefined}
		>
			<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<rect x="3" y="3" width="7" height="7" rx="1.5" />
				<rect x="14" y="3" width="7" height="7" rx="1.5" />
				<rect x="3" y="14" width="7" height="7" rx="1.5" />
				<rect x="14" y="14" width="7" height="7" rx="1.5" />
			</svg>
			{language.messages.navigation.dashboard}
		</a>

		<div class="features">
			<h2>{language.messages.navigation.features}</h2>
			<a class="dashboard-link" href={resolve('/ist')}
				aria-current={page.url.pathname === resolve('/ist') ? 'page' : undefined}>
				<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path d="M3 12h4l3-7 4 14 3-7h4" />
				</svg>
				{language.messages.navigation.ist}
			</a>
			<a class="dashboard-link" href={resolve('/attendance')}
				aria-current={page.url.pathname === resolve('/attendance') ? 'page' : undefined}>
				<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Zm0 0v6h6M8 13h8m-8 4h5" />
				</svg>
				{language.messages.navigation.attendance}
			</a>
			<a
				class="dashboard-link"
				href={resolve('/speed-math')}
				aria-current={page.url.pathname === resolve('/speed-math') ? 'page' : undefined}
			>
				<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path d="M12 3v3m0 0a8 8 0 1 0 8 8 8 8 0 0 0-8-8Zm-3-3h6m3 4 2-2m-8 6v4l3 2" />
				</svg>
				{language.messages.navigation.speedMath}
			</a>
			<a
				class="dashboard-link"
				href={resolve('/frequency')}
				aria-current={page.route.id === '/frequency' ? 'page' : undefined}
			>
				<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<rect x="7" y="6" width="13" height="15" rx="2" />
					<path d="M16 6V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h2m4-8h5m-5 4h3" />
				</svg>
				{language.messages.navigation.frequency}
			</a>
		</div>
		{#if page.data.viewer?.role === 'admin'}
			<a class="dashboard-link admin-link" href={resolve('/admin')}>
				<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path d="M9 5 2 12l7 7M2 12h20" />
				</svg>
				{language.messages.auth.backToAdmin}
			</a>
		{/if}
	</nav>
</aside>

<style>
	.dashboard-sidebar {
		padding: 1.5rem 1rem;
		border-right: 1px solid var(--color-border);
		background: var(--color-surface);
	}

	.dashboard-link {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.8rem 1rem;
		border-radius: 0.625rem;
		color: var(--color-muted);
		font-size: 0.875rem;
		font-weight: 700;
		text-decoration: none;
	}

	.dashboard-link:hover,
	.dashboard-link[aria-current='page'] {
		background: var(--color-accent-soft);
		color: var(--color-accent);
	}

	svg {
		width: 1.125rem;
		height: 1.125rem;
		stroke: currentColor;
		stroke-width: 1.6;
	}

	.features {
		margin-top: 2rem;
	}

	.admin-link {
		margin-top: 1.5rem;
		border: 1px solid var(--color-border);
		color: var(--color-accent);
	}

	h2 {
		margin: 0 1rem 0.75rem;
		color: var(--color-accent-secondary);
		font-size: 0.6875rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}


	@media (max-width: 40rem) {
		.dashboard-sidebar {
			padding: 0.75rem 1rem;
			border-right: 0;
			border-bottom: 1px solid var(--color-border);
		}

		.features {
			margin-top: 1rem;
			padding-bottom: 0.5rem;
		}
	}
</style>
