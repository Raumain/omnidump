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
	Upload,
	Zap,
} from "lucide-react";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import Loader from "@/components/Loader.tsx";

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
	Drawer,
	DrawerBody,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useActiveConnection } from "@/hooks/use-active-connection.tsx";
import {
	clearTableDataFn,
	dropAllTablesFn,
	getAvailableDumpsFn,
	getDatabaseSchemaFn,
	restoreDumpFn,
	wipeAllDataFn,
} from "@/server/schema-fns";

export const Route = createFileRoute("/schema")({ component: SchemaPage });

const normalizeColumnName = (name: string) =>
	name.toLowerCase().replace(/[\s_-]/g, "");

function SchemaPage() {
	const [selectedTable, setSelectedTable] = useState<string | null>(null);
	const [schemaExportFormat, setSchemaExportFormat] = useState<
		"json" | "dbml" | "sql"
	>("json");
	const [dumpType, setDumpType] = useState<"data" | "both">("both");
	const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
	const [selectedDump, setSelectedDump] = useState<string | null>(null);
	const [seedCount, setSeedCount] = useState("10");

	// CSV Import drawer state
	const [isImportDrawerOpen, setIsImportDrawerOpen] = useState(false);
	const [csvFile, setCsvFile] = useState<File | null>(null);
	const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
	const [columnMapping, setColumnMapping] = useState<Record<string, string>>(
		{},
	);
	const [importSuccessCount, setImportSuccessCount] = useState(0);
	const [importFailedCount, setImportFailedCount] = useState(0);
	const [rejectFileName, setRejectFileName] = useState<string | null>(null);
	const csvFileInputRef = useRef<HTMLInputElement>(null);

	const { activeConnection, isHydrated } = useActiveConnection();

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
			schemaQuery.refetch();
			setIsRestoreModalOpen(false);
			setSelectedDump(null);
			toast.success("Dump restored", {
				description: "The database has been restored from the selected dump.",
			});
		},
		onError: (error) => {
			toast.error("Restore failed", {
				description: error instanceof Error ? error.message : "Unknown error",
			});
		},
	});

	const seedMutation = useMutation({
		mutationFn: async (input: { tableName: string; count: number }) => {
			if (!activeConnection) {
				throw new Error("No active connection.");
			}

			const response = await fetch("/api/seed", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					connectionId: activeConnection.id,
					tableName: input.tableName,
					count: input.count,
				}),
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(errorData.error || "Seed failed.");
			}

			return response.json();
		},
		onSuccess: () => {
			schemaQuery.refetch();
			toast.success("Table seeded", {
				description: "Fake data has been inserted into the table.",
			});
		},
		onError: (error) => {
			toast.error("Seed failed", {
				description: error instanceof Error ? error.message : "Unknown error",
			});
		},
	});

	const importMutation = useMutation({
		mutationFn: async (input: {
			file: File;
			connectionId: number;
			tableName: string;
			mapping: Record<string, string>;
		}) => {
			const formData = new FormData();
			formData.append("file", input.file);
			formData.append("connectionId", String(input.connectionId));
			formData.append("tableName", input.tableName);
			formData.append("mapping", JSON.stringify(input.mapping));

			const response = await fetch("/api/import", {
				method: "POST",
				body: formData,
			});

			if (!response.ok) {
				const errorData = (await response.json().catch(() => null)) as {
					error?: string;
				} | null;
				const message = errorData?.error ?? "Import failed.";
				throw new Error(message);
			}

			const reader = response.body?.getReader();
			const decoder = new TextDecoder();

			if (!reader) {
				throw new Error("Import stream is unavailable.");
			}

			let pendingChunk = "";

			const processEvent = (event: string) => {
				const dataLine = event
					.split("\n")
					.find((line) => line.startsWith("data: "));

				if (!dataLine) {
					return;
				}

				const payload = JSON.parse(dataLine.slice(6)) as {
					successfulRows?: number;
					failedRows?: number;
					status?: "processing" | "completed" | "failed";
					error?: string;
					rejectFileName?: string;
				};

				setImportSuccessCount(payload.successfulRows ?? 0);
				setImportFailedCount(payload.failedRows ?? 0);

				if (payload.status === "completed") {
					setRejectFileName(payload.rejectFileName ?? null);
				}

				if (payload.status === "failed") {
					throw new Error(payload.error ?? "Import failed.");
				}
			};

			while (true) {
				const { done, value } = await reader.read();

				if (done) {
					break;
				}

				pendingChunk += decoder.decode(value, { stream: true });
				const events = pendingChunk.split("\n\n");
				pendingChunk = events.pop() ?? "";

				for (const event of events) {
					processEvent(event);
				}
			}

			const trailingEvent = pendingChunk.trim();

			if (trailingEvent) {
				processEvent(trailingEvent);
			}
		},
		onMutate: () => {
			setImportSuccessCount(0);
			setImportFailedCount(0);
			setRejectFileName(null);
		},
		onSuccess: () => {
			schemaQuery.refetch();
			toast.success("Import completed", {
				description: `Imported ${importSuccessCount} rows successfully.`,
			});
		},
		onError: (error) => {
			toast.error("Import failed", {
				description: error instanceof Error ? error.message : "Unknown error",
			});
		},
	});

	const schemaData = schemaQuery.data;
	const schemaError =
		schemaData && "error" in schemaData ? schemaData.error : null;
	const tables = schemaData && Array.isArray(schemaData) ? schemaData : [];
	const selectedTableData = tables.find(
		(table) => table.tableName === selectedTable,
	);
	const selectedTableColumns = selectedTableData?.columns ?? [];

	const isDumping = dumpMutation.isPending;
	const isWipingAllData = wipeAllDataMutation.isPending;
	const isDroppingAllTables = dropAllTablesMutation.isPending;
	const isRestoringDump = restoreDumpMutation.isPending;
	const isSeeding = seedMutation.isPending;
	const isImporting = importMutation.isPending;

	const isMappingReady =
		csvHeaders.length > 0 &&
		csvHeaders.every((header) => Boolean(columnMapping[header]));

	// Auto-map CSV headers to table columns when drawer opens or table changes
	useEffect(() => {
		if (!selectedTable || csvHeaders.length === 0) {
			return;
		}

		const tableColumns =
			tables.find((table) => table.tableName === selectedTable)?.columns ?? [];

		if (tableColumns.length === 0) {
			setColumnMapping({});
			return;
		}

		const normalizedColumnLookup = new Map<string, string>();

		for (const column of tableColumns) {
			normalizedColumnLookup.set(normalizeColumnName(column.name), column.name);
		}

		const autoMapping: Record<string, string> = {};

		for (const header of csvHeaders) {
			const matchedColumn = normalizedColumnLookup.get(
				normalizeColumnName(header),
			);

			if (matchedColumn) {
				autoMapping[header] = matchedColumn;
			}
		}

		setColumnMapping(autoMapping);
	}, [csvHeaders, selectedTable, tables]);

	const handleCsvFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
		const nextFile = event.target.files?.[0] ?? null;

		setCsvFile(nextFile);
		setColumnMapping({});

		if (!nextFile) {
			setCsvHeaders([]);
			return;
		}

		const preview = await nextFile.slice(0, 1024).text();
		const [firstLine = ""] = preview.split("\n");
		const normalizedLine = firstLine.replace(/\r$/, "").trim();

		if (normalizedLine === "") {
			setCsvHeaders([]);
			return;
		}

		const commaCount = (normalizedLine.match(/,/g) ?? []).length;
		const semicolonCount = (normalizedLine.match(/;/g) ?? []).length;
		const delimiter = semicolonCount > commaCount ? ";" : ",";

		const headers = normalizedLine
			.split(delimiter)
			.map((header) => header.trim())
			.filter((header) => header !== "");

		setCsvHeaders(headers);
	};

	const handleImport = async () => {
		if (!csvFile || !selectedTable || !activeConnection || !isMappingReady) {
			return;
		}

		importMutation.mutate({
			file: csvFile,
			connectionId: activeConnection.id,
			tableName: selectedTable,
			mapping: columnMapping,
		});
	};

	const resetImportDrawer = () => {
		setCsvFile(null);
		setCsvHeaders([]);
		setColumnMapping({});
		setImportSuccessCount(0);
		setImportFailedCount(0);
		setRejectFileName(null);
		importMutation.reset();

		if (csvFileInputRef.current) {
			csvFileInputRef.current.value = "";
		}
	};

	const openImportDrawer = () => {
		resetImportDrawer();
		setIsImportDrawerOpen(true);
	};

	if (!isHydrated) {
		return <Loader />;
	}

	if (!activeConnection) {
		return (
			<section className="mx-auto flex min-h-screen w-full items-center justify-center p-6 md:p-10 font-mono">
				<div className="bg-card border-2 border-border p-6 shadow-hardware w-full max-w-md">
					<h2 className="text-2xl font-black uppercase tracking-wider text-primary mb-4">
						No active connection.
					</h2>
					<p className="text-muted-foreground font-bold mb-6">
						Select a saved connection to explore its schema.
					</p>
					<Button asChild>
						<Link to="/">Back to connections</Link>
					</Button>
				</div>
			</section>
		);
	}

	return (
		<section className="mx-auto flex min-h-screen w-full flex-col gap-6 p-6 md:p-10 font-mono">
			{/* Header */}
			<div className="bg-card border-2 border-border p-6 shadow-hardware w-full">
				<h1 className="text-3xl font-black uppercase tracking-wider text-primary">
					SCHEMA_EXPLORER
				</h1>
				<div className="flex items-center gap-3 mt-2">
					<div className="w-3 h-3 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(255,150,0,0.8)]" />
					<p className="text-sm font-bold uppercase tracking-widest text-primary">
						STATUS: ONLINE
					</p>
					<span className="text-muted-foreground">|</span>
					<p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
						{activeConnection.name}
					</p>
				</div>
			</div>

			{/* Actions Bar */}
			<div className="bg-card border-2 border-border p-4 shadow-hardware">
				<div className="flex flex-wrap items-center gap-3">
					<div className="flex items-center gap-2 bg-secondary p-2 border-2 border-border">
						<Select
							value={schemaExportFormat}
							onValueChange={(value) => {
								setSchemaExportFormat(value as "json" | "dbml" | "sql");
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
								className=" hover:bg-neutral-600! text-foreground!"
							>
								Export Schema
							</a>
						</Button>
					</div>

					<div className="flex items-center gap-2 bg-secondary p-2 border-2 border-border">
						<Select
							value={dumpType}
							onValueChange={(value) => {
								setDumpType(value as "data" | "both");
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

									<Button
										type="button"
										variant="outline"
										className="shadow-hardware active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-none"
										onClick={openImportDrawer}
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
							className="rounded-none border-2 border-primary shadow-hardware active:translate-x-0.5 active:translate-y-0.5 active:shadow-none font-bold uppercase bg-primary text-primary-foreground hover:bg-primary/90"
						>
							{isRestoringDump ? (
								<Loader2 className="animate-spin w-4 h-4 mr-2" />
							) : null}
							{isRestoringDump ? "Restoring..." : "Execute Restore"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* CSV Import Drawer */}
			<Drawer open={isImportDrawerOpen} onOpenChange={setIsImportDrawerOpen}>
				<DrawerContent className="w-[40%]">
					<DrawerHeader>
						<DrawerTitle>
							<Upload className="w-5 h-5 inline-block mr-2" />
							Import CSV to {selectedTable}
						</DrawerTitle>
						<DrawerDescription>
							Map CSV columns to database columns
						</DrawerDescription>
					</DrawerHeader>

					<DrawerBody>
						{/* File Upload */}
						<div className="mb-6">
							<p className="text-xs font-black uppercase tracking-widest mb-2 text-muted-foreground">
								1. Select CSV File
							</p>
							<div className="border-4 border-dashed border-border bg-secondary p-6 text-center relative hover:bg-muted transition-colors">
								<Input
									ref={csvFileInputRef}
									type="file"
									accept=".csv"
									onChange={handleCsvFileChange}
									className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
								/>
								<p className="text-sm font-black uppercase tracking-widest text-muted-foreground pointer-events-none">
									{csvFile ? csvFile.name : "Click or drag file here"}
								</p>
							</div>
						</div>

						{/* Column Mapping */}
						{csvFile && csvHeaders.length > 0 ? (
							<div className="mb-6">
								<p className="text-xs font-black uppercase tracking-widest mb-2 text-muted-foreground">
									2. Map Columns
								</p>
								<div className="grid grid-cols-2 gap-2 border-b-2 border-border pb-2 text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">
									<span>CSV Header</span>
									<span>DB Column</span>
								</div>
								<div className="space-y-3 overflow-y-auto">
									{csvHeaders.map((header) => (
										<div
											key={header}
											className="grid grid-cols-2 gap-3 items-center bg-secondary border-2 border-border p-3"
										>
											<p className="truncate text-sm font-bold text-foreground">
												{header}
											</p>
											<Select
												value={columnMapping[header] ?? ""}
												onValueChange={(value) => {
													setColumnMapping((prev) => ({
														...prev,
														[header]: value,
													}));
												}}
											>
												<SelectTrigger className="w-full rounded-none border-2 border-border bg-card shadow-hardware font-bold h-9 text-foreground text-sm">
													<SelectValue placeholder="Select" />
												</SelectTrigger>
												<SelectContent className="rounded-none border-2 border-primary shadow-hardware font-mono bg-card">
													{selectedTableColumns.map((column) => (
														<SelectItem
															key={column.name}
															value={column.name}
															className="rounded-none cursor-pointer focus:bg-primary focus:text-primary-foreground font-bold uppercase text-sm"
														>
															{column.name}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									))}
								</div>
							</div>
						) : null}

						{/* Import Progress */}
						{importMutation.isPending || importMutation.isSuccess ? (
							<div className="mb-6 bg-secondary border-2 border-border p-4">
								<p className="text-xs font-black uppercase tracking-widest mb-3 text-muted-foreground">
									Import Progress
								</p>
								<div className="flex justify-between font-bold uppercase tracking-widest text-sm text-foreground mb-2">
									<span>Inserted</span>
									<span className="text-primary">{importSuccessCount}</span>
								</div>
								<div className="flex justify-between font-bold uppercase tracking-widest text-sm text-foreground mb-2">
									<span>Failed</span>
									<span className="text-destructive">{importFailedCount}</span>
								</div>
								<div className="w-full h-6 bg-card border-2 border-border mt-2 relative overflow-hidden">
									<div
										className="h-full bg-primary transition-all duration-300"
										style={{
											width:
												importSuccessCount + importFailedCount > 0
													? `${(importSuccessCount / (importSuccessCount + importFailedCount)) * 100}%`
													: "0%",
											backgroundImage:
												"linear-gradient(90deg, transparent 50%, rgba(0,0,0,0.5) 50%)",
											backgroundSize: "10px 100%",
										}}
									/>
								</div>

								{importMutation.isSuccess &&
								importFailedCount > 0 &&
								rejectFileName ? (
									<Button variant="destructive" className="mt-4 w-full" asChild>
										<a
											href={`/api/download-reject?fileName=${encodeURIComponent(rejectFileName)}`}
										>
											Download Rejects
										</a>
									</Button>
								) : null}
							</div>
						) : null}
					</DrawerBody>

					<DrawerFooter>
						{importMutation.isSuccess ? (
							<>
								<Button
									type="button"
									onClick={() => {
										resetImportDrawer();
									}}
								>
									Import Another File
								</Button>
								<DrawerClose asChild>
									<Button type="button" variant="outline">
										Close
									</Button>
								</DrawerClose>
							</>
						) : (
							<>
								<Button
									type="button"
									variant="accent"
									onClick={handleImport}
									disabled={!csvFile || !isMappingReady || isImporting}
									className="flex items-center gap-2"
								>
									{isImporting ? (
										<Loader2 className="animate-spin w-4 h-4" />
									) : (
										<Zap className="w-4 h-4" />
									)}
									{isImporting ? "Importing..." : "Start Import"}
								</Button>
								<DrawerClose asChild>
									<Button type="button" variant="outline">
										Cancel
									</Button>
								</DrawerClose>
							</>
						)}
					</DrawerFooter>
				</DrawerContent>
			</Drawer>
		</section>
	);
}
