import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	AlertTriangle,
	ArrowLeft,
	ArrowRight,
	Check,
	ChevronDown,
	ChevronRight,
	FileSpreadsheet,
	Link2,
	Plus,
	Settings2,
	Trash2,
	Upload,
	X,
	Zap,
} from "lucide-react";
import { type ChangeEvent, useCallback, useRef, useState } from "react";

import Loader from "#/components/Loader.tsx";
import { NoConnectionState } from "#/components/NoConnectionState.tsx";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { useActiveConnection } from "#/hooks/use-active-connection.tsx";
import {
	analyzeColumns,
	autoMatchColumns,
	type BatchImportProgressEvent,
	type ColumnTarget,
	type CsvColumnDef,
	type CsvFileConfig,
	createInitialWizardState,
	type ForeignKeyDef,
	fileNameToTableName,
	generateId,
	getMappedTargetTables,
	type ImportMode,
	type ImportProgress,
	type ImportWizardState,
	type ImportWizardStep,
	type InferredColumnType,
	type RowLinkStrategy,
	syncTablePoliciesFromAdvancedMapping,
	type TableImportProgress,
	type TableMode,
	type TableWriteMode,
	type TableWritePolicy,
} from "#/lib/csv-import-types";
import { cn } from "#/lib/utils";
import { analyzeCsvFn, createTableFn } from "#/server/csv-import-fns";
import { getDatabaseSchemaFn } from "#/server/schema-fns";

export const Route = createFileRoute("/import")({ component: ImportPage });

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

const STEP_ORDER: ImportWizardStep[] = [
	"upload",
	"configure",
	"relationships",
	"import",
];

const STEP_LABELS: Record<ImportWizardStep, string> = {
	upload: "UPLOAD",
	configure: "CONFIGURE",
	relationships: "RELATIONSHIPS",
	import: "IMPORT",
};

const STEP_ICONS: Record<ImportWizardStep, React.ReactNode> = {
	upload: <Upload className="w-5 h-5" />,
	configure: <Settings2 className="w-5 h-5" />,
	relationships: <Link2 className="w-5 h-5" />,
	import: <Zap className="w-5 h-5" />,
};

function ImportPage() {
	const { activeConnection, isHydrated } = useActiveConnection();
	const [wizardState, setWizardState] = useState<ImportWizardState>(
		createInitialWizardState,
	);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const schemaQuery = useQuery({
		queryKey: ["schema", activeConnection?.id],
		queryFn: async () => {
			if (!activeConnection) {
				throw new Error("No active connection selected.");
			}
			return getDatabaseSchemaFn({ data: activeConnection });
		},
		enabled: !!activeConnection,
	});

	const schemaData = schemaQuery.data;
	const schemaError =
		schemaData && "error" in schemaData ? schemaData.error : null;
	const tables = schemaData && Array.isArray(schemaData) ? schemaData : [];

	const goToStep = useCallback((step: ImportWizardStep) => {
		setWizardState((prev) => ({ ...prev, step }));
	}, []);

	const updateCsvFiles = useCallback((csvFiles: CsvFileConfig[]) => {
		setWizardState((prev) => ({ ...prev, csvFiles }));
	}, []);

	const updateRelationships = useCallback((relationships: ForeignKeyDef[]) => {
		setWizardState((prev) => ({ ...prev, relationships }));
	}, []);

	const updateImportProgress = useCallback((importProgress: ImportProgress) => {
		setWizardState((prev) => ({ ...prev, importProgress }));
	}, []);

	const resetWizard = useCallback(() => {
		setWizardState(createInitialWizardState());
	}, []);

	const currentStepIndex = STEP_ORDER.indexOf(wizardState.step);

	const canProceed = (() => {
		const isGeneratedLinkValid = (link: {
			parentTable: string;
			parentKeyColumn: string;
			childTable: string;
			childForeignKeyColumn: string;
		}) =>
			link.parentTable.trim() !== "" &&
			link.parentKeyColumn.trim() !== "" &&
			link.childTable.trim() !== "" &&
			link.childForeignKeyColumn.trim() !== "";

		switch (wizardState.step) {
			case "upload":
				return wizardState.csvFiles.length > 0;
			case "configure":
				return wizardState.csvFiles.every((csv) => {
					if (csv.importMode === "simple") {
						if (csv.tableMode === "create") {
							return csv.tableName.trim() !== "";
						}

						return (
							csv.tableName.trim() !== "" &&
							csv.headers.every((h) => csv.mapping[h])
						);
					}

					const headersMapped = csv.headers.every((header) => {
						const target = csv.advancedMapping[header];
						return (
							target !== null &&
							target !== undefined &&
							target.tableName.trim() !== "" &&
							target.columnName.trim() !== ""
						);
					});

					if (!headersMapped || csv.tablePolicies.length === 0) {
						return false;
					}

					const policiesValid = csv.tablePolicies.every((policy) => {
						if (policy.tableName.trim() === "") {
							return false;
						}

						if (
							policy.writeMode === "upsert" &&
							policy.conflictColumns.length === 0
						) {
							return false;
						}

						return true;
					});

					if (!policiesValid) {
						return false;
					}

					if (csv.rowLinkStrategy.mode === "generated_id") {
						return (
							csv.rowLinkStrategy.links.length > 0 &&
							csv.rowLinkStrategy.links.every(isGeneratedLinkValid)
						);
					}

					return true;
				});
			case "relationships":
				return true;
			case "import":
				return wizardState.importProgress.status === "completed";
			default:
				return false;
		}
	})();

	const handleNext = useCallback(() => {
		const nextIndex = currentStepIndex + 1;
		if (nextIndex < STEP_ORDER.length) {
			goToStep(STEP_ORDER[nextIndex]);
		}
	}, [currentStepIndex, goToStep]);

	const handleBack = useCallback(() => {
		const prevIndex = currentStepIndex - 1;
		if (prevIndex >= 0) {
			goToStep(STEP_ORDER[prevIndex]);
		}
	}, [currentStepIndex, goToStep]);

	if (!isHydrated) {
		return <Loader />;
	}

	if (!activeConnection) {
		return <NoConnectionState />;
	}

	return (
		<section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 p-6 md:p-10 font-mono">
			{/* Header */}
			<div className="flex flex-col gap-2 bg-card p-6 border-2 border-border shadow-hardware">
				<h1 className="text-3xl font-black uppercase tracking-wider text-primary">
					CSV_BATCH_IMPORTER
				</h1>
				<div className="flex items-center gap-3">
					<div className="w-3 h-3 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(255,150,0,0.8)]" />
					<p className="text-sm font-bold uppercase tracking-widest text-primary">
						MULTI-TABLE MODE
					</p>
					<span className="text-muted-foreground">|</span>
					<p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
						{activeConnection.name}
					</p>
				</div>
			</div>

			{/* Step Indicator */}
			<StepIndicator
				currentStep={wizardState.step}
				completedSteps={STEP_ORDER.slice(0, currentStepIndex)}
			/>

			{/* Step Content */}
			<div className="flex-1">
				{wizardState.step === "upload" && (
					<UploadStep
						csvFiles={wizardState.csvFiles}
						onUpdate={updateCsvFiles}
						existingTables={tables}
						setErrorMessage={setErrorMessage}
					/>
				)}

				{wizardState.step === "configure" && (
					<ConfigureStep
						csvFiles={wizardState.csvFiles}
						onUpdate={updateCsvFiles}
						existingTables={tables}
						schemaLoading={schemaQuery.isLoading}
						schemaError={schemaError}
					/>
				)}

				{wizardState.step === "relationships" && (
					<RelationshipsStep
						csvFiles={wizardState.csvFiles}
						relationships={wizardState.relationships}
						onUpdate={updateRelationships}
					/>
				)}

				{wizardState.step === "import" && activeConnection && (
					<ImportStep
						csvFiles={wizardState.csvFiles}
						relationships={wizardState.relationships}
						connectionId={activeConnection.id}
						importProgress={wizardState.importProgress}
						onProgressUpdate={updateImportProgress}
						setErrorMessage={setErrorMessage}
					/>
				)}
			</div>

			{/* Navigation */}
			<div className="flex items-center justify-between gap-4 py-4 border-t-2 border-border">
				<Button
					variant="outline"
					size="lg"
					onClick={handleBack}
					disabled={currentStepIndex === 0}
					className="gap-2"
				>
					<ArrowLeft className="w-5 h-5" />
					BACK
				</Button>

				{wizardState.step !== "import" && (
					<Button
						variant="accent"
						size="lg"
						onClick={handleNext}
						disabled={!canProceed}
						className="gap-2"
					>
						{wizardState.step === "relationships" ? "START IMPORT" : "NEXT"}
						<ArrowRight className="w-5 h-5" />
					</Button>
				)}

				{wizardState.step === "import" &&
					wizardState.importProgress.status === "completed" && (
						<Button
							variant="accent"
							size="lg"
							onClick={resetWizard}
							className="gap-2"
						>
							NEW IMPORT
							<Plus className="w-5 h-5" />
						</Button>
					)}
			</div>

			{/* Error Dialog */}
			<AlertDialog
				open={!!errorMessage}
				onOpenChange={(open) => {
					if (!open) setErrorMessage(null);
				}}
			>
				<AlertDialogContent className="rounded-none border-4 border-destructive shadow-hardware font-mono p-6 bg-card">
					<AlertDialogHeader>
						<AlertDialogTitle className="text-2xl font-black uppercase text-destructive flex items-center gap-2">
							<AlertTriangle className="w-6 h-6" /> ERROR
						</AlertDialogTitle>
						<AlertDialogDescription className="text-muted-foreground font-bold uppercase tracking-widest mt-4">
							{errorMessage}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter className="mt-6">
						<AlertDialogAction
							onClick={() => setErrorMessage(null)}
							className="rounded-none border-2 border-destructive shadow-hardware active:translate-x-0.5 active:translate-y-0.5 active:shadow-none font-bold uppercase bg-destructive text-destructive-foreground hover:bg-destructive/90 w-full sm:w-auto"
						>
							ACKNOWLEDGE
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</section>
	);
}

// ============================================================================
// Step Indicator Component
// ============================================================================

function StepIndicator({
	currentStep,
	completedSteps,
}: {
	currentStep: ImportWizardStep;
	completedSteps: ImportWizardStep[];
}) {
	return (
		<div className="flex items-center gap-2 bg-card p-4 border-2 border-border shadow-hardware overflow-x-auto">
			{STEP_ORDER.map((step, index) => {
				const isCompleted = completedSteps.includes(step);
				const isCurrent = step === currentStep;

				return (
					<div key={step} className="flex items-center gap-2">
						<div
							className={cn(
								"flex items-center gap-2 px-4 py-2 border-2 font-bold uppercase text-sm transition-colors",
								isCurrent &&
									"bg-primary text-primary-foreground border-primary shadow-hardware",
								isCompleted &&
									!isCurrent &&
									"bg-secondary text-foreground border-border",
								!isCurrent &&
									!isCompleted &&
									"bg-muted text-muted-foreground border-border",
							)}
						>
							{isCompleted && !isCurrent ? (
								<Check className="w-4 h-4 text-primary" />
							) : (
								STEP_ICONS[step]
							)}
							<span className="hidden sm:inline">{STEP_LABELS[step]}</span>
						</div>
						{index < STEP_ORDER.length - 1 && (
							<ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
						)}
					</div>
				);
			})}
		</div>
	);
}

// ============================================================================
// Upload Step Component
// ============================================================================

type SchemaTable = {
	tableName: string;
	columns: Array<{ name: string; dataType: string; isNullable: boolean }>;
};

function UploadStep({
	csvFiles,
	onUpdate,
	setErrorMessage,
}: {
	csvFiles: CsvFileConfig[];
	onUpdate: (files: CsvFileConfig[]) => void;
	existingTables: SchemaTable[];
	setErrorMessage: (msg: string | null) => void;
}) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isProcessing, setIsProcessing] = useState(false);

	const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(event.target.files ?? []);
		if (files.length === 0) return;

		setIsProcessing(true);

		try {
			const newConfigs: CsvFileConfig[] = [];

			for (const file of files) {
				const content = await file.text();
				const result = await analyzeCsvFn({ data: { fileContent: content } });

				if (!result.success) {
					setErrorMessage(`Failed to analyze ${file.name}: ${result.error}`);
					continue;
				}

				const columns = analyzeColumns(result.headers, result.sampleRows);
				const tableName = fileNameToTableName(file.name);

				const config: CsvFileConfig = {
					id: generateId(),
					file,
					fileName: file.name,
					fileSize: file.size,
					headers: result.headers,
					sampleRows: result.sampleRows,
					columns,
					tableMode: "create",
					tableName,
					mapping: {},
					primaryKeyColumn: null,
					importMode: "simple",
					advancedMapping: Object.fromEntries(
						result.headers.map((header) => [header, null]),
					),
					tablePolicies: [],
					rowLinkStrategy: {
						mode: "explicit_fk",
						links: [],
					},
				};

				newConfigs.push(config);
			}

			onUpdate([...csvFiles, ...newConfigs]);
		} catch (error) {
			setErrorMessage(
				error instanceof Error ? error.message : "Failed to process files",
			);
		} finally {
			setIsProcessing(false);
			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
		}
	};

	const handleRemoveFile = (id: string) => {
		onUpdate(csvFiles.filter((f) => f.id !== id));
	};

	const formatFileSize = (bytes: number): string => {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	};

	return (
		<div className="space-y-6">
			{/* Drop Zone */}
			<div className="bg-card border-2 border-border p-6 shadow-hardware">
				<h2 className="text-xl font-black uppercase tracking-wider text-foreground mb-4 border-b-4 border-border pb-4">
					1. UPLOAD CSV FILES
				</h2>
				<div className="border-4 border-dashed border-border bg-secondary p-12 text-center relative hover:bg-muted transition-colors">
					<Input
						ref={fileInputRef}
						type="file"
						accept=".csv"
						multiple
						onChange={handleFileChange}
						disabled={isProcessing}
						className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-wait"
					/>
					<Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
					<p className="text-lg font-black uppercase tracking-widest text-muted-foreground pointer-events-none">
						{isProcessing
							? "PROCESSING..."
							: "DROP CSV FILES HERE OR CLICK TO BROWSE"}
					</p>
					<p className="text-sm font-bold text-muted-foreground mt-2">
						Multiple files supported
					</p>
				</div>
			</div>

			{/* File List */}
			{csvFiles.length > 0 && (
				<div className="bg-card border-2 border-border p-6 shadow-hardware">
					<h2 className="text-xl font-black uppercase tracking-wider text-foreground mb-4 border-b-4 border-border pb-4">
						QUEUED FILES ({csvFiles.length})
					</h2>
					<div className="space-y-3">
						{csvFiles.map((csv) => (
							<div
								key={csv.id}
								className="flex items-center justify-between gap-4 p-4 bg-secondary border-2 border-border"
							>
								<div className="flex items-center gap-3 min-w-0">
									<FileSpreadsheet className="w-6 h-6 text-primary shrink-0" />
									<div className="min-w-0">
										<p className="font-bold truncate">{csv.fileName}</p>
										<p className="text-sm text-muted-foreground">
											{csv.headers.length} columns •{" "}
											{formatFileSize(csv.fileSize)}
										</p>
									</div>
								</div>
								<Button
									variant="ghost"
									size="icon-sm"
									onClick={() => handleRemoveFile(csv.id)}
									className="shrink-0 hover:bg-destructive hover:text-destructive-foreground"
								>
									<X className="w-4 h-4" />
								</Button>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

// ============================================================================
// Configure Step Component
// ============================================================================

function ConfigureStep({
	csvFiles,
	onUpdate,
	existingTables,
	schemaLoading,
	schemaError,
}: {
	csvFiles: CsvFileConfig[];
	onUpdate: (files: CsvFileConfig[]) => void;
	existingTables: SchemaTable[];
	schemaLoading: boolean;
	schemaError: string | null;
}) {
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

		updateFile(id, {
			advancedMapping: nextAdvancedMapping,
			tablePolicies: nextPolicies,
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

		const nextPolicies = file.tablePolicies.map((policy) =>
			policy.tableName === tableName ? { ...policy, ...updates } : policy,
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
	onPolicyChange,
}: {
	tablePolicies: TableWritePolicy[];
	existingTables: SchemaTable[];
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
											UPSERT CONFLICT COLUMNS (CSV)
										</span>
										<Input
											value={policy.conflictColumns.join(",")}
											onChange={(event) =>
												onPolicyChange(policy.tableName, {
													conflictColumns: event.target.value
														.split(",")
														.map((value) => value.trim())
														.filter((value) => value !== ""),
												})
											}
											placeholder="email,external_id"
											className="h-8 rounded-none border-2 border-border bg-card font-bold"
										/>
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

// ============================================================================
// Relationships Step Component
// ============================================================================

function RelationshipsStep({
	csvFiles,
	relationships,
	onUpdate,
}: {
	csvFiles: CsvFileConfig[];
	relationships: ForeignKeyDef[];
	onUpdate: (relationships: ForeignKeyDef[]) => void;
}) {
	const tableMap = new Map<string, Set<string>>();

	for (const file of csvFiles) {
		if (file.importMode === "simple") {
			const tableName = file.tableName.trim();
			if (tableName === "") {
				continue;
			}

			const columns =
				file.tableMode === "create"
					? file.columns.map((column) => column.name)
					: Object.values(file.mapping).filter(
							(column) => column.trim() !== "",
						);

			if (!tableMap.has(tableName)) {
				tableMap.set(tableName, new Set<string>());
			}

			const target = tableMap.get(tableName);
			if (target) {
				for (const column of columns) {
					target.add(column);
				}
			}

			continue;
		}

		for (const target of Object.values(file.advancedMapping)) {
			if (
				!target ||
				target.tableName.trim() === "" ||
				target.columnName.trim() === ""
			) {
				continue;
			}

			if (!tableMap.has(target.tableName)) {
				tableMap.set(target.tableName, new Set<string>());
			}

			tableMap.get(target.tableName)?.add(target.columnName);

			const sourcePolicy = file.tablePolicies.find(
				(policy) => policy.tableName === target.tableName,
			);
			if (
				sourcePolicy?.primaryKeyColumn &&
				sourcePolicy.primaryKeyColumn.trim() !== ""
			) {
				tableMap.get(target.tableName)?.add(sourcePolicy.primaryKeyColumn);
			}
		}
	}

	const allTables = Array.from(tableMap.entries()).map(([name, columns]) => ({
		name,
		columns: Array.from(columns),
	}));

	const addRelationship = () => {
		if (allTables.length < 2) return;

		const newRel: ForeignKeyDef = {
			id: generateId(),
			sourceTable: allTables[0].name,
			sourceColumn: allTables[0].columns[0] ?? "",
			targetTable: allTables[1].name,
			targetColumn: allTables[1].columns[0] ?? "",
		};
		onUpdate([...relationships, newRel]);
	};

	const updateRelationship = (id: string, updates: Partial<ForeignKeyDef>) => {
		onUpdate(
			relationships.map((r) => (r.id === id ? { ...r, ...updates } : r)),
		);
	};

	const removeRelationship = (id: string) => {
		onUpdate(relationships.filter((r) => r.id !== id));
	};

	return (
		<div className="space-y-6">
			<div className="bg-card border-2 border-border p-6 shadow-hardware">
				<div className="flex items-center justify-between mb-4 border-b-4 border-border pb-4">
					<h2 className="text-xl font-black uppercase tracking-wider text-foreground">
						3. FOREIGN KEY RELATIONSHIPS (OPTIONAL)
					</h2>
					<Button
						variant="outline"
						size="sm"
						onClick={addRelationship}
						disabled={allTables.length < 2}
						className="gap-2"
					>
						<Plus className="w-4 h-4" />
						ADD RELATIONSHIP
					</Button>
				</div>

				{relationships.length === 0 ? (
					<div className="text-center py-12 text-muted-foreground">
						<Link2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
						<p className="font-bold uppercase">No relationships defined</p>
						<p className="text-sm mt-2">
							You can skip this step if you don't need foreign keys
						</p>
					</div>
				) : (
					<div className="space-y-4">
						{relationships.map((rel) => {
							const sourceTable = allTables.find(
								(t) => t.name === rel.sourceTable,
							);
							const targetTable = allTables.find(
								(t) => t.name === rel.targetTable,
							);

							return (
								<div
									key={rel.id}
									className="flex items-center gap-4 p-4 bg-secondary border-2 border-border"
								>
									{/* Source */}
									<div className="flex-1 space-y-2">
										<span className="text-xs font-bold uppercase text-muted-foreground">
											SOURCE TABLE
										</span>
										<Select
											value={rel.sourceTable}
											onValueChange={(v) =>
												updateRelationship(rel.id, {
													sourceTable: v,
													sourceColumn:
														allTables.find((t) => t.name === v)?.columns[0] ??
														"",
												})
											}
										>
											<SelectTrigger className="h-8 rounded-none border-2 border-border text-sm font-bold">
												<SelectValue />
											</SelectTrigger>
											<SelectContent className="rounded-none border-2 border-border font-mono bg-card">
												{allTables.map((t) => (
													<SelectItem key={t.name} value={t.name}>
														{t.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<Select
											value={rel.sourceColumn}
											onValueChange={(v) =>
												updateRelationship(rel.id, { sourceColumn: v })
											}
										>
											<SelectTrigger className="h-8 rounded-none border-2 border-border text-sm font-bold">
												<SelectValue />
											</SelectTrigger>
											<SelectContent className="rounded-none border-2 border-border font-mono bg-card">
												{(sourceTable?.columns ?? []).map((c) => (
													<SelectItem key={c} value={c}>
														{c}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>

									{/* Arrow */}
									<ArrowRight className="w-6 h-6 text-primary shrink-0" />

									{/* Target */}
									<div className="flex-1 space-y-2">
										<span className="text-xs font-bold uppercase text-muted-foreground">
											TARGET TABLE
										</span>
										<Select
											value={rel.targetTable}
											onValueChange={(v) =>
												updateRelationship(rel.id, {
													targetTable: v,
													targetColumn:
														allTables.find((t) => t.name === v)?.columns[0] ??
														"",
												})
											}
										>
											<SelectTrigger className="h-8 rounded-none border-2 border-border text-sm font-bold">
												<SelectValue />
											</SelectTrigger>
											<SelectContent className="rounded-none border-2 border-border font-mono bg-card">
												{allTables.map((t) => (
													<SelectItem key={t.name} value={t.name}>
														{t.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<Select
											value={rel.targetColumn}
											onValueChange={(v) =>
												updateRelationship(rel.id, { targetColumn: v })
											}
										>
											<SelectTrigger className="h-8 rounded-none border-2 border-border text-sm font-bold">
												<SelectValue />
											</SelectTrigger>
											<SelectContent className="rounded-none border-2 border-border font-mono bg-card">
												{(targetTable?.columns ?? []).map((c) => (
													<SelectItem key={c} value={c}>
														{c}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>

									{/* Delete */}
									<Button
										variant="ghost"
										size="icon-sm"
										onClick={() => removeRelationship(rel.id)}
										className="shrink-0 hover:bg-destructive hover:text-destructive-foreground"
									>
										<Trash2 className="w-4 h-4" />
									</Button>
								</div>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}

// ============================================================================
// Import Step Component
// ============================================================================

function ImportStep({
	csvFiles,
	relationships,
	connectionId,
	importProgress,
	onProgressUpdate,
	setErrorMessage,
}: {
	csvFiles: CsvFileConfig[];
	relationships: ForeignKeyDef[];
	connectionId: number;
	importProgress: ImportProgress;
	onProgressUpdate: (progress: ImportProgress) => void;
	setErrorMessage: (msg: string | null) => void;
}) {
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

			// Create user-defined tables before import starts.
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
						workingTables[tableIndex] = {
							...workingTables[tableIndex],
							status: "completed",
							insertedRows:
								payload.insertedRows ?? workingTables[tableIndex].insertedRows,
							failedRows:
								payload.failedRows ?? workingTables[tableIndex].failedRows,
							totalRows:
								payload.totalRows ?? workingTables[tableIndex].totalRows,
							rejectFileName: payload.rejectFileName,
						};
					}

					if (payload.type === "table_error" && tableIndex >= 0) {
						workingTables[tableIndex] = {
							...workingTables[tableIndex],
							status: "failed",
							error: payload.error ?? "Table import failed.",
						};
					}

					onProgressUpdate({
						status: "running",
						tables: [...workingTables],
						currentTableIndex: tableIndex >= 0 ? tableIndex : -1,
					});

					if (payload.type === "complete") {
						completed = true;
						const hasFailedTables = workingTables.some(
							(table) => table.status === "failed",
						);

						onProgressUpdate({
							status: hasFailedTables ? "failed" : "completed",
							tables: [...workingTables],
							currentTableIndex:
								workingTables.length > 0 ? workingTables.length - 1 : -1,
							error: payload.error,
						});
					}
				}
			}

			if (!completed) {
				const hasFailedTables = workingTables.some(
					(table) => table.status === "failed",
				);
				onProgressUpdate({
					status: hasFailedTables ? "failed" : "completed",
					tables: [...workingTables],
					currentTableIndex:
						workingTables.length > 0 ? workingTables.length - 1 : -1,
				});
			}
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Batch import failed.";
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
						{/* Overall Progress */}
						<div className="flex justify-between items-center p-4 bg-secondary border-2 border-border">
							<div className="flex items-center gap-4">
								{importProgress.status === "running" && (
									<div className="w-4 h-4 rounded-full bg-primary animate-pulse" />
								)}
								{importProgress.status === "completed" && (
									<Check className="w-6 h-6 text-primary" />
								)}
								{importProgress.status === "failed" && (
									<AlertTriangle className="w-6 h-6 text-destructive" />
								)}
								<span className="font-black uppercase">
									{importProgress.status === "running" && "IMPORTING..."}
									{importProgress.status === "completed" && "IMPORT COMPLETE"}
									{importProgress.status === "failed" && "IMPORT FAILED"}
								</span>
							</div>
							<div className="flex gap-6 font-bold">
								<span className="text-primary">{totalInserted} inserted</span>
								<span className="text-destructive">{totalFailed} failed</span>
							</div>
						</div>

						{/* Per-table Progress */}
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

									{/* Progress Bar */}
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

									{/* Reject Download */}
									{table.rejectFileName && table.failedRows > 0 && (
										<Button variant="destructive" size="xs" asChild>
											<a
												href={`/api/download-reject?fileName=${encodeURIComponent(table.rejectFileName)}`}
											>
												Download Rejects
											</a>
										</Button>
									)}
								</div>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
