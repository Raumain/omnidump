import {
	AlertTriangle,
	ChevronDown,
	Database,
	Loader2,
	Trash2,
	Upload,
} from "lucide-react";

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
import { Input } from "@/components/ui/input";

interface ColumnInfo {
	name: string;
	dataType: string;
	isNullable: boolean;
}

interface TableDetailProps {
	tableName: string;
	columns: ColumnInfo[];
	seedCount: string;
	isSeeding: boolean;
	isClearingTable: boolean;
	isImporting: boolean;
	onSeedCountChange: (count: string) => void;
	onSeed: (tableName: string, count: number) => void;
	onOpenImportDrawer: () => void;
	onClearTable: (tableName: string) => void;
}

export function TableDetail({
	tableName,
	columns,
	seedCount,
	isSeeding,
	isClearingTable,
	isImporting,
	onSeedCountChange,
	onSeed,
	onOpenImportDrawer,
	onClearTable,
}: TableDetailProps) {
	return (
		<>
			<div className="p-4 border-b-2 border-border flex items-center justify-between">
				<h2 className="font-black uppercase tracking-wider text-primary flex items-center gap-2">
					<ChevronDown className="w-5 h-5" />
					{tableName}
				</h2>
				<span className="text-xs text-muted-foreground font-bold uppercase">
					{columns.length} Columns
				</span>
			</div>

			{/* Column Grid */}
			<div className="p-4 space-y-2">
				<div className="grid grid-cols-3 gap-2 text-xs font-black uppercase tracking-widest text-muted-foreground pb-2 border-b border-border">
					<span>Column</span>
					<span>Type</span>
					<span>Nullable</span>
				</div>
				{columns.map((column) => (
					<div
						key={column.name}
						className="grid grid-cols-3 gap-2 text-sm font-mono py-2 border-b border-[#222222] hover:bg-secondary"
					>
						<span className="font-bold text-foreground truncate">
							{column.name}
						</span>
						<span className="text-primary font-bold uppercase text-xs">
							{column.dataType}
						</span>
						<span
							className={`font-bold text-xs ${column.isNullable ? "text-muted-foreground" : "text-destructive"}`}
						>
							{column.isNullable ? "YES" : "NO"}
						</span>
					</div>
				))}
			</div>

			{/* Table Actions */}
			<div className="p-4 border-t-2 border-border flex flex-wrap items-center gap-3">
				<div className="flex items-center gap-2 bg-secondary p-2 border-2 border-border">
					<Input
						type="number"
						min="1"
						max="1000"
						value={seedCount}
						onChange={(e) => onSeedCountChange(e.target.value)}
						className="w-20 rounded-none border-2 border-border bg-card text-foreground font-bold text-center h-10"
						placeholder="10"
					/>
					<Button
						type="button"
						variant="accent"
						onClick={() => {
							onSeed(tableName, Number(seedCount) || 10);
						}}
						disabled={isSeeding || isClearingTable}
					>
						{isSeeding ? (
							<Loader2 className="animate-spin w-4 h-4 mr-2" />
						) : null}
						{isSeeding ? "Seeding..." : "Seed Table"}
					</Button>
				</div>

				<Button
					type="button"
					variant="outline"
					className="shadow-hardware active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-none"
					onClick={onOpenImportDrawer}
					disabled={isImporting}
				>
					<Upload className="w-4 h-4 mr-2" />
					Import CSV
				</Button>

				<AlertDialog>
					<AlertDialogTrigger asChild>
						<Button
							type="button"
							variant="destructive"
							disabled={isClearingTable || isSeeding}
						>
							<Trash2 className="w-4 h-4" />
							{isClearingTable ? "Clearing..." : "Clear Table"}
						</Button>
					</AlertDialogTrigger>
					<AlertDialogContent className="rounded-none border-4 border-destructive shadow-hardware font-mono p-6 bg-card">
						<AlertDialogHeader>
							<AlertDialogTitle className="text-2xl font-black uppercase text-destructive flex items-center gap-2">
								<AlertTriangle className="w-6 h-6" /> Clear table?
							</AlertDialogTitle>
							<AlertDialogDescription className="text-muted-foreground font-bold">
								This will delete ALL data from{" "}
								<span className="text-primary">{tableName}</span>. The table
								structure will remain intact.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter className="mt-6">
							<AlertDialogCancel className="rounded-none border-2 border-border bg-secondary hover:bg-muted active:translate-x-0.5 active:translate-y-0.5 active:shadow-none font-bold uppercase text-foreground">
								Cancel
							</AlertDialogCancel>
							<AlertDialogAction
								onClick={() => {
									onClearTable(tableName);
								}}
								className="rounded-none border-2 border-destructive shadow-hardware active:translate-x-0.5 active:translate-y-0.5 active:shadow-none font-bold uppercase bg-destructive text-destructive-foreground hover:bg-destructive/90"
							>
								Execute Clear
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</div>
		</>
	);
}

export function TableDetailEmpty() {
	return (
		<div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
			<Database className="w-12 h-12 mb-4 opacity-50" />
			<p className="font-bold uppercase tracking-wider">
				Select a table to inspect
			</p>
		</div>
	);
}
