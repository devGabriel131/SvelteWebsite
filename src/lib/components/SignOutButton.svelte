<script lang="ts">
	import { resolve } from '$app/paths';
	import { authClient } from '#lib/auth-client.ts';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
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

<div class="sign-out">
	<Button variant="outline" class="px-[0.85rem] py-[0.6rem] text-[0.8125rem] font-bold"
		type="button" onclick={signOut} disabled={pending} aria-busy={pending}
		aria-describedby={error ? `${id}-error` : undefined}>
		{pending ? language.messages.auth.signingOut : language.messages.auth.signOut}
	</Button>
	{#if error}
		<Alert.Root id={`${id}-error`} variant="destructive" class="max-w-[18rem]">
			<Alert.Description class="text-[0.8rem] [overflow-wrap:anywhere]">
				{language.messages.auth.errors[error]}
			</Alert.Description>
		</Alert.Root>
	{/if}
</div>

<style>
	.sign-out { display: grid; gap: 0.5rem; max-width: 100%; }
</style>
