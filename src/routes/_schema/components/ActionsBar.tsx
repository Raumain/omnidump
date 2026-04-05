import { AlertTriangle, Download, Loader2 } from "lucide-react";

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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

interface ActionsBarProps {
	connectionId: number;
	schemaExportFormat: "json" | "dbml" | "sql";
	dumpType: "data" | "both";
	isDumping: boolean;
	isWipingAllData: boolean;
	isDroppingAllTables: boolean;
	isClearingTable: boolean;
	isRestoringDump: boolean;
	isSeeding: boolean;
	onSchemaExportFormatChange: (format: "json" | "dbml" | "sql") => void;
	onDumpTypeChange: (type: "data" | "both") => void;
	onDump: () => void;
	onOpenRestoreModal: () => void;
	onWipeAllData: () => void;
	onDropAllTables: () => void;
}

export function ActionsBar({
	connectionId,
	schemaExportFormat,
	dumpType,
	isDumping,
	isWipingAllData,
	isDroppingAllTables,
	isClearingTable,
	isRestoringDump,
	isSeeding,
	onSchemaExportFormatChange,
	onDumpTypeChange,
	onDump,
	onOpenRestoreModal,
	onWipeAllData,
	onDropAllTables,
}: ActionsBarProps) {
	const isAnyActionPending =
		isDumping ||
		isWipingAllData ||
		isDroppingAllTables ||
		isClearingTable ||
		isRestoringDump ||
		isSeeding;

	return (
		<div className="bg-card border-2 border-border p-4 shadow-hardware">
			<div className="flex flex-wrap items-center gap-3">
				{/* Export Schema */}
				<div className="flex items-center gap-2 bg-secondary p-2 border-2 border-border">
					<Select
						value={schemaExportFormat}
						onValueChange={(value) => {
							onSchemaExportFormatChange(value as "json" | "dbml" | "sql");
						}}
					>
						<SelectTrigger className="w-35 rounded-none border-2 border-border shadow-hardware bg-card text-foreground font-bold uppercase disabled:opacity-50">
							<SelectValue placeholder="Format" />
						</SelectTrigger>
						<SelectContent className="rounded-none border-2 border-primary shadow-hardware font-mono bg-card">
							<SelectItem
								value="json"
								className="font-bold uppercase rounded-none focus:bg-primary focus:text-primary-foreground cursor-pointer"
							>
								Export JSON
							</SelectItem>
							<SelectItem
								value="dbml"
								className="font-bold uppercase rounded-none focus:bg-primary focus:text-primary-foreground cursor-pointer"
							>
								Export DBML
							</SelectItem>
							<SelectItem
								value="sql"
								className="font-bold uppercase rounded-none focus:bg-primary focus:text-primary-foreground cursor-pointer"
							>
								Export SQL
							</SelectItem>
						</SelectContent>
					</Select>
					<Button type="button" asChild disabled={isAnyActionPending}>
						<a
							href={`/api/export-schema?connectionId=${connectionId}&format=${schemaExportFormat}`}
							className=" hover:bg-neutral-600! text-foreground!"
						>
							Export Schema
						</a>
					</Button>
				</div>

				{/* Dump SQL */}
				<div className="flex items-center gap-2 bg-secondary p-2 border-2 border-border">
					<Select
						value={dumpType}
						onValueChange={(value) => {
							onDumpTypeChange(value as "data" | "both");
						}}
					>
						<SelectTrigger className="w-38 rounded-none border-2 border-border shadow-hardware bg-card text-foreground font-bold uppercase disabled:opacity-50">
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
					<Button
						type="button"
						className="hover:bg-neutral-600!"
						onClick={onDump}
						disabled={isAnyActionPending}
					>
						{isDumping ? (
							<Loader2 className="animate-spin w-4 h-4 mr-2" />
						) : (
							<Download className="w-4 h-4 mr-2" />
						)}
						{isDumping ? "Saving..." : "Dump SQL"}
					</Button>
				</div>

				{/* Restore */}
				<Button
					type="button"
					variant="accent"
					disabled={isAnyActionPending}
					onClick={onOpenRestoreModal}
				>
					Restore
				</Button>

				{/* Wipe Data */}
				<AlertDialog>
					<AlertDialogTrigger asChild>
						<Button
							type="button"
							variant="destructive"
							disabled={
								isWipingAllData ||
								isDroppingAllTables ||
								isClearingTable ||
								isSeeding
							}
						>
							<AlertTriangle className="w-4 h-4" />
							{isWipingAllData ? "Wiping..." : "Wipe Data"}
						</Button>
					</AlertDialogTrigger>
					<AlertDialogContent className="rounded-none border-4 border-destructive shadow-hardware font-mono p-6 bg-card">
						<AlertDialogHeader>
							<AlertDialogTitle className="text-2xl font-black uppercase text-destructive flex items-center gap-2">
								<AlertTriangle className="w-6 h-6" /> Wipe all data?
							</AlertDialogTitle>
							<AlertDialogDescription className="text-muted-foreground font-bold">
								WARNING: This will delete ALL data across ALL tables in this
								database. The schema will remain intact. This action is
								irreversible.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter className="mt-6">
							<AlertDialogCancel className="rounded-none border-2 border-border bg-secondary hover:bg-muted active:translate-x-0.5 active:translate-y-0.5 active:shadow-none font-bold uppercase text-foreground">
								Cancel
							</AlertDialogCancel>
							<AlertDialogAction
								onClick={onWipeAllData}
								className="rounded-none border-2 border-destructive shadow-hardware active:translate-x-0.5 active:translate-y-0.5 active:shadow-none font-bold uppercase bg-destructive text-destructive-foreground hover:bg-destructive/90"
							>
								{isWipingAllData ? "Wiping..." : "Execute Wipe"}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>

				{/* Drop All Tables */}
				<AlertDialog>
					<AlertDialogTrigger asChild>
						<Button
							type="button"
							variant="destructive"
							disabled={
								isDroppingAllTables ||
								isWipingAllData ||
								isClearingTable ||
								isRestoringDump ||
								isSeeding
							}
						>
							<AlertTriangle className="w-4 h-4" />
							{isDroppingAllTables ? "Dropping..." : "Drop Total"}
						</Button>
					</AlertDialogTrigger>
					<AlertDialogContent className="rounded-none border-4 border-destructive shadow-hardware font-mono p-6 bg-card">
						<AlertDialogHeader>
							<AlertDialogTitle className="text-2xl font-black uppercase text-destructive flex items-center gap-2">
								<AlertTriangle className="w-6 h-6" /> Drop all tables?
							</AlertDialogTitle>
							<AlertDialogDescription className="text-muted-foreground font-bold">
								DANGER: This will completely DESTROY ALL TABLES and their data.
								Your database schema will be wiped clean. You will need to rerun
								your ORM migrations to rebuild the structure. This is completely
								irreversible.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter className="mt-6">
							<AlertDialogCancel className="rounded-none border-2 border-border bg-secondary hover:bg-muted active:translate-x-0.5 active:translate-y-0.5 active:shadow-none font-bold uppercase text-foreground">
								Cancel
							</AlertDialogCancel>
							<AlertDialogAction
								onClick={onDropAllTables}
								className="rounded-none border-2 border-destructive shadow-hardware active:translate-x-0.5 active:translate-y-0.5 active:shadow-none font-bold uppercase bg-destructive text-destructive-foreground hover:bg-destructive/90"
							>
								{isDroppingAllTables ? "Dropping..." : "Execute Drop"}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</div>
		</div>
	);
}
