<script lang="ts">
	import { enhance } from '$app/forms';
	import { refreshAll } from '$app/navigation';
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import FormFeedback from './FormFeedback.svelte';

	let {
		action, children, formElement = $bindable(), pending = $bindable(false), beforeSubmit,
		onSuccess, onFailure, successMessage
	}: {
		action: string;
		children: Snippet<[boolean]>;
		formElement?: HTMLFormElement;
		pending?: boolean;
		beforeSubmit?: (data: FormData) => boolean;
		onSuccess?: () => void;
		onFailure?: () => void;
		successMessage?: string;
	} = $props();

	let result = $state<{ error?: string; success?: boolean } | null>(null);

	function unavailable() {
		result = { error: 'unavailable' };
		onFailure?.();
	}
</script>

<form method="POST" {action} bind:this={formElement} aria-busy={pending}
	use:enhance={({ formData, cancel }) => {
		if (pending) {
			cancel();
			return;
		}
		try {
			if (beforeSubmit && !beforeSubmit(formData)) {
				cancel();
				return;
			}
		} catch {
			cancel();
			unavailable();
			return;
		}
		pending = true;
		result = null;
		return async ({ result: response, update }) => {
			try {
				if (response.type === 'redirect') {
					await update({ reset: false });
					return;
				}
				if (response.type === 'error') {
					unavailable();
					return;
				}
				const data = response.data;
				const success = response.type === 'success' && data?.success === true && !data.error;
				if (!success) {
					result = { error: typeof data?.error === 'string' ? data.error : 'unavailable' };
					onFailure?.();
					return;
				}
				// Refresh authoritative registration and report data before advancing.
				await refreshAll();
				// Kit also resolves refreshAll after rendering a failed load.
				if (page.error) {
					unavailable();
					return;
				}
				result = { success: true };
				onSuccess?.();
			} catch {
				unavailable();
			} finally {
				pending = false;
			}
		};
	}}>
	{@render children(pending)}
	<FormFeedback {result} {successMessage} />
</form>
