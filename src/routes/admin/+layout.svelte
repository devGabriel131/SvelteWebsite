<script lang="ts">
	import AdminShell from '#lib/admin/AdminShell.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
</script>

{#if data.viewer?.role === 'admin'}
	<AdminShell>
		{@render children()}
	</AdminShell>
{:else}
	<main id="main-content" tabindex="-1">
		{@render children()}
	</main>
{/if}

<style>
	main { min-width: 0; padding: 0; }
</style>
