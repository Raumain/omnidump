import { Shield, Trash2, Zap } from "lucide-react";

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
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { SavedConnection } from "@/server/connection-fns";

interface ConnectionCardProps {
	connection: SavedConnection;
	isActive: boolean;
	isDeleting: boolean;
	onSelect: (connection: SavedConnection) => void;
	onDelete: (id: number) => void;
}

export function ConnectionCard({
	connection,
	isActive,
	isDeleting,
	onSelect,
	onDelete,
}: ConnectionCardProps) {
	return (
		<div
			className={`bg-card border-2 p-5 flex flex-col justify-between h-full group transition-none ${isActive ? "border-primary shadow-hardware" : "border-border shadow-hardware dark:shadow-hardware hover:border-primary"}`}
		>
			<div>
				<div className="flex items-start justify-between border-b-2 border-border pb-3 mb-4">
					<div className="flex items-center gap-3">
						<div
							className={`w-3 h-3 ${isActive ? "bg-primary shadow-[0_0_8px_rgba(255,150,0,0.8)] animate-pulse" : "bg-destructive"}`}
						/>
						<p
							className="font-black uppercase tracking-widest text-lg truncate text-foreground"
							title={connection.name}
						>
							{connection.name}
						</p>
					</div>
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								aria-label={`Delete ${connection.name}`}
								disabled={isDeleting}
								className="rounded-none hover:bg-destructive/20 hover:text-destructive text-muted-foreground h-8 w-8 border-2 border-transparent hover:border-destructive"
							>
								<Trash2 className="w-4 h-4" />
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent className="rounded-none border-4 border-destructive bg-card shadow-hardware font-mono p-0 max-w-md">
							<AlertDialogHeader className="p-6 pb-4">
								<AlertDialogTitle className="text-2xl font-black uppercase text-destructive flex items-center gap-2">
									<Trash2 className="w-6 h-6" /> Terminate Node?
								</AlertDialogTitle>
								<AlertDialogDescription className="text-foreground font-bold uppercase tracking-widest">
									INITIATE DELETION SEQUENCE FOR NODE:{" "}
									<span className="text-destructive font-black">
										{connection.name}
									</span>
									?
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter className="p-4 border-t-2 border-destructive bg-secondary flex gap-3">
								<AlertDialogCancel className="flex-1 rounded-none border-2 border-border bg-secondary text-secondary-foreground shadow-hardware dark:shadow-hardware active:translate-x-0.5 active:translate-y-0.5 active:shadow-none font-bold uppercase transition-none">
									Cancel
								</AlertDialogCancel>
								<AlertDialogAction
									onClick={() => {
										onDelete(connection.id);
									}}
									className="flex-1 rounded-none border-2 border-destructive bg-destructive text-white shadow-hardware hover:bg-[#CC0000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none font-bold uppercase transition-none"
								>
									Execute Deletion
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</div>

				<div className="space-y-2 mb-6">
					<div className="flex items-center justify-between text-xs font-bold uppercase">
						<span className="text-muted-foreground">DRIVER</span>
						<span className="bg-secondary text-foreground px-2 py-1 border border-border">
							{connection.driver ?? "UNKNOWN"}
						</span>
					</div>
					<div className="flex items-center justify-between text-xs font-bold uppercase">
						<span className="text-muted-foreground">HOST</span>
						<span className="truncate max-w-[60%] text-foreground">
							{connection.host || "LOCALHOST"}
						</span>
					</div>
					{connection.database_name && (
						<div className="flex items-center justify-between text-xs font-bold uppercase">
							<span className="text-muted-foreground">DB</span>
							<span className="truncate max-w-[60%] text-foreground">
								{connection.database_name}
							</span>
						</div>
					)}
					{Boolean(connection.use_ssh) && (
						<div className="flex items-center justify-between text-xs font-bold uppercase">
							<span className="text-muted-foreground">SECURITY</span>
							<span className="inline-flex items-center gap-1 bg-primary text-primary-foreground px-2 py-1 border border-primary font-mono">
								<Shield className="w-3 h-3" />
								[SSH_SECURED]
							</span>
						</div>
					)}
				</div>
			</div>

			<Button
				type="button"
				onClick={() => onSelect(connection)}
				variant={isActive ? "accent" : "default"}
				className="w-full py-6 text-sm tracking-widest"
			>
				{isActive ? (
					<span className="flex items-center gap-2">
						<Zap className="w-4 h-4" /> LINK ACTIVE
					</span>
				) : (
					"ACTIVATE_LINK"
				)}
			</Button>
		</div>
	);
}
