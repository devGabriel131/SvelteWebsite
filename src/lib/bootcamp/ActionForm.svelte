<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { Snippet } from 'svelte';
	import FormFeedback from './FormFeedback.svelte';

	let {
		action, children, formElement = $bindable(), pending = $bindable(false), beforeSubmit,
		onSuccess, onFailure, successMessage, updatePageForm = true
	}: {
		action: string;
		children: Snippet<[boolean]>;
		formElement?: HTMLFormElement;
		pending?: boolean;
		updatePageForm?: boolean;
		beforeSubmit?: (data: FormData) => boolean;
		onSuccess?: () => void;
		onFailure?: () => void;
		successMessage?: string;
	} = $props();

	let result = $state<{ error?: string; success?: boolean } | null>(null);
</script>

<form method="POST" {action} bind:this={formElement} aria-busy={pending}
	use:enhance={({ formData, cancel }) => {
		if (pending || (beforeSubmit && !beforeSubmit(formData))) {
			cancel();
			return;
		}
		pending = true;
		result = null;
		return async ({ result: response, update }) => {
			try {
				if (response.type === 'error') {
					result = { error: 'unavailable' };
					onFailure?.();
					return;
				}
				if (response.type === 'success' || response.type === 'failure') {
					const data = response.data;
					const success = response.type === 'success' && data?.success === true && !data.error;
					result = {
						error: typeof data?.error === 'string' ? data.error : success ? undefined : 'unavailable',
						success
					};
				}
				// Refresh authoritative registration and report data; never advance optimistically.
				if (updatePageForm || response.type === 'redirect') await update({ reset: false });
				else if (result?.success) await invalidateAll();
				if (result?.success) onSuccess?.();
				else if (result?.error) onFailure?.();
			} catch {
				result = { error: 'unavailable' };
				onFailure?.();
			} finally {
				pending = false;
			}
		};
	}}>
	{@render children(pending)}
	<FormFeedback {result} {successMessage} />
</form>
