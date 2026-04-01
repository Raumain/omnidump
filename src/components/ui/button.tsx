import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "#/lib/utils";

const buttonVariants = cva(
	"group/button inline-flex shrink-0 items-center justify-center rounded-none border-2 font-bold font-mono uppercase tracking-wide whitespace-nowrap outline-none select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	{
		variants: {
			variant: {
				default:
					"border-border bg-card text-foreground shadow-hardware hover:bg-secondary active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-none",
				accent:
					"border-primary bg-primary text-primary-foreground shadow-hardware hover:bg-orange-600 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-none",
				info: "border-accent bg-accent text-accent-foreground shadow-hardware hover:bg-blue-600 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-none",
				destructive:
					"border-destructive bg-destructive text-destructive-foreground shadow-hardware hover:bg-red-600 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-none",
				outline:
					"border-border bg-transparent text-foreground hover:bg-secondary hover:text-primary active:translate-x-[2px] active:translate-y-[2px] transition-none",
				ghost:
					"border-transparent hover:bg-secondary hover:text-primary transition-none",
				link: "border-transparent text-primary underline-offset-4 hover:underline",
			},
			size: {
				default: "h-10 gap-2 px-4 text-sm",
				xs: "h-7 gap-1 px-2 text-xs",
				sm: "h-8 gap-1.5 px-3 text-xs",
				lg: "h-12 gap-2 px-6 text-base",
				xl: "h-14 gap-3 px-8 text-lg",
				icon: "size-10",
				"icon-xs": "size-7",
				"icon-sm": "size-8",
				"icon-lg": "size-12",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

function Button({
	className,
	variant = "default",
	size = "default",
	asChild = false,
	...props
}: React.ComponentProps<"button"> &
	VariantProps<typeof buttonVariants> & {
		asChild?: boolean;
	}) {
	const Comp = asChild ? Slot.Root : "button";

	return (
		<Comp
			data-slot="button"
			data-variant={variant}
			data-size={size}
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	);
}

export { Button, buttonVariants };
