import { ChevronDown, FileSpreadsheet, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import {
	autoMatchColumns,
	type ColumnTarget,
	type CsvColumnDef,
	type CsvFileConfig,
	fileNameToTableName,
	generateId,
	getMappedTargetTables,
	type ImportMode,
	type InferredColumnType,
	type RowLinkStrategy,
	syncTablePoliciesFromAdvancedMapping,
	type TableMode,
	type TableWriteMode,
	type TableWritePolicy,
} from "#/lib/csv-import-types";
import { cn } from "#/lib/utils";

import type { SchemaTable } from "../types";

const COLUMN_TYPES: InferredColumnType[] = [
	"TEXT",
	"INTEGER",
	"DECIMAL",
	"BOOLEAN",
	"DATE",
	"TIMESTAMP",
	"UUID",
	"EMAIL",
];

const TABLE_WRITE_MODES: TableWriteMode[] = ["insert", "upsert"];

type ConfigureStepProps = {
	csvFiles: CsvFileConfig[];
	onUpdate: (files: CsvFileConfig[]) => void;
	existingTables: SchemaTable[];
	schemaLoading: boolean;
	schemaError: string | null;
};

export function ConfigureStep({
	csvFiles,
	onUpdate,
	existingTables,
	schemaLoading,
	schemaError,
}: ConfigureStepProps) {
	const [expandedId, setExpandedId] = useState<string | null>(
		csvFiles[0]?.id ?? null,
	);
	const existingTableNames = existingTables.map((table) => table.tableName);

	const updateFile = (id: string, updates: Partial<CsvFileConfig>) => {
		onUpdate(csvFiles.map((f) => (f.id === id ? { ...f, ...updates } : f)));
	};

	const updateImportMode = (id: string, importMode: ImportMode) => {
		updateFile(id, { importMode });
	};

	const handleTableModeChange = (id: string, mode: TableMode) => {
		const file = csvFiles.find((f) => f.id === id);
		if (!file || file.importMode !== "simple") return;

		let mapping: Record<string, string> = {};
		if (mode === "map" && existingTables.length > 0) {
			const targetTable = existingTables[0];
			mapping = autoMatchColumns(
				file.headers,
				targetTable.columns.map((c) => c.name),
			);
			updateFile(id, {
				tableMode: mode,
				tableName: targetTable.tableName,
				mapping,
			});
		} else {
			updateFile(id, {
				tableMode: mode,
				tableName: mode === "create" ? fileNameToTableName(file.fileName) : "",
				mapping: {},
			});
		}
	};

	const handleTargetTableChange = (id: string, tableName: string) => {
		const file = csvFiles.find((f) => f.id === id);
		if (!file || file.importMode !== "simple") return;
		const table = existingTables.find((t) => t.tableName === tableName);
		if (!table) return;

		const mapping = autoMatchColumns(
			file.headers,
			table.columns.map((c) => c.name),
		);
		updateFile(id, { tableName, mapping });
	};

	const handleAdvancedTargetChange = (
		id: string,
		header: string,
		target: ColumnTarget | null,
	) => {
		const file = csvFiles.find((f) => f.id === id);
		if (!file) {
			return;
		}

		const nextAdvancedMapping = {
			...file.advancedMapping,
			[header]: target,
		};

		const nextPolicies = syncTablePoliciesFromAdvancedMapping(
			file.tablePolicies,
			nextAdvancedMapping,
			existingTableNames,
		);
		const sanitizedPolicies = nextPolicies.map((policy) => {
			const routedColumns = new Set(
				Object.values(nextAdvancedMapping)
					.filter(
						(target): target is ColumnTarget =>
							target !== null && target.tableName === policy.tableName,
					)
					.map((target) => target.columnName),
			);

			return {
				...policy,
				conflictColumns:
					policy.writeMode === "upsert"
						? policy.conflictColumns.filter((column) =>
								routedColumns.has(column),
							)
						: [],
			};
		});

		updateFile(id, {
			advancedMapping: nextAdvancedMapping,
			tablePolicies: sanitizedPolicies,
		});
	};

	const handleTablePolicyChange = (
		id: string,
		tableName: string,
		updates: Partial<TableWritePolicy>,
	) => {
		const file = csvFiles.find((f) => f.id === id);
		if (!file) {
			return;
		}

		const routedColumnsForTable = new Set(
			Object.values(file.advancedMapping)
				.filter(
					(target): target is ColumnTarget =>
						target !== null && target.tableName === tableName,
				)
				.map((target) => target.columnName),
		);

		const normalizedConflictColumns =
			updates.writeMode === "insert"
				? []
				: (updates.conflictColumns ?? []).filter((column) =>
						routedColumnsForTable.has(column),
					);

		const nextPolicies = file.tablePolicies.map((policy) =>
			policy.tableName === tableName
				? {
						...policy,
						...updates,
						...(updates.conflictColumns !== undefined ||
						updates.writeMode !== undefined
							? { conflictColumns: normalizedConflictColumns }
							: {}),
					}
				: policy,
		);

		updateFile(id, { tablePolicies: nextPolicies });
	};

	const handleRowLinkStrategyModeChange = (
		id: string,
		mode: RowLinkStrategy["mode"],
	) => {
		const file = csvFiles.find((f) => f.id === id);
		if (!file) {
			return;
		}

		if (mode === "explicit_fk") {
			updateFile(id, { rowLinkStrategy: { mode: "explicit_fk", links: [] } });
			return;
		}

		updateFile(id, {
			rowLinkStrategy: {
				mode: "generated_id",
				links:
					file.rowLinkStrategy.mode === "generated_id"
						? file.rowLinkStrategy.links
						: [],
			},
		});
	};

	const addGeneratedLink = (id: string) => {
		const file = csvFiles.find((f) => f.id === id);
		if (!file) {
			return;
		}

		const tableNames = getMappedTargetTables(file.advancedMapping);
		const parentTable = tableNames[0] ?? "";
		const childTable = tableNames[1] ?? tableNames[0] ?? "";

		const link = {
			id: generateId(),
			parentTable,
			parentKeyColumn: "",
			childTable,
			childForeignKeyColumn: "",
		};

		const currentLinks =
			file.rowLinkStrategy.mode === "generated_id"
				? file.rowLinkStrategy.links
				: [];

		updateFile(id, {
			rowLinkStrategy: {
				mode: "generated_id",
				links: [...currentLinks, link],
			},
		});
	};

	const updateGeneratedLink = (
		id: string,
		linkId: string,
		updates: {
			parentTable?: string;
			parentKeyColumn?: string;
			childTable?: string;
			childForeignKeyColumn?: string;
		},
	) => {
		const file = csvFiles.find((f) => f.id === id);
		if (!file || file.rowLinkStrategy.mode !== "generated_id") {
			return;
		}

		updateFile(id, {
			rowLinkStrategy: {
				mode: "generated_id",
				links: file.rowLinkStrategy.links.map((link) =>
					link.id === linkId ? { ...link, ...updates } : link,
				),
			},
		});
	};

	const removeGeneratedLink = (id: string, linkId: string) => {
		const file = csvFiles.find((f) => f.id === id);
		if (!file || file.rowLinkStrategy.mode !== "generated_id") {
			return;
		}

		updateFile(id, {
			rowLinkStrategy: {
				mode: "generated_id",
				links: file.rowLinkStrategy.links.filter((link) => link.id !== linkId),
			},
		});
	};

	return (
		<div className="space-y-4">
			<div className="bg-card border-2 border-border p-6 shadow-hardware">
				<h2 className="text-xl font-black uppercase tracking-wider text-foreground mb-4 border-b-4 border-border pb-4">
					2. CONFIGURE TABLES
				</h2>

				{schemaLoading && (
					<p className="text-sm font-bold uppercase animate-pulse text-primary mb-4">
						Loading database schema...
					</p>
				)}

				{schemaError && (
					<p className="text-sm font-bold uppercase text-destructive mb-4">
						{schemaError}
					</p>
				)}

				<div className="space-y-4">
					{csvFiles.map((csv) => (
						<CsvConfigPanel
							key={csv.id}
							csv={csv}
							isExpanded={expandedId === csv.id}
							onToggle={() =>
								setExpandedId(expandedId === csv.id ? null : csv.id)
							}
							onUpdate={(updates) => updateFile(csv.id, updates)}
							onImportModeChange={(mode) => updateImportMode(csv.id, mode)}
							onTableModeChange={(mode) => handleTableModeChange(csv.id, mode)}
							onTargetTableChange={(tableName) =>
								handleTargetTableChange(csv.id, tableName)
							}
							onAdvancedTargetChange={(header, target) =>
								handleAdvancedTargetChange(csv.id, header, target)
							}
							onTablePolicyChange={(tableName, updates) =>
								handleTablePolicyChange(csv.id, tableName, updates)
							}
							onRowLinkStrategyModeChange={(mode) =>
								handleRowLinkStrategyModeChange(csv.id, mode)
							}
							onAddGeneratedLink={() => addGeneratedLink(csv.id)}
							onUpdateGeneratedLink={(linkId, updates) =>
								updateGeneratedLink(csv.id, linkId, updates)
							}
							onRemoveGeneratedLink={(linkId) =>
								removeGeneratedLink(csv.id, linkId)
							}
							existingTables={existingTables}
						/>
					))}
				</div>
			</div>
		</div>
	);
}

function CsvConfigPanel({
	csv,
	isExpanded,
	onToggle,
	onUpdate,
	onImportModeChange,
	onTableModeChange,
	onTargetTableChange,
	onAdvancedTargetChange,
	onTablePolicyChange,
	onRowLinkStrategyModeChange,
	onAddGeneratedLink,
	onUpdateGeneratedLink,
	onRemoveGeneratedLink,
	existingTables,
}: {
	csv: CsvFileConfig;
	isExpanded: boolean;
	onToggle: () => void;
	onUpdate: (updates: Partial<CsvFileConfig>) => void;
	onImportModeChange: (mode: ImportMode) => void;
	onTableModeChange: (mode: TableMode) => void;
	onTargetTableChange: (tableName: string) => void;
	onAdvancedTargetChange: (header: string, target: ColumnTarget | null) => void;
	onTablePolicyChange: (
		tableName: string,
		updates: Partial<TableWritePolicy>,
	) => void;
	onRowLinkStrategyModeChange: (mode: RowLinkStrategy["mode"]) => void;
	onAddGeneratedLink: () => void;
	onUpdateGeneratedLink: (
		linkId: string,
		updates: {
			parentTable?: string;
			parentKeyColumn?: string;
			childTable?: string;
			childForeignKeyColumn?: string;
		},
	) => void;
	onRemoveGeneratedLink: (linkId: string) => void;
	existingTables: SchemaTable[];
}) {
	const targetTable = existingTables.find((t) => t.tableName === csv.tableName);
	const mappedTargetTables = getMappedTargetTables(csv.advancedMapping);

	return (
		<div className="border-2 border-border bg-secondary">
			{/* Header */}
			<button
				type="button"
				onClick={onToggle}
				className="w-full flex items-center justify-between p-4 hover:bg-muted transition-colors"
			>
				<div className="flex items-center gap-3">
					<FileSpreadsheet className="w-5 h-5 text-primary" />
					<span className="font-bold">{csv.fileName}</span>
					<span className="text-sm text-muted-foreground">
						→ {csv.tableName || "(not configured)"}
					</span>
				</div>
				<ChevronDown
					className={cn(
						"w-5 h-5 transition-transform",
						isExpanded && "rotate-180",
					)}
				/>
			</button>

			{/* Content */}
			{isExpanded && (
				<div className="p-4 border-t-2 border-border space-y-6">
					{/* Import Mode Selection */}
					<div className="space-y-2">
						<span className="block text-sm font-bold uppercase">
							MAPPING MODE
						</span>
						<div className="flex gap-4">
							<Button
								variant={csv.importMode === "simple" ? "accent" : "outline"}
								onClick={() => onImportModeChange("simple")}
								className="flex-1"
							>
								SIMPLE (ONE TABLE)
							</Button>
							<Button
								variant={csv.importMode === "advanced" ? "accent" : "outline"}
								onClick={() => onImportModeChange("advanced")}
								className="flex-1"
							>
								ADVANCED (SPLIT ROW)
							</Button>
						</div>
					</div>

					{csv.importMode === "simple" ? (
						<>
							{/* Table Mode Selection */}
							<div className="flex gap-4">
								<Button
									variant={csv.tableMode === "create" ? "accent" : "outline"}
									onClick={() => onTableModeChange("create")}
									className="flex-1"
								>
									CREATE NEW TABLE
								</Button>
								<Button
									variant={csv.tableMode === "map" ? "accent" : "outline"}
									onClick={() => onTableModeChange("map")}
									className="flex-1"
									disabled={existingTables.length === 0}
								>
									MAP TO EXISTING
								</Button>
							</div>

							{/* Table Name / Selection */}
							{csv.tableMode === "create" ? (
								<div>
									<span className="block text-sm font-bold uppercase mb-2">
										TABLE NAME
									</span>
									<Input
										value={csv.tableName}
										onChange={(e) => onUpdate({ tableName: e.target.value })}
										placeholder="Enter table name"
										className="rounded-none border-2 border-border bg-card shadow-hardware font-bold h-10"
									/>
								</div>
							) : (
								<div>
									<span className="block text-sm font-bold uppercase mb-2">
										TARGET TABLE
									</span>
									<Select
										value={csv.tableName}
										onValueChange={onTargetTableChange}
									>
										<SelectTrigger className="w-full rounded-none border-2 border-border bg-card shadow-hardware font-bold h-10">
											<SelectValue placeholder="Select a table" />
										</SelectTrigger>
										<SelectContent className="rounded-none border-2 border-primary shadow-hardware font-mono bg-card">
											{existingTables.map((table) => (
												<SelectItem
													key={table.tableName}
													value={table.tableName}
													className="rounded-none cursor-pointer focus:bg-primary focus:text-primary-foreground font-bold uppercase"
												>
													{table.tableName}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							)}

							{/* Column Configuration */}
							{csv.tableMode === "create" ? (
								<ColumnTypeEditor
									columns={csv.columns}
									primaryKeyColumn={csv.primaryKeyColumn}
									onColumnsChange={(columns) => onUpdate({ columns })}
									onPrimaryKeyChange={(pk) =>
										onUpdate({ primaryKeyColumn: pk })
									}
								/>
							) : (
								<ColumnMappingEditor
									headers={csv.headers}
									mapping={csv.mapping}
									targetColumns={targetTable?.columns ?? []}
									onMappingChange={(mapping) => onUpdate({ mapping })}
								/>
							)}
						</>
					) : (
						<>
							<AdvancedColumnRoutingEditor
								headers={csv.headers}
								advancedMapping={csv.advancedMapping}
								existingTables={existingTables}
								onTargetChange={onAdvancedTargetChange}
							/>

							<TablePoliciesEditor
								tablePolicies={csv.tablePolicies}
								existingTables={existingTables}
								routedColumnsByTable={Object.values(csv.advancedMapping).reduce(
									(acc, target) => {
										if (!target) {
											return acc;
										}

										const existing = acc[target.tableName] ?? [];
										if (!existing.includes(target.columnName)) {
											acc[target.tableName] = [...existing, target.columnName];
										}

										return acc;
									},
									{} as Record<string, string[]>,
								)}
								onPolicyChange={onTablePolicyChange}
							/>

							<RowLinkStrategyEditor
								rowLinkStrategy={csv.rowLinkStrategy}
								tableNames={mappedTargetTables}
								existingTables={existingTables}
								onModeChange={onRowLinkStrategyModeChange}
								onAddLink={onAddGeneratedLink}
								onUpdateLink={onUpdateGeneratedLink}
								onRemoveLink={onRemoveGeneratedLink}
							/>
						</>
					)}
				</div>
			)}
		</div>
	);
}

function AdvancedColumnRoutingEditor({
	headers,
	advancedMapping,
	existingTables,
	onTargetChange,
}: {
	headers: string[];
	advancedMapping: Record<string, ColumnTarget | null>;
	existingTables: SchemaTable[];
	onTargetChange: (header: string, target: ColumnTarget | null) => void;
}) {
	return (
		<div>
			<span className="block text-sm font-bold uppercase mb-2">
				COLUMN ROUTING (CSV HEADER → TABLE.COLUMN)
			</span>
			<div className="border-2 border-border bg-card">
				<div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-3 p-3 border-b-2 border-border bg-muted text-sm font-bold uppercase">
					<span>CSV HEADER</span>
					<span>TARGET TABLE</span>
					<span>TARGET COLUMN</span>
					<span />
				</div>
				{headers.map((header) => {
					const target = advancedMapping[header];
					const selectedTable = existingTables.find(
						(table) => table.tableName === (target?.tableName ?? ""),
					);
					return (
						<div
							key={header}
							className="grid grid-cols-[1fr_1fr_1fr_auto] gap-3 p-3 border-b border-border last:border-b-0 items-center"
						>
							<span className="font-bold truncate">{header}</span>
							<Select
								value={target?.tableName ?? ""}
								onValueChange={(tableName) => {
									const defaultColumn =
										existingTables.find(
											(table) => table.tableName === tableName,
										)?.columns[0]?.name ?? "";
									onTargetChange(
										header,
										tableName === ""
											? null
											: {
													tableName,
													columnName: defaultColumn,
												},
									);
								}}
							>
								<SelectTrigger className="h-8 rounded-none border-2 border-border text-xs font-bold">
									<SelectValue placeholder="Select table" />
								</SelectTrigger>
								<SelectContent className="rounded-none border-2 border-border font-mono bg-card">
									{existingTables.map((table) => (
										<SelectItem key={table.tableName} value={table.tableName}>
											{table.tableName}
										</SelectItem>
									))}
								</SelectContent>
							</Select>

							<Select
								value={target?.columnName ?? ""}
								onValueChange={(columnName) => {
									if (!target) {
										return;
									}
									onTargetChange(header, {
										tableName: target.tableName,
										columnName,
									});
								}}
								disabled={!target || !selectedTable}
							>
								<SelectTrigger className="h-8 rounded-none border-2 border-border text-xs font-bold">
									<SelectValue placeholder="Select column" />
								</SelectTrigger>
								<SelectContent className="rounded-none border-2 border-border font-mono bg-card">
									{(selectedTable?.columns ?? []).map((column) => (
										<SelectItem key={column.name} value={column.name}>
											{column.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Button
								variant="ghost"
								size="icon-sm"
								onClick={() => onTargetChange(header, null)}
								className="hover:bg-destructive hover:text-destructive-foreground"
							>
								<X className="w-4 h-4" />
							</Button>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function TablePoliciesEditor({
	tablePolicies,
	existingTables,
	routedColumnsByTable,
	onPolicyChange,
}: {
	tablePolicies: TableWritePolicy[];
	existingTables: SchemaTable[];
	routedColumnsByTable: Record<string, string[]>;
	onPolicyChange: (
		tableName: string,
		updates: Partial<TableWritePolicy>,
	) => void;
}) {
	return (
		<div className="space-y-2">
			<span className="block text-sm font-bold uppercase">
				PER-TABLE WRITE POLICIES
			</span>
			{tablePolicies.length === 0 ? (
				<p className="text-sm font-bold text-muted-foreground">
					Define column routes first to generate table policies.
				</p>
			) : (
				<div className="space-y-3">
					{tablePolicies.map((policy) => {
						const selectedTable = existingTables.find(
							(table) => table.tableName === policy.tableName,
						);
						const routedColumns = routedColumnsByTable[policy.tableName] ?? [];

						return (
							<div
								key={policy.tableName}
								className="border-2 border-border bg-card p-3 space-y-3"
							>
								<p className="font-black uppercase">{policy.tableName}</p>

								<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
									<div>
										<span className="block text-xs font-bold uppercase mb-1">
											TABLE MODE
										</span>
										<Select
											value={policy.tableMode}
											onValueChange={(value) =>
												onPolicyChange(policy.tableName, {
													tableMode: value as TableMode,
												})
											}
										>
											<SelectTrigger className="h-8 rounded-none border-2 border-border text-xs font-bold">
												<SelectValue />
											</SelectTrigger>
											<SelectContent className="rounded-none border-2 border-border font-mono bg-card">
												<SelectItem value="create">create</SelectItem>
												<SelectItem value="map">map</SelectItem>
											</SelectContent>
										</Select>
									</div>

									<div>
										<span className="block text-xs font-bold uppercase mb-1">
											WRITE MODE
										</span>
										<Select
											value={policy.writeMode}
											onValueChange={(value) =>
												onPolicyChange(policy.tableName, {
													writeMode: value as TableWriteMode,
												})
											}
										>
											<SelectTrigger className="h-8 rounded-none border-2 border-border text-xs font-bold">
												<SelectValue />
											</SelectTrigger>
											<SelectContent className="rounded-none border-2 border-border font-mono bg-card">
												{TABLE_WRITE_MODES.map((mode) => (
													<SelectItem key={mode} value={mode}>
														{mode}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								</div>

								<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
									<div>
										<span className="block text-xs font-bold uppercase mb-1">
											PRIMARY KEY COLUMN
										</span>
										<Select
											value={policy.primaryKeyColumn ?? "__none__"}
											onValueChange={(value) =>
												onPolicyChange(policy.tableName, {
													primaryKeyColumn: value === "__none__" ? null : value,
												})
											}
										>
											<SelectTrigger className="h-8 rounded-none border-2 border-border text-xs font-bold">
												<SelectValue placeholder="Select PK column" />
											</SelectTrigger>
											<SelectContent className="rounded-none border-2 border-border font-mono bg-card">
												<SelectItem value="__none__">none</SelectItem>
												{(selectedTable?.columns ?? []).map((column) => (
													<SelectItem key={column.name} value={column.name}>
														{column.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>

									<div>
										<span className="block text-xs font-bold uppercase mb-1">
											UPSERT CONFLICT COLUMNS
										</span>
										{routedColumns.length === 0 ? (
											<p className="h-8 rounded-none border-2 border-border bg-muted px-2 text-xs font-bold uppercase text-muted-foreground flex items-center">
												No routed columns available
											</p>
										) : (
											<div className="flex flex-wrap gap-2">
												{routedColumns.map((columnName) => {
													const selected =
														policy.conflictColumns.includes(columnName);
													return (
														<Button
															key={columnName}
															type="button"
															size="xs"
															variant={selected ? "accent" : "outline"}
															disabled={policy.writeMode !== "upsert"}
															onClick={() => {
																const next = selected
																	? policy.conflictColumns.filter(
																			(column) => column !== columnName,
																		)
																	: [...policy.conflictColumns, columnName];
																onPolicyChange(policy.tableName, {
																	conflictColumns: next,
																});
															}}
														>
															{columnName}
														</Button>
													);
												})}
											</div>
										)}
									</div>
								</div>

								{policy.writeMode === "upsert" &&
								policy.conflictColumns.length === 0 ? (
									<p className="text-xs font-bold text-destructive uppercase">
										Upsert requires at least one conflict column.
									</p>
								) : null}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}

function RowLinkStrategyEditor({
	rowLinkStrategy,
	tableNames,
	existingTables,
	onModeChange,
	onAddLink,
	onUpdateLink,
	onRemoveLink,
}: {
	rowLinkStrategy: RowLinkStrategy;
	tableNames: string[];
	existingTables: SchemaTable[];
	onModeChange: (mode: RowLinkStrategy["mode"]) => void;
	onAddLink: () => void;
	onUpdateLink: (
		linkId: string,
		updates: {
			parentTable?: string;
			parentKeyColumn?: string;
			childTable?: string;
			childForeignKeyColumn?: string;
		},
	) => void;
	onRemoveLink: (linkId: string) => void;
}) {
	const getColumnsForTable = (tableName: string): string[] => {
		return (
			existingTables
				.find((table) => table.tableName === tableName)
				?.columns.map((column) => column.name) ?? []
		);
	};

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<span className="block text-sm font-bold uppercase">
					ROW LINK STRATEGY
				</span>
				{rowLinkStrategy.mode === "generated_id" ? (
					<Button variant="outline" size="sm" onClick={onAddLink}>
						<Plus className="w-4 h-4 mr-1" />
						ADD LINK
					</Button>
				) : null}
			</div>

			<div className="flex gap-3">
				<Button
					variant={
						rowLinkStrategy.mode === "explicit_fk" ? "accent" : "outline"
					}
					onClick={() => onModeChange("explicit_fk")}
					className="flex-1"
				>
					EXPLICIT FK VALUES
				</Button>
				<Button
					variant={
						rowLinkStrategy.mode === "generated_id" ? "accent" : "outline"
					}
					onClick={() => onModeChange("generated_id")}
					className="flex-1"
				>
					GENERATED ID PROPAGATION
				</Button>
			</div>

			{rowLinkStrategy.mode === "generated_id" ? (
				<div className="space-y-3">
					{rowLinkStrategy.links.length === 0 ? (
						<p className="text-sm font-bold text-muted-foreground">
							Add at least one parent PK → child FK link.
						</p>
					) : null}

					{rowLinkStrategy.links.map((link) => (
						<div
							key={link.id}
							className="border-2 border-border bg-card p-3 grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2"
						>
							<Select
								value={link.parentTable}
								onValueChange={(value) =>
									onUpdateLink(link.id, { parentTable: value })
								}
							>
								<SelectTrigger className="h-8 rounded-none border-2 border-border text-xs font-bold">
									<SelectValue placeholder="Parent table" />
								</SelectTrigger>
								<SelectContent className="rounded-none border-2 border-border font-mono bg-card">
									{tableNames.map((tableName) => (
										<SelectItem key={tableName} value={tableName}>
											{tableName}
										</SelectItem>
									))}
								</SelectContent>
							</Select>

							<Select
								value={link.parentKeyColumn}
								onValueChange={(value) =>
									onUpdateLink(link.id, { parentKeyColumn: value })
								}
							>
								<SelectTrigger className="h-8 rounded-none border-2 border-border text-xs font-bold">
									<SelectValue placeholder="Parent PK column" />
								</SelectTrigger>
								<SelectContent className="rounded-none border-2 border-border font-mono bg-card">
									{getColumnsForTable(link.parentTable).map((columnName) => (
										<SelectItem key={columnName} value={columnName}>
											{columnName}
										</SelectItem>
									))}
								</SelectContent>
							</Select>

							<Select
								value={link.childTable}
								onValueChange={(value) =>
									onUpdateLink(link.id, { childTable: value })
								}
							>
								<SelectTrigger className="h-8 rounded-none border-2 border-border text-xs font-bold">
									<SelectValue placeholder="Child table" />
								</SelectTrigger>
								<SelectContent className="rounded-none border-2 border-border font-mono bg-card">
									{tableNames.map((tableName) => (
										<SelectItem key={tableName} value={tableName}>
											{tableName}
										</SelectItem>
									))}
								</SelectContent>
							</Select>

							<Select
								value={link.childForeignKeyColumn}
								onValueChange={(value) =>
									onUpdateLink(link.id, {
										childForeignKeyColumn: value,
									})
								}
							>
								<SelectTrigger className="h-8 rounded-none border-2 border-border text-xs font-bold">
									<SelectValue placeholder="Child FK column" />
								</SelectTrigger>
								<SelectContent className="rounded-none border-2 border-border font-mono bg-card">
									{getColumnsForTable(link.childTable).map((columnName) => (
										<SelectItem key={columnName} value={columnName}>
											{columnName}
										</SelectItem>
									))}
								</SelectContent>
							</Select>

							<Button
								variant="ghost"
								size="icon-sm"
								onClick={() => onRemoveLink(link.id)}
								className="hover:bg-destructive hover:text-destructive-foreground"
							>
								<Trash2 className="w-4 h-4" />
							</Button>
						</div>
					))}
				</div>
			) : (
				<p className="text-sm font-bold text-muted-foreground">
					Use CSV-provided foreign key values directly (no generated ID
					propagation).
				</p>
			)}
		</div>
	);
}

function ColumnTypeEditor({
	columns,
	primaryKeyColumn,
	onColumnsChange,
	onPrimaryKeyChange,
}: {
	columns: CsvColumnDef[];
	primaryKeyColumn: string | null;
	onColumnsChange: (columns: CsvColumnDef[]) => void;
	onPrimaryKeyChange: (pk: string | null) => void;
}) {
	const updateColumn = (index: number, updates: Partial<CsvColumnDef>) => {
		const newColumns = [...columns];
		newColumns[index] = { ...newColumns[index], ...updates };
		onColumnsChange(newColumns);
	};

	return (
		<div>
			<span className="block text-sm font-bold uppercase mb-2">
				COLUMN CONFIGURATION
			</span>
			<div className="border-2 border-border bg-card">
				{/* Header */}
				<div className="grid grid-cols-[1fr_120px_80px_80px] gap-2 p-3 border-b-2 border-border bg-muted text-sm font-bold uppercase">
					<span>COLUMN</span>
					<span>TYPE</span>
					<span>NULL</span>
					<span>PK</span>
				</div>
				{/* Rows */}
				{columns.map((col, index) => (
					<div
						key={col.name}
						className="grid grid-cols-[1fr_120px_80px_80px] gap-2 p-3 border-b border-border last:border-b-0 items-center"
					>
						<div>
							<span className="font-bold">{col.name}</span>
							{col.sampleValues.length > 0 && (
								<span className="text-xs text-muted-foreground ml-2">
									e.g. "{col.sampleValues[0]}"
								</span>
							)}
						</div>
						<Select
							value={col.userType ?? col.inferredType}
							onValueChange={(value) =>
								updateColumn(index, { userType: value as InferredColumnType })
							}
						>
							<SelectTrigger className="h-8 rounded-none border-2 border-border text-xs font-bold">
								<SelectValue />
							</SelectTrigger>
							<SelectContent className="rounded-none border-2 border-border font-mono bg-card">
								{COLUMN_TYPES.map((type) => (
									<SelectItem
										key={type}
										value={type}
										className="rounded-none cursor-pointer text-xs"
									>
										{type}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<div className="flex justify-center">
							<input
								type="checkbox"
								checked={col.nullable}
								onChange={(e) =>
									updateColumn(index, { nullable: e.target.checked })
								}
								className="w-5 h-5 accent-primary"
							/>
						</div>
						<div className="flex justify-center">
							<input
								type="radio"
								name="primaryKey"
								checked={primaryKeyColumn === col.name}
								onChange={() =>
									onPrimaryKeyChange(
										primaryKeyColumn === col.name ? null : col.name,
									)
								}
								className="w-5 h-5 accent-primary"
							/>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

function ColumnMappingEditor({
	headers,
	mapping,
	targetColumns,
	onMappingChange,
}: {
	headers: string[];
	mapping: Record<string, string>;
	targetColumns: Array<{ name: string; dataType: string; isNullable: boolean }>;
	onMappingChange: (mapping: Record<string, string>) => void;
}) {
	return (
		<div>
			<span className="block text-sm font-bold uppercase mb-2">
				COLUMN MAPPING
			</span>
			<div className="border-2 border-border bg-card">
				{/* Header */}
				<div className="grid grid-cols-2 gap-4 p-3 border-b-2 border-border bg-muted text-sm font-bold uppercase">
					<span>CSV HEADER</span>
					<span>DB COLUMN</span>
				</div>
				{/* Rows */}
				{headers.map((header) => (
					<div
						key={header}
						className="grid grid-cols-2 gap-4 p-3 border-b border-border last:border-b-0 items-center"
					>
						<span className="font-bold truncate">{header}</span>
						<Select
							value={mapping[header] ?? ""}
							onValueChange={(value) =>
								onMappingChange({ ...mapping, [header]: value })
							}
						>
							<SelectTrigger className="h-8 rounded-none border-2 border-border text-sm font-bold">
								<SelectValue placeholder="Select column" />
							</SelectTrigger>
							<SelectContent className="rounded-none border-2 border-border font-mono bg-card">
								{targetColumns.map((col) => (
									<SelectItem
										key={col.name}
										value={col.name}
										className="rounded-none cursor-pointer text-sm"
									>
										{col.name}{" "}
										<span className="text-muted-foreground text-xs">
											({col.dataType})
										</span>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				))}
			</div>
		</div>
	);
}
