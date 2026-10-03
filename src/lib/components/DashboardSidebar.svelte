<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
</script>

<aside class="dashboard-sidebar">
	<nav aria-label="Dashboard navigation">
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
			Dashboard
		</a>

		<div class="features-placeholder">
			<h2>Features</h2>
			<p>Your features will appear here as we build them.</p>
		</div>
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
		font-weight: 600;
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

	.features-placeholder {
		margin-top: 2rem;
		padding-inline: 1rem;
	}

	h2 {
		margin: 0 0 0.75rem;
		color: var(--color-muted);
		font-size: 0.6875rem;
		font-weight: 650;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	p {
		margin: 0;
		color: var(--color-muted);
		font-size: 0.8125rem;
		line-height: 1.7;
	}

	@media (max-width: 40rem) {
		.dashboard-sidebar {
			padding: 0.75rem 1rem;
			border-right: 0;
			border-bottom: 1px solid var(--color-border);
		}

		.features-placeholder {
			margin-top: 1rem;
			padding-bottom: 0.5rem;
		}
	}
</style>
