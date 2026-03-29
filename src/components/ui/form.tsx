import type * as React from "react";

import { cn } from "#/lib/utils";
import { Label } from "./label";

function Form({ className, ...props }: React.ComponentProps<"form">) {
	return <form className={cn("space-y-4", className)} {...props} />;
}

function FormItem({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("space-y-2", className)} {...props} />;
}

function FormLabel({
	className,
	...props
}: React.ComponentProps<typeof Label>) {
	return <Label className={cn(className)} {...props} />;
}

function FormControl({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn(className)} {...props} />;
}

export { Form, FormItem, FormLabel, FormControl };
