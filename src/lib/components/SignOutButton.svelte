<script lang="ts">
	import { resolve } from '$app/paths';
	import { authClient } from '#lib/auth-client.ts';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';

	let { redirectTo = '/' }: { redirectTo?: '/' | '/admin' } = $props();
	const language = useLanguage();
	const id = $props.id();
	let pending = $state(false);
	let error = $state<'rateLimited' | 'signOutFailed' | null>(null);

	async function signOut() {
		if (pending) return;
		pending = true;
		error = null;
		try {
			const result = await authClient.signOut();
			if (result.error) {
				error = result.error.status === 429 ? 'rateLimited' : 'signOutFailed';
				pending = false;
				return;
			}
			window.location.assign(resolve(redirectTo));
		} catch {
			error = 'signOutFailed';
			pending = false;
		}
	}
</script>

<div class="sign-out" lang={language.current}>
	<button type="button" onclick={signOut} disabled={pending} aria-busy={pending}
		aria-describedby={error ? `${id}-error` : undefined}>
		{pending ? language.messages.auth.signingOut : language.messages.auth.signOut}
	</button>
	{#if error}<p id={`${id}-error`} role="alert">{language.messages.auth.errors[error]}</p>{/if}
</div>

<style>
	.sign-out { display: grid; gap: 0.5rem; max-width: 100%; }
	button { min-height: 2.75rem; padding: 0.6rem 0.85rem; border: 1px solid var(--color-border); border-radius: 0.5rem; color: var(--color-text); background: var(--color-surface); font-size: 0.8125rem; font-weight: 700; cursor: pointer; }
	button:hover:not(:disabled) { border-color: var(--color-accent); color: var(--color-accent); }
	button:disabled { opacity: 0.6; cursor: not-allowed; }
	p { max-width: 18rem; margin: 0; color: #efbf9e; font-size: 0.8rem; overflow-wrap: anywhere; }
</style>
