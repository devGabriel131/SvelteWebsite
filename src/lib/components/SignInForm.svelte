<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { adminAuthClient, authClient } from '#lib/auth-client.ts';
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
		<label for={`${id}-email`}>{messages.email}</label>
		<input id={`${id}-email`} name="email" type="email" autocomplete="username" autocapitalize="none"
			spellcheck={false} required readonly={pending} bind:value={email} />
	</div>
	<div class="field">
		<label for={`${id}-password`}>{copy.credential}</label>
		<input id={`${id}-password`} name="password" type="password" autocomplete="current-password"
			inputmode={audience === 'student' ? 'numeric' : undefined}
			pattern={audience === 'student' ? '[0-9]{4}' : undefined}
			minlength={audience === 'student' ? 4 : 8} maxlength={audience === 'student' ? 4 : 128}
			aria-describedby={`${id}-hint${credentialError ? ` ${id}-error` : ''}`}
			aria-invalid={credentialError} required readonly={pending} bind:value={password} />
		<p class="hint" id={`${id}-hint`}>{copy.credentialHint}</p>
	</div>
	{#if error}<p class="error" id={`${id}-error`} role="alert">{errorMessage}</p>{/if}
	<button type="submit" disabled={!ready || pending}>{pending ? messages.signingIn : messages.signIn}</button>
	<noscript><p class="hint">{messages.javascriptRequired}</p></noscript>
</form>

<style>
	form { display: grid; gap: 1.25rem; }
	.field { display: grid; gap: 0.5rem; min-width: 0; }
	label { font-size: 0.875rem; font-weight: 700; }
	input { width: 100%; min-width: 0; min-height: 3rem; padding: 0.7rem 0.85rem; border: 1px solid var(--color-border); border-radius: 0.5rem; background: var(--color-background); color: var(--color-text); }
	input[aria-invalid='true'] { border-color: #efbf9e; }
	.hint { margin: 0; color: var(--color-muted); font-size: 0.8rem; line-height: 1.6; }
	.error { margin: 0; padding: 0.85rem 1rem; border: 1px solid #8e6545; border-radius: 0.5rem; background: #33261e; color: #efbf9e; font-size: 0.875rem; }
	button { min-height: 3rem; padding: 0.75rem 1rem; border: 1px solid var(--color-accent); border-radius: 0.5rem; background: var(--color-accent); color: var(--color-background); font-weight: 700; cursor: pointer; }
	button:hover:not(:disabled) { background: var(--brand-cream); }
	button:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
