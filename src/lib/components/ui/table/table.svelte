<script lang="ts">
	import { cn, type WithElementRef } from "#lib/utils.js";
	import type { HTMLAttributes, HTMLTableAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		class: className,
		children,
		containerProps = {},
		...restProps
	}: WithElementRef<HTMLTableAttributes> & {
		containerProps?: HTMLAttributes<HTMLDivElement>;
	} = $props();

	let { class: containerClass, ...containerRestProps } = $derived(containerProps);
</script>

<div
	{...containerRestProps}
	data-slot="table-container"
	class={cn("relative w-full overflow-x-auto", containerClass)}
>
	<table bind:this={ref} data-slot="table" class={cn("w-full caption-bottom text-sm text-foreground", className)} {...restProps}>
		{@render children?.()}
	</table>
</div>
