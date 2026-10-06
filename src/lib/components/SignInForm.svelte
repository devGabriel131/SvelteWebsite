<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { adminAuthClient, authClient } from '#lib/auth-client.ts';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';

	let { audience }: { audience: 'student' | 'admin' } = $props();
	const language = useLanguage();
	const id = $props.id();
	const messages = $derived(language.messages.auth);
	const copy = $derived(messages[audience]);
	let email = $state('');
	let password = $state('');
	let ready = $state(false);
	let pending = $state(false);
	let error = $state<'invalidCredential' | 'invalidCredentials' | 'rateLimited' | 'unavailable' | null>(null);
	const credentialError = $derived(error === 'invalidCredential' || error === 'invalidCredentials');
	const errorMessage = $derived(error === 'invalidCredential' || error === 'invalidCredentials'
		? copy[error]
		: error ? messages.errors[error] : '');

	onMount(() => { ready = true; });

	async function signIn(event: SubmitEvent) {
		event.preventDefault();
		if (!ready || pending) return;
		error = null;

		// Keep PINs as strings: numeric conversion would discard leading zeros.
		if (audience === 'student' ? password.length !== 4 || !/^[0-9]{4}$/.test(password) : password.length < 8 || password.length > 128) {
			error = 'invalidCredential';
			return;
		}

		pending = true;
		try {
			const client = audience === 'admin' ? adminAuthClient : authClient;
			const result = await client.signIn.email({ email: email.trim(), password });
			if (result.error) {
				const { status, code } = result.error;
				error = status === 429 ? 'rateLimited'
					: status >= 500 ? 'unavailable'
					: status === 400 || status === 401 || status === 403 || code === 'INVALID_EMAIL_OR_PASSWORD'
						? 'invalidCredentials' : 'unavailable';
				pending = false;
				return;
			}

			password = '';
			email = '';
			// A full navigation refreshes the server-owned viewer from the session cookie.
			window.location.assign(resolve(audience === 'admin' ? '/admin' : '/'));
		} catch {
			error = 'unavailable';
			pending = false;
		}
	}
</script>

<form method="POST" onsubmit={signIn} aria-label={copy.title} aria-busy={pending} lang={language.current}>
	<div class="field">
		<Label class="font-bold" for={`${id}-email`}>{messages.email}</Label>
		<Input class="min-h-12 text-base md:text-base" id={`${id}-email`} name="email" type="email"
			autocomplete="username" autocapitalize="none" spellcheck={false} required readonly={pending} bind:value={email} />
	</div>
	<div class="field">
		<Label class="font-bold" for={`${id}-password`}>{copy.credential}</Label>
		<Input class="min-h-12 text-base md:text-base" id={`${id}-password`} name="password"
			type="password" autocomplete="current-password"
			inputmode={audience === 'student' ? 'numeric' : undefined}
			pattern={audience === 'student' ? '[0-9]{4}' : undefined}
			minlength={audience === 'student' ? 4 : 8} maxlength={audience === 'student' ? 4 : 128}
			aria-describedby={`${id}-hint${credentialError ? ` ${id}-error` : ''}`}
			aria-invalid={credentialError} required readonly={pending} bind:value={password} />
		<p class="hint" id={`${id}-hint`}>{copy.credentialHint}</p>
	</div>
	{#if error}
		<Alert.Root id={`${id}-error`} variant="destructive" class="px-4 py-[0.85rem]">
			<Alert.Description>{errorMessage}</Alert.Description>
		</Alert.Root>
	{/if}
	<Button class="min-h-12 px-4 py-3 text-base font-bold" type="submit" disabled={!ready || pending}>
		{pending ? messages.signingIn : messages.signIn}
	</Button>
	<noscript><p class="hint">{messages.javascriptRequired}</p></noscript>
</form>

<style>
	form { display: grid; gap: 1.25rem; }
	.field { display: grid; gap: 0.5rem; min-width: 0; }
	.hint { margin: 0; color: var(--muted-foreground); font-size: 0.8rem; line-height: 1.6; }
</style>
