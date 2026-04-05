import { Database, Download, Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

type TableInfo = {
	tableName: string;
	columns: Array<{
		name: string;
		dataType: string;
		isNullable: boolean;
	}>;
};

interface DumpModalProps {
	isOpen: boolean;
	tables: TableInfo[];
	isDumping: boolean;
	onOpenChange: (open: boolean) => void;
	onDump: (options: {
		tables: string[];
		type: "data" | "both";
		download: boolean;
	}) => void;
}

export function DumpModal({
	isOpen,
	tables,
	isDumping,
	onOpenChange,
	onDump,
}: DumpModalProps) {
	const [selectedTables, setSelectedTables] = useState<Set<string>>(
		() => new Set(tables.map((t) => t.tableName)),
	);
	const [dumpType, setDumpType] = useState<"data" | "both">("both");
	const [downloadLocally, setDownloadLocally] = useState(true);

	const allSelected =
		tables.length > 0 && selectedTables.size === tables.length;

	const handleSelectAll = () => {
		if (allSelected) {
			setSelectedTables(new Set());
		} else {
			setSelectedTables(new Set(tables.map((t) => t.tableName)));
		}
	};

	const handleToggleTable = (tableName: string) => {
		setSelectedTables((prev) => {
			const next = new Set(prev);
			if (next.has(tableName)) {
				next.delete(tableName);
			} else {
				next.add(tableName);
			}
			return next;
		});
	};

	const handleDump = () => {
		onDump({
			tables: Array.from(selectedTables),
			type: dumpType,
			download: downloadLocally,
		});
	};

	// Reset selection when modal opens with new tables
	const handleOpenChange = (open: boolean) => {
		if (open) {
			setSelectedTables(new Set(tables.map((t) => t.tableName)));
		}
		onOpenChange(open);
	};

	return (
		<Dialog open={isOpen} onOpenChange={handleOpenChange}>
			<DialogContent
				className="rounded-none border-4 border-primary shadow-hardware font-mono p-0 bg-card max-w-lg max-h-[80vh] flex flex-col"
				showCloseButton={false}
			>
				<DialogHeader className="p-6 pb-4 border-b-2 border-border">
					<DialogTitle className="text-2xl font-black uppercase text-primary flex items-center gap-2">
						<Database className="w-6 h-6" /> Dump SQL
					</DialogTitle>
					<DialogDescription className="text-muted-foreground font-bold">
						Select tables and options for the dump.
					</DialogDescription>
				</DialogHeader>

				<div className="flex-1 overflow-y-auto p-6 space-y-6">
					{/* Dump Type */}
					<div className="space-y-2">
						<span className="font-bold uppercase text-sm block">Dump Type</span>
						<Select
							value={dumpType}
							onValueChange={(value) => setDumpType(value as "data" | "both")}
						>
							<SelectTrigger className="w-full rounded-none border-2 border-border shadow-hardware bg-card text-foreground font-bold uppercase">
								<SelectValue placeholder="Dump type" />
							</SelectTrigger>
							<SelectContent className="rounded-none border-2 border-primary shadow-hardware font-mono bg-card">
								<SelectItem
									value="data"
									className="font-bold uppercase rounded-none focus:bg-primary focus:text-primary-foreground cursor-pointer"
								>
									Data Only
								</SelectItem>
								<SelectItem
									value="both"
									className="font-bold uppercase rounded-none focus:bg-primary focus:text-primary-foreground cursor-pointer"
								>
									Data + Schema
								</SelectItem>
							</SelectContent>
						</Select>
					</div>

					{/* Download Option */}
					<div className="flex items-center gap-3">
						<input
							type="checkbox"
							id="download-locally"
							checked={downloadLocally}
							onChange={(e) => setDownloadLocally(e.target.checked)}
							className="w-5 h-5 accent-primary cursor-pointer"
						/>
						<label
							htmlFor="download-locally"
							className="font-bold uppercase text-sm cursor-pointer select-none"
						>
							Download immediately
						</label>
					</div>

					{/* Table Selection */}
					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<span className="font-bold uppercase text-sm">
								Tables ({selectedTables.size}/{tables.length})
							</span>
							<button
								type="button"
								onClick={handleSelectAll}
								className="text-sm font-bold uppercase text-primary hover:underline"
							>
								{allSelected ? "Deselect All" : "Select All"}
							</button>
						</div>

						<div className="border-2 border-border bg-secondary p-3 max-h-60 overflow-y-auto space-y-2">
							{tables.length === 0 ? (
								<p className="text-muted-foreground text-sm">No tables found</p>
							) : (
								tables.map((table) => (
									<div
										key={table.tableName}
										className="flex items-center gap-3"
									>
										<input
											type="checkbox"
											id={`table-${table.tableName}`}
											checked={selectedTables.has(table.tableName)}
											onChange={() => handleToggleTable(table.tableName)}
											className="w-4 h-4 accent-primary cursor-pointer"
										/>
										<label
											htmlFor={`table-${table.tableName}`}
											className="font-mono text-sm cursor-pointer select-none flex-1"
										>
											{table.tableName}
											<span className="text-muted-foreground ml-2">
												({table.columns.length} cols)
											</span>
										</label>
									</div>
								))
							)}
						</div>
					</div>
				</div>

				<DialogFooter className="p-6 pt-4 border-t-2 border-border flex-row justify-end gap-3">
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isDumping}
						className="rounded-none border-2 border-border shadow-hardware font-bold uppercase"
					>
						Cancel
					</Button>
					<Button
						type="button"
						onClick={handleDump}
						disabled={isDumping || selectedTables.size === 0}
						className="rounded-none border-2 border-primary shadow-hardware font-bold uppercase bg-primary text-primary-foreground hover:bg-primary/90"
					>
						{isDumping ? (
							<Loader2 className="animate-spin w-4 h-4 mr-2" />
						) : (
							<Download className="w-4 h-4 mr-2" />
						)}
						{isDumping ? "Dumping..." : "Execute Dump"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
