<script lang="ts">
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	let { result, successMessage }: { result?: { error?: string; success?: boolean } | null; successMessage?: string } = $props();
	const language = useLanguage();
	const messages = $derived(language.messages.bootcamp);
	const error = $derived(result?.error
		? messages.errors[Object.hasOwn(messages.errors, result.error) ? result.error as keyof typeof messages.errors : 'unavailable']
		: null);
</script>

{#if error}<p class="bc-notice bc-error" role="alert">{error}</p>
{:else if result?.success}<p class="bc-notice" role="status">{successMessage ?? messages.common.success}</p>{/if}
