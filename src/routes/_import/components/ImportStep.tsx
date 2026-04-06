import { AlertTriangle, Check, X, Zap } from "lucide-react";
import { useState } from "react";

import { Button } from "#/components/ui/button";
import type {
	BatchImportProgressEvent,
	CsvColumnDef,
	CsvFileConfig,
	ForeignKeyDef,
	ImportProgress,
	TableImportProgress,
	TableWritePolicy,
} from "#/lib/csv-import-types";
import { extractErrorMessage } from "#/lib/errors";
import { createTableFn } from "#/server/csv-import-fns";

type ImportStepProps = {
	csvFiles: CsvFileConfig[];
	relationships: ForeignKeyDef[];
	connectionId: number;
	importProgress: ImportProgress;
	onProgressUpdate: (progress: ImportProgress) => void;
	setErrorMessage: (msg: string | null) => void;
};

export function ImportStep({
	csvFiles,
	relationships,
	connectionId,
	importProgress,
	onProgressUpdate,
	setErrorMessage,
}: ImportStepProps) {
	const [isImporting, setIsImporting] = useState(false);

	const buildAdvancedCreateColumns = (
		csv: CsvFileConfig,
		policy: TableWritePolicy,
	): CsvColumnDef[] => {
		const sourceColumnsByName = new Map(
			csv.columns.map((column) => [column.name, column]),
		);
		const tableColumns = new Map<string, CsvColumnDef>();

		for (const [header, target] of Object.entries(csv.advancedMapping)) {
			if (!target || target.tableName !== policy.tableName) {
				continue;
			}

			const sourceColumn = sourceColumnsByName.get(header);
			if (!sourceColumn) {
				continue;
			}

			if (!tableColumns.has(target.columnName)) {
				tableColumns.set(target.columnName, {
					...sourceColumn,
					name: target.columnName,
				});
			}
		}

		return Array.from(tableColumns.values());
	};

	const collectPlannedTableNames = (): string[] => {
		const names = new Set<string>();

		for (const csv of csvFiles) {
			if (csv.importMode === "simple") {
				if (csv.tableName.trim() !== "") {
					names.add(csv.tableName.trim());
				}
				continue;
			}

			for (const policy of csv.tablePolicies) {
				if (policy.tableName.trim() !== "") {
					names.add(policy.tableName.trim());
				}
			}
		}

		return Array.from(names);
	};

	const startImport = async () => {
		setIsImporting(true);

		const plannedTableNames = collectPlannedTableNames();
		const tableIndexByName = new Map(
			plannedTableNames.map((tableName, index) => [tableName, index]),
		);
		const workingTables: TableImportProgress[] = plannedTableNames.map(
			(tableName, index) => ({
				tableIndex: index,
				tableName,
				status: "pending",
				totalRows: 0,
				insertedRows: 0,
				failedRows: 0,
			}),
		);

		onProgressUpdate({
			status: "running",
			tables: workingTables,
			currentTableIndex: workingTables.length > 0 ? 0 : -1,
		});

		try {
			const createdTables = new Set<string>();

			for (const csv of csvFiles) {
				if (csv.importMode === "simple") {
					if (csv.tableMode !== "create" || csv.tableName.trim() === "") {
						continue;
					}

					if (createdTables.has(csv.tableName)) {
						continue;
					}

					const tableIndex = tableIndexByName.get(csv.tableName) ?? -1;
					if (tableIndex >= 0) {
						workingTables[tableIndex] = {
							...workingTables[tableIndex],
							status: "creating",
						};
					}

					onProgressUpdate({
						status: "running",
						tables: [...workingTables],
						currentTableIndex: tableIndex,
					});

					const result = await createTableFn({
						data: {
							connectionId,
							tableName: csv.tableName,
							columns: csv.columns,
							primaryKeyColumn: csv.primaryKeyColumn,
						},
					});

					if (!result.success) {
						const errorMessage = `Failed to create table ${csv.tableName}: ${result.error}`;
						if (tableIndex >= 0) {
							workingTables[tableIndex] = {
								...workingTables[tableIndex],
								status: "failed",
								error: errorMessage,
							};
						}
						onProgressUpdate({
							status: "failed",
							tables: [...workingTables],
							currentTableIndex: tableIndex,
							error: errorMessage,
						});
						setErrorMessage(errorMessage);
						return;
					}

					createdTables.add(csv.tableName);
					continue;
				}

				for (const policy of csv.tablePolicies) {
					if (
						policy.tableMode !== "create" ||
						policy.tableName.trim() === "" ||
						createdTables.has(policy.tableName)
					) {
						continue;
					}

					const columns = buildAdvancedCreateColumns(csv, policy);
					if (columns.length === 0) {
						const errorMessage = `No routed columns found for new table ${policy.tableName}.`;
						const tableIndex = tableIndexByName.get(policy.tableName) ?? -1;
						if (tableIndex >= 0) {
							workingTables[tableIndex] = {
								...workingTables[tableIndex],
								status: "failed",
								error: errorMessage,
							};
						}
						onProgressUpdate({
							status: "failed",
							tables: [...workingTables],
							currentTableIndex: tableIndex,
							error: errorMessage,
						});
						setErrorMessage(errorMessage);
						return;
					}

					const tableIndex = tableIndexByName.get(policy.tableName) ?? -1;
					if (tableIndex >= 0) {
						workingTables[tableIndex] = {
							...workingTables[tableIndex],
							status: "creating",
						};
					}
					onProgressUpdate({
						status: "running",
						tables: [...workingTables],
						currentTableIndex: tableIndex,
					});

					const result = await createTableFn({
						data: {
							connectionId,
							tableName: policy.tableName,
							columns,
							primaryKeyColumn: policy.primaryKeyColumn,
						},
					});

					if (!result.success) {
						const errorMessage = `Failed to create table ${policy.tableName}: ${result.error}`;
						if (tableIndex >= 0) {
							workingTables[tableIndex] = {
								...workingTables[tableIndex],
								status: "failed",
								error: errorMessage,
							};
						}
						onProgressUpdate({
							status: "failed",
							tables: [...workingTables],
							currentTableIndex: tableIndex,
							error: errorMessage,
						});
						setErrorMessage(errorMessage);
						return;
					}

					createdTables.add(policy.tableName);
				}
			}

			const payload = {
				files: csvFiles.map((csv) => ({
					fileName: csv.fileName,
					columns: csv.columns,
					importMode: csv.importMode,
					simpleConfig:
						csv.importMode === "simple"
							? {
									tableName: csv.tableName,
									tableMode: csv.tableMode,
									writeMode: "insert" as const,
									conflictColumns: [],
									primaryKeyColumn: csv.primaryKeyColumn,
									mapping:
										csv.tableMode === "create"
											? Object.fromEntries(
													csv.columns.map((column) => [
														column.name,
														column.name,
													]),
												)
											: csv.mapping,
								}
							: undefined,
					advancedConfig:
						csv.importMode === "advanced"
							? {
									columnTargets: csv.advancedMapping,
									tablePolicies: csv.tablePolicies,
									rowLinkStrategy: csv.rowLinkStrategy,
								}
							: undefined,
				})),
				relationships,
			};

			const formData = new FormData();
			formData.append("connectionId", String(connectionId));
			formData.append("payload", JSON.stringify(payload));
			for (const csv of csvFiles) {
				formData.append("files", csv.file);
			}

			const response = await fetch("/api/batch-import", {
				method: "POST",
				body: formData,
			});

			if (!response.ok) {
				const errorData = (await response.json().catch(() => null)) as {
					error?: string;
				} | null;
				throw new Error(errorData?.error ?? "Batch import failed.");
			}

			const reader = response.body?.getReader();
			const decoder = new TextDecoder();
			if (!reader) {
				throw new Error("Batch import stream is unavailable.");
			}

			let pendingChunk = "";
			let completed = false;

			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}

				pendingChunk += decoder.decode(value, { stream: true });
				const events = pendingChunk.split("\n\n");
				pendingChunk = events.pop() ?? "";

				for (const event of events) {
					const dataLine = event
						.split("\n")
						.find((line) => line.startsWith("data: "));

					if (!dataLine) {
						continue;
					}

					const payload = JSON.parse(
						dataLine.slice(6),
					) as BatchImportProgressEvent;
					const tableIndex =
						payload.tableIndex ??
						(payload.tableName
							? (tableIndexByName.get(payload.tableName) ?? -1)
							: -1);

					if (payload.type === "error") {
						throw new Error(payload.error ?? "Batch import failed.");
					}

					if (payload.type === "table_start" && tableIndex >= 0) {
						workingTables[tableIndex] = {
							...workingTables[tableIndex],
							status: "importing",
						};
					}

					if (payload.type === "table_progress" && tableIndex >= 0) {
						workingTables[tableIndex] = {
							...workingTables[tableIndex],
							status: "importing",
							insertedRows:
								payload.insertedRows ?? workingTables[tableIndex].insertedRows,
							failedRows:
								payload.failedRows ?? workingTables[tableIndex].failedRows,
							totalRows:
								payload.totalRows ?? workingTables[tableIndex].totalRows,
						};
					}

					if (payload.type === "table_complete" && tableIndex >= 0) {
						const nextFailedRows =
							payload.failedRows ?? workingTables[tableIndex].failedRows;
						workingTables[tableIndex] = {
							...workingTables[tableIndex],
							status:
								nextFailedRows > 0 ? "completed_with_errors" : "completed",
							insertedRows:
								payload.insertedRows ?? workingTables[tableIndex].insertedRows,
							failedRows: nextFailedRows,
							totalRows:
								payload.totalRows ?? workingTables[tableIndex].totalRows,
							rejectFileName: payload.rejectFileName,
						};
					}

					if (payload.type === "table_error" && tableIndex >= 0) {
						workingTables[tableIndex] = {
							...workingTables[tableIndex],
							status: "importing",
							insertedRows:
								payload.insertedRows ?? workingTables[tableIndex].insertedRows,
							failedRows:
								payload.failedRows ?? workingTables[tableIndex].failedRows,
							totalRows:
								payload.totalRows ?? workingTables[tableIndex].totalRows,
							error: payload.error ?? workingTables[tableIndex].error,
						};
					}

					onProgressUpdate({
						status: "running",
						tables: [...workingTables],
						currentTableIndex: tableIndex >= 0 ? tableIndex : -1,
					});

					if (payload.type === "complete") {
						completed = true;
						const hasFatalFailedTables = workingTables.some(
							(table) => table.status === "failed",
						);
						const hasRejectedRows = workingTables.some(
							(table) => table.failedRows > 0,
						);

						onProgressUpdate({
							status: hasFatalFailedTables
								? "failed"
								: hasRejectedRows
									? "completed_with_errors"
									: "completed",
							tables: [...workingTables],
							currentTableIndex:
								workingTables.length > 0 ? workingTables.length - 1 : -1,
							error: payload.error,
						});
					}
				}
			}

			if (!completed) {
				const hasFatalFailedTables = workingTables.some(
					(table) => table.status === "failed",
				);
				const hasRejectedRows = workingTables.some(
					(table) => table.failedRows > 0,
				);
				onProgressUpdate({
					status: hasFatalFailedTables
						? "failed"
						: hasRejectedRows
							? "completed_with_errors"
							: "completed",
					tables: [...workingTables],
					currentTableIndex:
						workingTables.length > 0 ? workingTables.length - 1 : -1,
				});
			}
		} catch (error) {
			const message = extractErrorMessage(error, "Batch import failed.");
			setErrorMessage(message);
			onProgressUpdate({
				status: "failed",
				tables: [...workingTables],
				currentTableIndex:
					workingTables.length > 0 ? workingTables.length - 1 : -1,
				error: message,
			});
		} finally {
			setIsImporting(false);
		}
	};

	const totalInserted = importProgress.tables.reduce(
		(sum, t) => sum + t.insertedRows,
		0,
	);
	const totalFailed = importProgress.tables.reduce(
		(sum, t) => sum + t.failedRows,
		0,
	);

	return (
		<div className="space-y-6">
			<div className="bg-card border-2 border-border p-6 shadow-hardware">
				<h2 className="text-xl font-black uppercase tracking-wider text-foreground mb-4 border-b-4 border-border pb-4">
					4. IMPORT EXECUTION
				</h2>
				<p className="mb-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
					Rows are processed transactionally. If a child table write fails, the
					entire row is rolled back and written to rejects.
				</p>

				{importProgress.status === "idle" && (
					<div className="text-center py-12">
						<Zap className="w-16 h-16 mx-auto mb-4 text-primary" />
						<p className="font-bold uppercase text-lg mb-2">
							READY TO IMPORT {csvFiles.length} TABLE
							{csvFiles.length !== 1 ? "S" : ""}
						</p>
						<p className="text-muted-foreground mb-6">
							Click the button below to start the import process
						</p>
						<Button
							variant="accent"
							size="xl"
							onClick={startImport}
							disabled={isImporting}
							className="gap-3"
						>
							<Zap className="w-6 h-6" />
							START IMPORT
						</Button>
					</div>
				)}

				{importProgress.status !== "idle" && (
					<div className="space-y-6">
						<div className="flex justify-between items-center p-4 bg-secondary border-2 border-border">
							<div className="flex items-center gap-4">
								{importProgress.status === "running" && (
									<div className="w-4 h-4 rounded-full bg-primary animate-pulse" />
								)}
								{importProgress.status === "completed" && (
									<Check className="w-6 h-6 text-primary" />
								)}
								{importProgress.status === "completed_with_errors" && (
									<AlertTriangle className="w-6 h-6 text-amber-500" />
								)}
								{importProgress.status === "failed" && (
									<AlertTriangle className="w-6 h-6 text-destructive" />
								)}
								<span className="font-black uppercase">
									{importProgress.status === "running" && "IMPORTING..."}
									{importProgress.status === "completed" && "IMPORT COMPLETE"}
									{importProgress.status === "completed_with_errors" &&
										"IMPORT COMPLETE WITH REJECTS"}
									{importProgress.status === "failed" && "IMPORT FAILED"}
								</span>
							</div>
							<div className="flex gap-6 font-bold">
								<span className="text-primary">{totalInserted} inserted</span>
								<span className="text-destructive">{totalFailed} failed</span>
							</div>
						</div>

						<div className="space-y-3">
							{importProgress.tables.map((table) => (
								<div
									key={table.tableName}
									className="p-4 bg-secondary border-2 border-border space-y-2"
								>
									<div className="flex items-center justify-between">
										<div className="flex items-center gap-3">
											{table.status === "pending" && (
												<div className="w-3 h-3 rounded-full bg-muted-foreground" />
											)}
											{(table.status === "creating" ||
												table.status === "importing") && (
												<div className="w-3 h-3 rounded-full bg-primary animate-pulse" />
											)}
											{table.status === "completed" && (
												<Check className="w-4 h-4 text-primary" />
											)}
											{table.status === "completed_with_errors" && (
												<AlertTriangle className="w-4 h-4 text-amber-500" />
											)}
											{table.status === "failed" && (
												<X className="w-4 h-4 text-destructive" />
											)}
											<span className="font-bold">{table.tableName}</span>
											<span className="text-sm text-muted-foreground uppercase">
												{table.status}
											</span>
										</div>
										<div className="flex gap-4 text-sm font-bold">
											<span className="text-primary">{table.insertedRows}</span>
											<span className="text-destructive">
												{table.failedRows}
											</span>
										</div>
									</div>

									<div className="w-full h-2 bg-muted border border-border overflow-hidden">
										<div
											className="h-full bg-primary transition-all duration-300"
											style={{
												width:
													table.totalRows > 0
														? `${((table.insertedRows + table.failedRows) / table.totalRows) * 100}%`
														: "0%",
											}}
										/>
									</div>

									{table.rejectFileName && table.failedRows > 0 && (
										<Button variant="destructive" size="xs" asChild>
											<a
												href={`/api/download-reject?fileName=${encodeURIComponent(table.rejectFileName)}`}
											>
												Download Rejects
											</a>
										</Button>
									)}
									{table.error ? (
										<p className="text-xs font-bold uppercase text-amber-600">
											Last rejection: {table.error}
										</p>
									) : null}
								</div>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
