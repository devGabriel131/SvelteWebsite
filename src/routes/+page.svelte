<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
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
		<Card.Root class="min-h-80 items-center justify-center gap-0 rounded-2xl p-8 text-center">
			<span class="placeholder-icon" aria-hidden="true">
				<svg viewBox="0 0 24 24" fill="none">
					<path d="M3 12h4l3-7 4 14 3-7h4" />
				</svg>
			</span>
			<h2 id="feature-title">{language.messages.home.emptyTitle}</h2>
			<p>{language.messages.home.emptyDescription}</p>
			<Button href={resolve('/ist')} class="mt-5 px-4 py-[0.7rem] font-bold">
				{language.messages.home.openIst}
			</Button>
		</Card.Root>
	</section>

	<section class="feature-card" aria-labelledby="attendance-title">
		<Card.Root class="min-h-80 items-center justify-center gap-0 rounded-2xl p-8 text-center">
			<span class="placeholder-icon" aria-hidden="true">
				<svg viewBox="0 0 24 24" fill="none">
					<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Zm0 0v6h6M8 13h8m-8 4h5" />
				</svg>
			</span>
			<h2 id="attendance-title">{language.messages.attendance.title}</h2>
			<p>{language.messages.attendance.cardDescription}</p>
			<Button href={resolve('/attendance')} class="mt-5 px-4 py-[0.7rem] font-bold">
				{language.messages.attendance.open}
			</Button>
		</Card.Root>
	</section>

	<section class="feature-card" aria-labelledby="speed-math-title">
		<Card.Root class="min-h-80 items-center justify-center gap-0 rounded-2xl p-8 text-center">
			<span class="placeholder-icon" aria-hidden="true">
				<svg viewBox="0 0 24 24" fill="none">
					<path d="M12 3v3m0 0a8 8 0 1 0 8 8 8 8 0 0 0-8-8Zm-3-3h6m3 4 2-2m-8 6v4l3 2" />
				</svg>
			</span>
			<h2 id="speed-math-title">{language.messages.speedMath.title}</h2>
			<p>{language.messages.speedMath.cardDescription}</p>
			<Button href={resolve('/speed-math')} class="mt-5 px-4 py-[0.7rem] font-bold">
				{language.messages.speedMath.open}
			</Button>
		</Card.Root>
	</section>
</div>

<style>
	.dashboard-home {
		max-width: 70rem;
		margin-inline: auto;
	}

	.eyebrow {
		margin: 0 0 0.5rem;
		color: var(--primary);
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
		color: var(--muted-foreground);
		font-size: 0.9375rem;
	}

	.feature-card {
		margin-top: 2rem;
	}

	.placeholder-icon {
		display: grid;
		place-items: center;
		width: 3rem;
		height: 3rem;
		margin-bottom: 1.25rem;
		border-radius: 0.875rem;
		background: var(--background);
	}

	svg {
		width: 1.5rem;
		height: 1.5rem;
		stroke: var(--primary);
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
		color: var(--muted-foreground);
		font-size: 0.875rem;
		line-height: 1.75;
	}

</style>
