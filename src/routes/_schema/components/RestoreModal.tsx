import { Database, Loader2 } from "lucide-react";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

interface RestoreModalProps {
	isOpen: boolean;
	dumps: string[];
	selectedDump: string | null;
	isRestoring: boolean;
	onOpenChange: (open: boolean) => void;
	onSelectDump: (dump: string) => void;
	onRestore: () => void;
}

export function RestoreModal({
	isOpen,
	dumps,
	selectedDump,
	isRestoring,
	onOpenChange,
	onSelectDump,
	onRestore,
}: RestoreModalProps) {
	return (
		<AlertDialog
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) {
					onOpenChange(false);
				}
			}}
		>
			<AlertDialogContent className="rounded-none border-4 border-primary shadow-hardware font-mono p-6 bg-card">
				<AlertDialogHeader>
					<AlertDialogTitle className="text-2xl font-black uppercase text-primary flex items-center gap-2">
						<Database className="w-6 h-6" /> Restore Dump
					</AlertDialogTitle>
					<AlertDialogDescription className="text-muted-foreground font-bold">
						Select a SQL dump file to restore into the database.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<div className="mt-4">
					<Select
						value={selectedDump ?? ""}
						onValueChange={(value) => onSelectDump(value)}
					>
						<SelectTrigger className="w-full rounded-none border-2 border-border shadow-hardware bg-card text-foreground font-bold uppercase disabled:opacity-50">
							<SelectValue placeholder="Select a dump file" />
						</SelectTrigger>
						<SelectContent className="rounded-none border-2 border-primary shadow-hardware font-mono bg-card">
							{dumps.map((dump) => (
								<SelectItem
									key={dump}
									value={dump}
									className="font-bold rounded-none focus:bg-primary focus:text-primary-foreground cursor-pointer"
								>
									{dump}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<AlertDialogFooter className="mt-6">
					<AlertDialogCancel className="rounded-none border-2 border-border bg-secondary hover:bg-muted active:translate-x-0.5 active:translate-y-0.5 active:shadow-none font-bold uppercase text-foreground">
						Cancel
					</AlertDialogCancel>
					<AlertDialogAction
						onClick={onRestore}
						disabled={!selectedDump || isRestoring}
						className="rounded-none border-2 border-primary shadow-hardware active:translate-x-0.5 active:translate-y-0.5 active:shadow-none font-bold uppercase bg-primary text-primary-foreground hover:bg-primary/90"
					>
						{isRestoring ? (
							<Loader2 className="animate-spin w-4 h-4 mr-2" />
						) : null}
						{isRestoring ? "Restoring..." : "Execute Restore"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
