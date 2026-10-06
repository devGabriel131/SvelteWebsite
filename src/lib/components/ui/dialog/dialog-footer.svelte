<script lang="ts">
	import { Dialog as DialogPrimitive } from "bits-ui";
	import { Button } from "#lib/components/ui/button/index.js";
	import { cn, type WithElementRef } from "#lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		class: className,
		children,
		showCloseButton = false,
		closeLabel,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> &
		({ showCloseButton?: false; closeLabel?: string } | { showCloseButton: true; closeLabel: string }) = $props();
</script>

<div
	bind:this={ref}
	data-slot="dialog-footer"
	class={cn("bg-muted/50 -mx-4 -mb-4 rounded-b-xl border-t border-border p-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
	{...restProps}
>
	{@render children?.()}
	{#if showCloseButton}
		<DialogPrimitive.Close>
			{#snippet child({ props })}
				<Button variant="outline" {...props}>{closeLabel}</Button>
			{/snippet}
		</DialogPrimitive.Close>
	{/if}
</div>
