<script lang="ts">
	import { resolve } from '$app/paths';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';

	const language = useLanguage();
</script>

<svelte:head>
	<title>{language.messages.home.pageTitle}</title>
	<meta name="description" content={language.messages.home.description} />
</svelte:head>

<div class="dashboard-home">
	<p class="eyebrow">{language.messages.home.eyebrow}</p>
	<h1>{language.messages.home.title}</h1>
	<p class="introduction">{language.messages.home.introduction}</p>

	<section class="feature-card" aria-labelledby="feature-title">
		<span class="placeholder-icon" aria-hidden="true">
			<svg viewBox="0 0 24 24" fill="none">
				<path d="M3 12h4l3-7 4 14 3-7h4" />
			</svg>
		</span>
		<h2 id="feature-title">{language.messages.home.emptyTitle}</h2>
		<p>{language.messages.home.emptyDescription}</p>
		<a href={resolve('/ist')}>{language.messages.home.openIst}</a>
	</section>
</div>

<style>
	.dashboard-home {
		max-width: 70rem;
		margin-inline: auto;
	}

	.eyebrow {
		margin: 0 0 0.5rem;
		color: var(--color-accent);
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(1.5rem, 3vw, 2.25rem);
		font-weight: 700;
		letter-spacing: -0.02em;
		text-transform: uppercase;
		overflow-wrap: anywhere;
		line-height: 1.2;
	}

	.introduction {
		margin: 0.75rem 0 0;
		color: var(--color-muted);
		font-size: 0.9375rem;
	}

	.feature-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 20rem;
		margin-top: 2rem;
		padding: 2rem;
		border: 1px solid var(--color-border);
		border-radius: 1rem;
		background: var(--color-surface);
		text-align: center;
	}

	.placeholder-icon {
		display: grid;
		place-items: center;
		width: 3rem;
		height: 3rem;
		margin-bottom: 1.25rem;
		border-radius: 0.875rem;
		background: var(--color-background);
		color: var(--color-accent);
	}

	svg {
		width: 1.5rem;
		height: 1.5rem;
		stroke: currentColor;
		stroke-width: 1.5;
		stroke-linecap: round;
	}

	h2 {
		margin: 0;
		font-size: 1rem;
		font-weight: 700;
	}

	.feature-card p {
		max-width: 25rem;
		margin: 0.5rem 0 0;
		color: var(--color-muted);
		font-size: 0.875rem;
		line-height: 1.75;
	}

	.feature-card a {
		margin-top: 1.25rem;
		padding: 0.7rem 1rem;
		border: 1px solid var(--color-accent);
		border-radius: 0.5rem;
		background: var(--color-accent-soft);
		color: var(--color-accent);
		font-size: 0.875rem;
		font-weight: 700;
		text-decoration: none;
	}
</style>
