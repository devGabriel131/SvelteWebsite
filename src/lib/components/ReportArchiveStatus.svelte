<script lang="ts">
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';

	let { state }: { state: 'notice' | 'saved' | 'signIn' | 'unavailable' } = $props();
	const language = useLanguage();
	const failed = $derived(state === 'signIn' || state === 'unavailable');
</script>

<Alert.Root variant={failed ? 'destructive' : 'default'} role={failed ? 'alert' : 'status'} class="mb-4">
	<Alert.Description>{language.messages.reportArchive[state]}</Alert.Description>
	{#if state === 'signIn'}
		<Button href="/login" variant="outline" class="mt-2">{language.messages.auth.signIn}</Button>
	{/if}
</Alert.Root>
