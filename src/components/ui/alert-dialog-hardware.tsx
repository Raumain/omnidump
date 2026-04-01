import { AlertTriangle } from "lucide-react";
import type * as React from "react";
import { cn } from "#/lib/utils";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "./alert-dialog";

interface AlertDialogHardwareProps {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	trigger?: React.ReactNode;
	title: string;
	description: string;
	onConfirm: () => void;
	confirmText?: string;
	cancelText?: string;
	isLoading?: boolean;
	children?: React.ReactNode;
}

function AlertDialogHardware({
	open,
	onOpenChange,
	trigger,
	title,
	description,
	onConfirm,
	confirmText = "Execute",
	cancelText = "Cancel",
	isLoading = false,
	children,
}: AlertDialogHardwareProps) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			{trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
			{children}
			<AlertDialogContent className="rounded-none border-4 border-destructive bg-card shadow-hardware font-mono p-0 max-w-md">
				<AlertDialogHeader className="p-6 pb-4">
					<AlertDialogTitle className="text-2xl font-black uppercase text-destructive flex items-center gap-3">
						<AlertTriangle className="w-6 h-6" />
						{title}
					</AlertDialogTitle>
					<AlertDialogDescription className="text-muted-foreground font-bold uppercase tracking-wide text-sm mt-4">
						{description}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter className="p-4 border-t-2 border-destructive bg-secondary flex gap-3">
					<AlertDialogCancel
						className={cn(
							"flex-1 rounded-none border-2 border-border",
							"bg-card text-foreground",
							"shadow-hardware",
							"active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
							"font-bold uppercase transition-none",
						)}
					>
						{cancelText}
					</AlertDialogCancel>
					<AlertDialogAction
						onClick={onConfirm}
						disabled={isLoading}
						className={cn(
							"flex-1 rounded-none border-2 border-destructive",
							"bg-destructive text-destructive-foreground",
							"shadow-hardware",
							"hover:bg-red-600",
							"active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
							"font-bold uppercase transition-none",
							"disabled:opacity-50",
						)}
					>
						{isLoading ? "Processing..." : confirmText}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

export { AlertDialogHardware };
