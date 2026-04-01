import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	AlertTriangle,
	ChevronDown,
	Database,
	Download,
	Loader2,
	RefreshCw,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
} from "../components/ui/alert-dialog";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../components/ui/select";
import { useActiveConnection } from "../hooks/use-active-connection.tsx";
import {
	clearTableDataFn,
	dropAllTablesFn,
	getAvailableDumpsFn,
	getDatabaseSchemaFn,
	restoreDumpFn,
	wipeAllDataFn,
} from "../server/schema-fns";

export const Route = createFileRoute("/schema")({ component: SchemaPage });

function SchemaPage() {
	const [selectedTable, setSelectedTable] = useState<string | null>(null);
	const [schemaExportFormat, setSchemaExportFormat] = useState<"json" | "dbml">(
		"json",
	);
	const [dumpType, setDumpType] = useState<"schema" | "data" | "both">("both");
	const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
	const [selectedDump, setSelectedDump] = useState<string | null>(null);
	const [seedCount, setSeedCount] = useState("10");

	const { activeConnection, setActiveConnection } = useActiveConnection();

	const schemaQuery = useQuery({
		queryKey: ["schema", activeConnection?.id],
		queryFn: async () => {
			if (!activeConnection) {
				throw new Error("No active connection.");
			}
			return getDatabaseSchemaFn({ data: activeConnection });
		},
		enabled: !!activeConnection,
	});

	const dumpsQuery = useQuery({
		queryKey: ["available-dumps"],
		queryFn: () => getAvailableDumpsFn(),
	});

	const dumpMutation = useMutation({
		mutationFn: async () => {
			if (!activeConnection) {
				throw new Error("No active connection.");
			}

			const response = await fetch("/api/dump", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					connectionId: activeConnection.id,
					type: dumpType,
				}),
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(
					errorData.message || "Failed to execute dump on server.",
				);
			}

			return response.json();
		},
		onSuccess: (data) => {
			toast.success("Dump saved", {
				description: `File saved: ${data.fileName ?? "dump.sql"}`,
			});
		},
		onError: (error) => {
			toast.error("Dump failed", {
				description: error instanceof Error ? error.message : "Unknown error",
			});
		},
	});

	const wipeAllDataMutation = useMutation({
		mutationFn: async () => {
			if (!activeConnection) {
				throw new Error("No active connection.");
			}

			const result = await wipeAllDataFn({
				data: {
					driver:
						activeConnection.driver === "mysql" ||
						activeConnection.driver === "sqlite" ||
						activeConnection.driver === "postgres"
							? activeConnection.driver
							: "postgres",
					host: activeConnection.host ?? undefined,
					port: activeConnection.port ?? undefined,
					user: activeConnection.user ?? undefined,
					password: activeConnection.password ?? undefined,
					database: activeConnection.database_name ?? undefined,
				},
			});

			if (!result.success) {
				throw new Error(result.error);
			}

			return result;
		},
		onSuccess: () => {
			schemaQuery.refetch();
			toast.success("Data wiped", {
				description: "All data has been deleted from all tables.",
			});
		},
		onError: (error) => {
			toast.error("Wipe failed", {
				description: error instanceof Error ? error.message : "Unknown error",
			});
		},
	});

	const dropAllTablesMutation = useMutation({
		mutationFn: async () => {
			if (!activeConnection) {
				throw new Error("No active connection.");
			}

			const result = await dropAllTablesFn({
				data: {
					driver:
						activeConnection.driver === "mysql" ||
						activeConnection.driver === "sqlite" ||
						activeConnection.driver === "postgres"
							? activeConnection.driver
							: "postgres",
					host: activeConnection.host ?? undefined,
					port: activeConnection.port ?? undefined,
					user: activeConnection.user ?? undefined,
					password: activeConnection.password ?? undefined,
					database: activeConnection.database_name ?? undefined,
				},
			});

			if (!result.success) {
				throw new Error(result.error);
			}

			return result;
		},
		onSuccess: () => {
			schemaQuery.refetch();
			toast.success("Tables dropped", {
				description: "All tables have been removed from the database.",
			});
		},
		onError: (error) => {
			toast.error("Drop failed", {
				description: error instanceof Error ? error.message : "Unknown error",
			});
		},
	});

	const clearTableMutation = useMutation({
		mutationFn: async (tableName: string) => {
			if (!activeConnection) {
				throw new Error("No active connection.");
			}

			const result = await clearTableDataFn({
				data: {
					tableName,
					credentials: {
						driver:
							activeConnection.driver === "mysql" ||
							activeConnection.driver === "sqlite" ||
							activeConnection.driver === "postgres"
								? activeConnection.driver
								: "postgres",
						host: activeConnection.host ?? undefined,
						port: activeConnection.port ?? undefined,
						user: activeConnection.user ?? undefined,
						password: activeConnection.password ?? undefined,
						database: activeConnection.database_name ?? undefined,
					},
				},
			});

			if (!result.success) {
				throw new Error(result.error);
			}

			return result;
		},
		onSuccess: () => {
			schemaQuery.refetch();
			toast.success("Table cleared", {
				description: "All rows were removed from the selected table.",
			});
		},
		onError: (error) => {
			toast.error("Clear failed", {
				description: error instanceof Error ? error.message : "Unknown error",
			});
		},
	});

	const restoreDumpMutation = useMutation({
		mutationFn: async (filePath: string) => {
			if (!activeConnection) {
				throw new Error("No active connection.");
			}

			const result = await restoreDumpFn({
				data: {
					filePath,
					credentials: {
						driver:
							activeConnection.driver === "mysql" ||
							activeConnection.driver === "sqlite" ||
							activeConnection.driver === "postgres"
								? activeConnection.driver
								: "postgres",
						host: activeConnection.host ?? undefined,
						port: activeConnection.port ?? undefined,
						user: activeConnection.user ?? undefined,
						password: activeConnection.password ?? undefined,
						database: activeConnection.database_name ?? undefined,
					},
				},
			});

			if (!result.success) {
				throw new Error(result.error);
			}

			return result;
		},
		onSuccess: () => {
			setIsRestoreModalOpen(false);
			setSelectedDump(null);
			schemaQuery.refetch();
			toast.success("Dump restored", {
				description: "The selected dump has been restored successfully.",
			});
		},
		onError: (error) => {
			toast.error("Restore failed", {
				description: error instanceof Error ? error.message : "Unknown error",
			});
		},
	});

	const seedMutation = useMutation({
		mutationFn: async ({
			tableName,
			count,
		}: {
			tableName: string;
			count: number;
		}) => {
			if (!activeConnection) {
				throw new Error("No active connection.");
			}

			const response = await fetch(
				`/api/seed?connectionId=${activeConnection.id}&tableName=${tableName}&count=${count}`,
				{ method: "POST" },
			);

			if (!response.ok) {
				const errorData = (await response.json().catch(() => null)) as {
					error?: string;
				} | null;
				throw new Error(errorData?.error ?? "Seed failed.");
			}

			return response.json();
		},
		onSuccess: () => {
			schemaQuery.refetch();
			toast.success("Table seeded", {
				description: "Seed data was inserted successfully.",
			});
		},
		onError: (error) => {
			toast.error("Seed failed", {
				description: error instanceof Error ? error.message : "Unknown error",
			});
		},
	});

	const schemaData = schemaQuery.data;
	const schemaError =
		schemaData && "error" in schemaData ? schemaData.error : null;
	const tables = schemaData && Array.isArray(schemaData) ? schemaData : [];

	const selectedTableData = selectedTable
		? tables.find((table) => table.tableName === selectedTable)
		: null;

	const isDumping = dumpMutation.isPending;
	const isWipingAllData = wipeAllDataMutation.isPending;
	const isDroppingAllTables = dropAllTablesMutation.isPending;
	const isRestoringDump = restoreDumpMutation.isPending;
	const isSeeding = seedMutation.isPending;

	if (!activeConnection) {
		return (
			<main className="mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center p-6 md:p-10 font-mono">
				<div className="w-full max-w-md bg-card border-2 border-border p-6 shadow-hardware">
					<div className="border-b-2 border-border pb-4 mb-4">
						<h1 className="text-2xl font-black uppercase tracking-wider text-primary">
							No active connection.
						</h1>
					</div>
					<div className="flex items-center justify-between gap-3 pt-4">
						<p className="text-sm font-bold uppercase text-muted-foreground">
							Select a saved connection to start.
						</p>
						<Button asChild>
							<Link to="/">Back</Link>
						</Button>
					</div>
				</div>
			</main>
		);
	}

	return (
		<main className="mx-auto flex min-h-screen w-full flex-col gap-8 p-6 md:p-10 font-mono">
			{/* Header Control Panel */}
			<div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between bg-card p-6 border-2 border-border shadow-hardware">
				<div>
					<h1 className="text-3xl font-black uppercase tracking-wider text-primary">
						Schema Explorer
					</h1>
					<div className="mt-2 flex items-center gap-3">
						<span className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
							{activeConnection.name}
						</span>
						<div className="bg-background border-2 border-primary px-3 py-1 text-primary font-black text-xl tracking-widest flex items-center gap-2">
							<span className="text-[10px] uppercase text-muted-foreground">
								TABLES:
							</span>
							<span className="animate-pulse">
								{tables.length.toString().padStart(3, "0")}
							</span>
						</div>
					</div>
				</div>
				<div className="flex flex-wrap items-center gap-3">
					<div className="flex items-center gap-2 bg-secondary p-2 border-2 border-border">
						<Select
							value={schemaExportFormat}
							onValueChange={(value) => {
								setSchemaExportFormat(value as "json" | "dbml");
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
							</SelectContent>
						</Select>
						<Button
							type="button"
							asChild
							disabled={
								isDumping ||
								isWipingAllData ||
								isDroppingAllTables ||
								clearTableMutation.isPending ||
								isRestoringDump ||
								isSeeding
							}
						>
							<a
								href={`/api/export-schema?connectionId=${activeConnection.id}&format=${schemaExportFormat}`}
								className=" hover:bg-neutral-600!"
							>
								Export Schema
							</a>
						</Button>
					</div>

					<div className="flex items-center gap-2 bg-secondary p-2 border-2 border-border">
						<Select
							value={dumpType}
							onValueChange={(value) => {
								setDumpType(value as "schema" | "data" | "both");
							}}
						>
							<SelectTrigger className="w-38 rounded-none border-2 border-border shadow-hardware bg-card text-foreground font-bold uppercase disabled:opacity-50">
								<SelectValue placeholder="Dump type" />
							</SelectTrigger>
							<SelectContent className="rounded-none border-2 border-primary shadow-hardware font-mono bg-card">
								<SelectItem
									value="schema"
									className="font-bold uppercase rounded-none focus:bg-primary focus:text-primary-foreground cursor-pointer"
								>
									Schema Only
								</SelectItem>
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
									Schema + Data
								</SelectItem>
							</SelectContent>
						</Select>
						<Button
							type="button"
							className="hover:bg-neutral-600!"
							onClick={() => {
								dumpMutation.mutate();
							}}
							disabled={
								isDumping ||
								isWipingAllData ||
								isDroppingAllTables ||
								clearTableMutation.isPending ||
								isRestoringDump ||
								isSeeding
							}
						>
							{isDumping ? (
								<Loader2 className="animate-spin w-4 h-4 mr-2" />
							) : (
								<Download className="w-4 h-4 mr-2" />
							)}
							{isDumping ? "Saving..." : "Dump SQL"}
						</Button>
					</div>

					<Button
						type="button"
						variant="accent"
						disabled={
							isWipingAllData ||
							isDroppingAllTables ||
							clearTableMutation.isPending ||
							isRestoringDump ||
							isSeeding
						}
						onClick={() => {
							setIsRestoreModalOpen(true);
						}}
					>
						Restore
					</Button>

					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button
								type="button"
								variant="destructive"
								disabled={
									wipeAllDataMutation.isPending ||
									dropAllTablesMutation.isPending ||
									clearTableMutation.isPending ||
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
									onClick={() => {
										wipeAllDataMutation.mutate();
									}}
									className="rounded-none border-2 border-destructive shadow-hardware active:translate-x-0.5 active:translate-y-0.5 active:shadow-none font-bold uppercase bg-destructive text-destructive-foreground hover:bg-destructive/90"
								>
									{isWipingAllData ? "Wiping..." : "Execute Wipe"}
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>

					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button
								type="button"
								variant="destructive"
								disabled={
									dropAllTablesMutation.isPending ||
									wipeAllDataMutation.isPending ||
									clearTableMutation.isPending ||
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
									DANGER: This will completely DESTROY ALL TABLES and their
									data. Your database schema will be wiped clean. You will need
									to rerun your ORM migrations to rebuild the structure. This is
									completely irreversible.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter className="mt-6">
								<AlertDialogCancel className="rounded-none border-2 border-border bg-secondary hover:bg-muted active:translate-x-0.5 active:translate-y-0.5 active:shadow-none font-bold uppercase text-foreground">
									Cancel
								</AlertDialogCancel>
								<AlertDialogAction
									onClick={() => {
										dropAllTablesMutation.mutate();
									}}
									className="rounded-none border-2 border-destructive shadow-hardware active:translate-x-0.5 active:translate-y-0.5 active:shadow-none font-bold uppercase bg-destructive text-destructive-foreground hover:bg-destructive/90"
								>
									{isDroppingAllTables ? "Dropping..." : "Execute Drop"}
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</div>
			</div>

			{/* Error State */}
			{schemaError ? (
				<div className="bg-card border-4 border-destructive p-6 shadow-hardware">
					<div className="flex items-center gap-3 text-destructive">
						<AlertTriangle className="w-6 h-6" />
						<p className="font-black uppercase tracking-wider">ERROR</p>
					</div>
					<p className="mt-2 text-muted-foreground font-bold">{schemaError}</p>
				</div>
			) : null}

			{/* Loading State */}
			{schemaQuery.isLoading ? (
				<div className="bg-card border-2 border-border p-6 shadow-hardware">
					<div className="flex items-center gap-3 text-primary">
						<Loader2 className="w-6 h-6 animate-spin" />
						<p className="font-black uppercase tracking-wider animate-pulse">
							Scanning database structures...
						</p>
					</div>
				</div>
			) : null}

			{/* Main Content Grid */}
			{!schemaQuery.isLoading && !schemaError ? (
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
					{/* Table List (Master View) */}
					<div className="lg:col-span-1 bg-card border-2 border-border shadow-hardware">
						<div className="p-4 border-b-2 border-border flex items-center justify-between">
							<h2 className="font-black uppercase tracking-wider text-primary flex items-center gap-2">
								<Database className="w-5 h-5" />
								Tables
							</h2>
							<Button
								size="icon-sm"
								variant="ghost"
								onClick={() => schemaQuery.refetch()}
								disabled={schemaQuery.isRefetching}
							>
								<RefreshCw
									className={`w-4 h-4 ${schemaQuery.isRefetching ? "animate-spin" : ""}`}
								/>
							</Button>
						</div>
						<div className="divide-y divide-border">
							{tables.map((table) => (
								<button
									type="button"
									key={table.tableName}
									onClick={() => setSelectedTable(table.tableName)}
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

					{/* Table Detail (Inspector View) */}
					<div className="lg:col-span-2 bg-card border-2 border-border shadow-hardware">
						{selectedTableData ? (
							<>
								<div className="p-4 border-b-2 border-border flex items-center justify-between">
									<h2 className="font-black uppercase tracking-wider text-primary flex items-center gap-2">
										<ChevronDown className="w-5 h-5" />
										{selectedTableData.tableName}
									</h2>
									<span className="text-xs text-muted-foreground font-bold uppercase">
										{selectedTableData.columns.length} Columns
									</span>
								</div>

								{/* Column Grid */}
								<div className="p-4 space-y-2">
									<div className="grid grid-cols-3 gap-2 text-xs font-black uppercase tracking-widest text-muted-foreground pb-2 border-b border-border">
										<span>Column</span>
										<span>Type</span>
										<span>Nullable</span>
									</div>
									{selectedTableData.columns.map((column) => (
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
											onChange={(e) => setSeedCount(e.target.value)}
											className="w-20 rounded-none border-2 border-border bg-card text-foreground font-bold text-center h-10"
											placeholder="10"
										/>
										<Button
											type="button"
											variant="accent"
											onClick={() => {
												seedMutation.mutate({
													tableName: selectedTableData.tableName,
													count: Number(seedCount) || 10,
												});
											}}
											disabled={isSeeding || clearTableMutation.isPending}
										>
											{isSeeding ? (
												<Loader2 className="animate-spin w-4 h-4 mr-2" />
											) : null}
											{isSeeding ? "Seeding..." : "Seed Table"}
										</Button>
									</div>

									<AlertDialog>
										<AlertDialogTrigger asChild>
											<Button
												type="button"
												variant="destructive"
												disabled={clearTableMutation.isPending || isSeeding}
											>
												<Trash2 className="w-4 h-4" />
												{clearTableMutation.isPending
													? "Clearing..."
													: "Clear Table"}
											</Button>
										</AlertDialogTrigger>
										<AlertDialogContent className="rounded-none border-4 border-destructive shadow-hardware font-mono p-6 bg-card">
											<AlertDialogHeader>
												<AlertDialogTitle className="text-2xl font-black uppercase text-destructive flex items-center gap-2">
													<AlertTriangle className="w-6 h-6" /> Clear table?
												</AlertDialogTitle>
												<AlertDialogDescription className="text-muted-foreground font-bold">
													This will delete ALL data from{" "}
													<span className="text-primary">
														{selectedTableData.tableName}
													</span>
													. The table structure will remain intact.
												</AlertDialogDescription>
											</AlertDialogHeader>
											<AlertDialogFooter className="mt-6">
												<AlertDialogCancel className="rounded-none border-2 border-border bg-secondary hover:bg-muted active:translate-x-0.5 active:translate-y-0.5 active:shadow-none font-bold uppercase text-foreground">
													Cancel
												</AlertDialogCancel>
												<AlertDialogAction
													onClick={() => {
														clearTableMutation.mutate(
															selectedTableData.tableName,
														);
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
						) : (
							<div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
								<Database className="w-12 h-12 mb-4 opacity-50" />
								<p className="font-bold uppercase tracking-wider">
									Select a table to inspect
								</p>
							</div>
						)}
					</div>
				</div>
			) : null}

			{/* Restore Modal */}
			<AlertDialog
				open={isRestoreModalOpen}
				onOpenChange={(open) => {
					if (!open) {
						setIsRestoreModalOpen(false);
						setSelectedDump(null);
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
							onValueChange={(value) => setSelectedDump(value)}
						>
							<SelectTrigger className="w-full rounded-none border-2 border-border shadow-hardware bg-card text-foreground font-bold uppercase disabled:opacity-50">
								<SelectValue placeholder="Select a dump file" />
							</SelectTrigger>
							<SelectContent className="rounded-none border-2 border-primary shadow-hardware font-mono bg-card">
								{dumpsQuery.data?.map((dump) => (
									<SelectItem
										key={dump}
										value={dump}
										className="font-bold rounded-none focus:bg-primary focus:text-primary-foreground cursor-pointer"
									>
										{dump}
									</SelectItem>
								))}
								{(!dumpsQuery.data || dumpsQuery.data.length === 0) && (
									<div className="p-2 text-muted-foreground font-bold uppercase text-center">
										No dumps available
									</div>
								)}
							</SelectContent>
						</Select>
					</div>
					<AlertDialogFooter className="mt-6">
						<AlertDialogCancel className="rounded-none border-2 border-border bg-secondary hover:bg-muted active:translate-x-0.5 active:translate-y-0.5 active:shadow-none font-bold uppercase text-foreground">
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								if (selectedDump) {
									restoreDumpMutation.mutate(selectedDump);
								}
							}}
							disabled={!selectedDump || isRestoringDump}
							className="rounded-none border-2 border-primary shadow-hardware active:translate-x-0.5 active:translate-y-0.5 active:shadow-none font-bold uppercase bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
						>
							{isRestoringDump ? (
								<>
									<Loader2 className="animate-spin w-4 h-4 mr-2" />
									Restoring...
								</>
							) : (
								"Execute Restore"
							)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Footer Navigation */}
			<div className="flex items-center justify-between gap-4 py-4 border-t-2 border-border">
				<Button asChild size="lg">
					<Link to="/">
						<Database className="w-5 h-5 mr-2" />
						Connections
					</Link>
				</Button>
				<Button
					variant="outline"
					size="lg"
					onClick={() => {
						setActiveConnection(null);
					}}
				>
					Disconnect
				</Button>
			</div>
		</main>
	);
}
