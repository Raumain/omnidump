import { Database, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

interface TableInfo {
	tableName: string;
	columns: Array<{
		name: string;
		dataType: string;
		isNullable: boolean;
	}>;
}

interface TableListProps {
	tables: TableInfo[];
	selectedTable: string | null;
	isRefetching: boolean;
	onSelectTable: (tableName: string) => void;
	onRefresh: () => void;
}

export function TableList({
	tables,
	selectedTable,
	isRefetching,
	onSelectTable,
	onRefresh,
}: TableListProps) {
	return (
		<div className="lg:col-span-1 bg-card border-2 border-border shadow-hardware">
			<div className="p-4 border-b-2 border-border flex items-center justify-between">
				<h2 className="font-black uppercase tracking-wider text-primary flex items-center gap-2">
					<Database className="w-5 h-5" />
					Tables
				</h2>
				<Button
					size="icon-sm"
					variant="ghost"
					onClick={onRefresh}
					disabled={isRefetching}
				>
					<RefreshCw
						className={`w-4 h-4 ${isRefetching ? "animate-spin" : ""}`}
					/>
				</Button>
			</div>
			<div className="divide-y divide-border">
				{tables.map((table) => (
					<button
						type="button"
						key={table.tableName}
						onClick={() => onSelectTable(table.tableName)}
						className={`w-full p-4 text-left font-bold uppercase tracking-wide transition-none hover:bg-secondary ${
							selectedTable === table.tableName
								? "bg-primary text-primary-foreground"
								: "text-foreground"
						}`}
					>
						<div className="flex items-center justify-between">
							<span className="truncate">{table.tableName}</span>
							<span
								className={`text-xs ${selectedTable === table.tableName ? "text-primary-foreground/70" : "text-muted-foreground"}`}
							>
								{table.columns.length} cols
							</span>
						</div>
					</button>
				))}
				{tables.length === 0 ? (
					<div className="p-4 text-center text-muted-foreground font-bold uppercase">
						No tables found
					</div>
				) : null}
			</div>
		</div>
	);
}
