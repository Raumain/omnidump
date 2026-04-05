import {
	Database,
	Download,
	Loader2,
	RefreshCw,
	Trash2,
	Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
	Drawer,
	DrawerBody,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import type { DumpFileInfo } from "@/server/schema-fns";

interface DumpsDrawerProps {
	isOpen: boolean;
	dumps: DumpFileInfo[];
	isLoading: boolean;
	isRestoring: boolean;
	isDeleting: boolean;
	onOpenChange: (open: boolean) => void;
	onRefresh: () => void;
	onRestore: (filePath: string) => void;
	onDownload: (filePath: string) => void;
	onDelete: (filePath: string) => void;
}

function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(isoString: string): string {
	const date = new Date(isoString);
	return date.toLocaleString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function DumpsDrawer({
	isOpen,
	dumps,
	isLoading,
	isRestoring,
	isDeleting,
	onOpenChange,
	onRefresh,
	onRestore,
	onDownload,
	onDelete,
}: DumpsDrawerProps) {
	const isActionPending = isRestoring || isDeleting;

	return (
		<Drawer open={isOpen} onOpenChange={onOpenChange}>
			<DrawerContent className="sm:max-w-lg" side="right">
				<DrawerHeader>
					<DrawerTitle className="flex items-center gap-2">
						<Database className="w-6 h-6" /> Dumps
					</DrawerTitle>
					<DrawerDescription>
						Manage your saved database dumps
					</DrawerDescription>
				</DrawerHeader>

				<DrawerBody>
					<div className="flex items-center justify-between mb-4">
						<span className="text-sm font-bold text-muted-foreground">
							{dumps.length} dump{dumps.length !== 1 ? "s" : ""} found
						</span>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={onRefresh}
							disabled={isLoading}
							className="rounded-none border-2 border-border shadow-hardware font-bold uppercase"
						>
							{isLoading ? (
								<Loader2 className="w-4 h-4 animate-spin" />
							) : (
								<RefreshCw className="w-4 h-4" />
							)}
							<span className="ml-2">Refresh</span>
						</Button>
					</div>

					{dumps.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-12 text-center">
							<Database className="w-12 h-12 text-muted-foreground mb-4" />
							<p className="font-bold text-muted-foreground">No dumps yet</p>
							<p className="text-sm text-muted-foreground mt-1">
								Create a dump from the Schema page
							</p>
						</div>
					) : (
						<div className="space-y-3">
							{dumps.map((dump) => (
								<div
									key={dump.path}
									className="border-2 border-border bg-secondary p-4 shadow-hardware"
								>
									<div className="flex items-start justify-between gap-2">
										<div className="flex-1 min-w-0">
											<p className="font-mono font-bold text-sm truncate">
												{dump.fileName}
											</p>
											<p className="text-xs text-muted-foreground mt-1">
												{formatFileSize(dump.size)} •{" "}
												{formatDate(dump.createdAt)}
											</p>
											<p className="text-xs text-muted-foreground font-mono truncate mt-1">
												{dump.path}
											</p>
										</div>
									</div>

									<div className="flex items-center gap-2 mt-3">
										<Button
											type="button"
											variant="accent"
											size="sm"
											onClick={() => onRestore(dump.path)}
											disabled={isActionPending}
											className="rounded-none border-2 shadow-hardware font-bold uppercase flex-1"
										>
											{isRestoring ? (
												<Loader2 className="w-3 h-3 animate-spin mr-1" />
											) : (
												<Upload className="w-3 h-3 mr-1" />
											)}
											Restore
										</Button>
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={() => onDownload(dump.path)}
											disabled={isActionPending}
											className="rounded-none border-2 border-border shadow-hardware font-bold uppercase flex-1"
										>
											<Download className="w-3 h-3 mr-1" />
											Download
										</Button>
										<Button
											type="button"
											variant="destructive"
											size="sm"
											onClick={() => onDelete(dump.path)}
											disabled={isActionPending}
											className="rounded-none border-2 border-destructive shadow-hardware font-bold uppercase"
										>
											{isDeleting ? (
												<Loader2 className="w-3 h-3 animate-spin" />
											) : (
												<Trash2 className="w-3 h-3" />
											)}
										</Button>
									</div>
								</div>
							))}
						</div>
					)}
				</DrawerBody>
			</DrawerContent>
		</Drawer>
	);
}
