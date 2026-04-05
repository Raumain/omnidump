import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Loader2 } from "lucide-react";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import Loader from "@/components/Loader.tsx";
import { NoConnectionState } from "@/components/NoConnectionState";
import { useActiveConnection } from "@/hooks/use-active-connection.tsx";
import {
	clearTableDataFn,
	dropAllTablesFn,
	getAvailableDumpsFn,
	getDatabaseSchemaFn,
	restoreDumpFn,
	wipeAllDataFn,
} from "@/server/schema-fns";

import { ActionsBar } from "./_schema/components/ActionsBar";
import { ImportDrawer } from "./_schema/components/ImportDrawer";
import { RestoreModal } from "./_schema/components/RestoreModal";
import { SchemaHeader } from "./_schema/components/SchemaHeader";
import {
	TableDetail,
	TableDetailEmpty,
} from "./_schema/components/TableDetail";
import { TableList } from "./_schema/components/TableList";

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
			<NoConnectionState
				title="No active connection."
				message="Select a saved connection to explore its schema."
			/>
		);
	}

	return (
		<section className="mx-auto flex min-h-screen w-full flex-col gap-6 p-6 md:p-10 font-mono">
			<SchemaHeader connectionName={activeConnection.name} />

			<ActionsBar
				connectionId={activeConnection.id}
				schemaExportFormat={schemaExportFormat}
				dumpType={dumpType}
				isDumping={dumpMutation.isPending}
				isWipingAllData={wipeAllDataMutation.isPending}
				isDroppingAllTables={dropAllTablesMutation.isPending}
				isClearingTable={clearTableMutation.isPending}
				isRestoringDump={restoreDumpMutation.isPending}
				isSeeding={seedMutation.isPending}
				onSchemaExportFormatChange={setSchemaExportFormat}
				onDumpTypeChange={setDumpType}
				onDump={() => dumpMutation.mutate()}
				onOpenRestoreModal={() => setIsRestoreModalOpen(true)}
				onWipeAllData={() => wipeAllDataMutation.mutate()}
				onDropAllTables={() => dropAllTablesMutation.mutate()}
			/>

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
					<TableList
						tables={tables}
						selectedTable={selectedTable}
						isRefetching={schemaQuery.isRefetching}
						onSelectTable={setSelectedTable}
						onRefresh={() => schemaQuery.refetch()}
					/>

					{/* Table Detail (Inspector View) */}
					<div className="lg:col-span-2 bg-card border-2 border-border shadow-hardware">
						{selectedTableData ? (
							<TableDetail
								tableName={selectedTableData.tableName}
								columns={selectedTableData.columns}
								seedCount={seedCount}
								isSeeding={seedMutation.isPending}
								isClearingTable={clearTableMutation.isPending}
								isImporting={importMutation.isPending}
								onSeedCountChange={setSeedCount}
								onSeed={(tableName, count) =>
									seedMutation.mutate({ tableName, count })
								}
								onOpenImportDrawer={openImportDrawer}
								onClearTable={(tableName) =>
									clearTableMutation.mutate(tableName)
								}
							/>
						) : (
							<TableDetailEmpty />
						)}
					</div>
				</div>
			) : null}

			<RestoreModal
				isOpen={isRestoreModalOpen}
				dumps={dumpsQuery.data ?? []}
				selectedDump={selectedDump}
				isRestoring={restoreDumpMutation.isPending}
				onOpenChange={setIsRestoreModalOpen}
				onSelectDump={setSelectedDump}
				onRestore={() => {
					if (selectedDump) {
						restoreDumpMutation.mutate(selectedDump);
					}
				}}
			/>

			<ImportDrawer
				isOpen={isImportDrawerOpen}
				selectedTable={selectedTable}
				tableColumns={selectedTableColumns}
				csvFile={csvFile}
				csvHeaders={csvHeaders}
				columnMapping={columnMapping}
				importSuccessCount={importSuccessCount}
				importFailedCount={importFailedCount}
				rejectFileName={rejectFileName}
				isImporting={importMutation.isPending}
				isImportSuccess={importMutation.isSuccess}
				isMappingReady={isMappingReady}
				csvFileInputRef={csvFileInputRef}
				onOpenChange={setIsImportDrawerOpen}
				onCsvFileChange={handleCsvFileChange}
				onColumnMappingChange={(header, column) => {
					setColumnMapping((prev) => ({
						...prev,
						[header]: column,
					}));
				}}
				onImport={handleImport}
				onReset={resetImportDrawer}
			/>
		</section>
	);
}
