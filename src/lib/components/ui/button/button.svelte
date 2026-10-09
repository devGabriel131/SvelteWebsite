<script lang="ts" module>
	import { type VariantProps, tv } from "tailwind-variants";
	import { cn, type WithElementRef } from "#lib/utils.js";
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from "svelte/elements";

	export const buttonVariants = tv({
		base: "focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/50 has-[input[aria-invalid=true]]:border-destructive has-[input[aria-invalid=true]]:ring-3 has-[input[aria-invalid=true]]:ring-destructive/20 rounded-lg border border-transparent bg-clip-padding text-sm font-medium focus-visible:ring-3 aria-invalid:ring-3 active:not-aria-[haspopup]:translate-y-px [&_svg:not([class*='size-'])]:size-4 group/button inline-flex min-h-11 h-auto shrink-0 items-center justify-center whitespace-normal text-center transition-all motion-reduce:transition-none motion-reduce:animate-none outline-none select-none disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 has-[input:disabled]:pointer-events-none has-[input:disabled]:opacity-50 has-[input:checked]:border-primary has-[input:checked]:bg-accent has-[input:checked]:text-primary has-[input:checked]:[&_svg]:text-primary aria-pressed:border-primary aria-pressed:bg-accent aria-pressed:text-primary aria-pressed:[&_svg]:text-primary [&_svg]:pointer-events-none [&_svg]:shrink-0",
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground hover:bg-primary/80 [&_svg]:text-primary-foreground",
				outline: "border-border bg-background hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent aria-expanded:text-accent-foreground [&_svg]:text-secondary hover:[&_svg]:text-primary aria-expanded:[&_svg]:text-primary aria-[current=page]:[&_svg]:text-primary data-[state=checked]:[&_svg]:text-primary",
				secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground [&_svg]:text-secondary-foreground",
				ghost: "hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent aria-expanded:text-accent-foreground aria-[current=page]:bg-accent aria-[current=page]:text-primary aria-[current=true]:bg-accent aria-[current=true]:text-primary aria-selected:bg-accent aria-selected:text-primary [&_svg]:text-secondary hover:[&_svg]:text-primary aria-expanded:[&_svg]:text-primary aria-[current=page]:[&_svg]:text-primary aria-[current=true]:[&_svg]:text-primary aria-selected:[&_svg]:text-primary data-[state=checked]:[&_svg]:text-primary",
			},
			size: {
				default: "gap-1.5 px-2.5 py-2 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
				sm: "gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 py-1.5 text-[0.8rem] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
				"icon-sm": "w-11 rounded-[min(var(--radius-md),12px)]",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	});

	export type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
	export type ButtonSize = VariantProps<typeof buttonVariants>["size"];

	export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
		WithElementRef<HTMLAnchorAttributes> & {
			variant?: ButtonVariant;
			size?: ButtonSize;
		};
</script>

<script lang="ts">
	let {
		class: className,
		variant = "default",
		size = "default",
		ref = $bindable(null),
		href = undefined,
		type = "button",
		disabled,
		children,
		...restProps
	}: ButtonProps = $props();
</script>

{#if href}
	<a
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		href={disabled ? undefined : href}
		aria-disabled={disabled}
		role={disabled ? "link" : undefined}
		tabindex={disabled ? -1 : undefined}
		{...restProps}
	>
		{@render children?.()}
	</a>
{:else}
	<button
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		{type}
		{disabled}
		{...restProps}
	>
		{@render children?.()}
	</button>
{/if}
