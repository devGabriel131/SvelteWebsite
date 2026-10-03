<script lang="ts">
	import { asset, resolve } from '$app/paths';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import LanguageSelector from './LanguageSelector.svelte';

	const language = useLanguage();
</script>

<header class="dashboard-header" lang={language.current}>
	<a class="brand" href={resolve('/')}>
		<img class="brand-logo" src={asset('logo.png')} alt="" width="56" height="56" />
		<span class="brand-text">
			<span class="brand-name">{language.messages.header.brand}</span>
			<span class="brand-description">{language.messages.header.brandDescription}</span>
		</span>
	</a>

	<div class="header-controls">
		<LanguageSelector />
		<div class="student" role="group" aria-label={language.messages.header.studentLabel}>
			<div class="student-details">
				<span class="student-name">{language.messages.header.studentName}</span>
				<span class="student-description">{language.messages.header.studentDescription}</span>
			</div>
			<span class="avatar-placeholder" aria-hidden="true">
				<svg viewBox="0 0 24 24" fill="none">
					<circle cx="12" cy="8" r="3" />
					<path d="M5 20v-2a7 7 0 0 1 14 0v2" />
				</svg>
			</span>
		</div>
	</div>
</header>

<style>
	.dashboard-header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 1.5rem;
		min-height: 5.5rem;
		padding: 1rem 2rem;
		border-bottom: 1px solid var(--color-border);
		background: var(--color-surface);
	}

	.header-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
		gap: 1rem;
		min-width: 0;
		max-width: 100%;
		margin-left: auto;
	}

	.student {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-width: 0;
		max-width: 100%;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-width: 0;
		max-width: 100%;
		border-radius: 0.375rem;
		color: inherit;
		text-decoration: none;
	}

	.brand:hover .brand-name {
		color: var(--color-accent);
	}

	.brand-logo {
		flex-shrink: 0;
		width: 3.5rem;
		height: 3.5rem;
		object-fit: contain;
	}

	.brand-text {
		display: grid;
		gap: 0.3rem;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.brand-name {
		font-family: var(--font-display);
		font-size: clamp(0.7rem, 2vw, 1rem);
		font-weight: 700;
		letter-spacing: -0.02em;
		text-transform: uppercase;
	}

	.brand-description {
		color: var(--color-muted);
		font-size: 0.625rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	.avatar-placeholder {
		display: grid;
		flex-shrink: 0;
		place-items: center;
		width: 2.75rem;
		height: 2.75rem;
		border: 1px solid var(--color-border);
		border-radius: 50%;
		background: var(--color-background);
		color: var(--color-accent-secondary);
	}

	svg {
		width: 1.4rem;
		height: 1.4rem;
		stroke: currentColor;
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.student-details {
		display: grid;
		gap: 0.15rem;
		min-width: 0;
		text-align: right;
		overflow-wrap: anywhere;
	}

	.student-name {
		font-size: 0.875rem;
		font-weight: 700;
	}

	.student-description {
		font-size: 0.75rem;
		color: var(--color-muted);
	}

	@media (max-width: 40rem) {
		.dashboard-header {
			gap: 1rem;
			padding: 1rem;
		}

		.header-controls,
		.student {
			gap: 0.5rem;
		}

		.avatar-placeholder {
			display: none;
		}
	}
</style>
