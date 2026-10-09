<script lang="ts">
	export type IconName = 'overview' | 'students' | 'payments' | 'invitations' | 'reports' | 'events' | 'arrow' | 'plus' | 'close' | 'check' | 'copy' | 'upload' | 'shield' | 'logout';
	let { name, size = 20 }: { name: IconName; size?: number } = $props();
</script>

<svg class="text-secondary" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
	{#if name === 'overview'}
		<rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
	{:else if name === 'students'}
		<circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 4v2" />
	{:else if name === 'payments'}
		<rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" />
	{:else if name === 'invitations'}
		<path d="M9 15l6-6M7 14l-2 2a4 4 0 0 0 6 6l4-4a4 4 0 0 0 0-6M17 10l2-2a4 4 0 0 0-6-6L9 6a4 4 0 0 0 0 6" />
	{:else if name === 'reports'}
		<path d="M14 2H5a1 1 0 0 0-1 1v18a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8zM14 2v6h6M8 17v-3M12 17v-6M16 17v-4" />
	{:else if name === 'events'}
		<rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2" />
	{:else if name === 'arrow'}<path d="M5 12h14M14 7l5 5-5 5" />
	{:else if name === 'plus'}<path d="M12 5v14M5 12h14" />
	{:else if name === 'close'}<path d="M6 6l12 12M18 6L6 18" />
	{:else if name === 'check'}<path d="M5 12l4 4L19 6" />
	{:else if name === 'copy'}<rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V3H3v13h5" />
	{:else if name === 'upload'}<path d="M12 16V3M7 8l5-5 5 5M3 16v5h18v-5" />
	{:else if name === 'shield'}<path d="M12 2l8 4v6c0 5-8 10-8 10S4 17 4 12V6zM8 12l3 3 5-6" />
	{:else if name === 'logout'}<path d="M9 3H3v18h6M10 12h11M17 8l4 4-4 4" />
	{/if}
</svg>

