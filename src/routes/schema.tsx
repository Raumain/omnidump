import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useState } from "react";

import Loader from "#/components/Loader.tsx";
import { NoConnectionState } from "#/components/NoConnectionState";
import { useActiveConnection } from "#/hooks/use-active-connection.tsx";

import { ActionsBar } from "./_schema/components/ActionsBar";
import { DumpModal } from "./_schema/components/DumpModal";
import { DumpsDrawer } from "./_schema/components/DumpsDrawer";
import { ImportDrawer } from "./_schema/components/ImportDrawer";
import { SchemaHeader } from "./_schema/components/SchemaHeader";
import {
	TableDetail,
	TableDetailEmpty,
} from "./_schema/components/TableDetail";
import { TableList } from "./_schema/components/TableList";
import {
	useAnonymization,
	useCsvImport,
	useDumpMutation,
	useSchemaActions,
	useSchemaData,
} from "./_schema/hooks";

export const Route = createFileRoute("/schema")({ component: SchemaPage });

function SchemaPage() {
	const { activeConnection, isHydrated } = useActiveConnection();

	// Local UI state
	const [selectedTable, setSelectedTable] = useState<string | null>(null);
	const [schemaExportFormat, setSchemaExportFormat] = useState<
		"json" | "dbml" | "sql"
	>("json");
	const [isDumpModalOpen, setIsDumpModalOpen] = useState(false);
	const [isDumpsDrawerOpen, setIsDumpsDrawerOpen] = useState(false);
	const [seedCount, setSeedCount] = useState("10");

	// Custom hooks
	const { schemaQuery, dumpsQuery, schemaError, tables } =
		useSchemaData(activeConnection);

	const csvImport = useCsvImport(
		activeConnection?.id,
		selectedTable,
		tables,
		() => schemaQuery.refetch(),
	);
	const {
		isImportDrawerOpen,
		setIsImportDrawerOpen,
		csvFile,
		csvHeaders,
		columnMapping,
		importSuccessCount,
		importFailedCount,
		rejectFileName,
		csvFileInputRef,
		importMutation,
		isMappingReady,
		handleCsvFileChange,
		handleImport,
		resetImportDrawer,
		openImportDrawer,
		setColumnMappingForHeader,
	} = csvImport;

	const anonymization = useAnonymization(activeConnection?.id);
	const {
		selectedProfileId,
		setSelectedProfileId,
		profilesQuery,
		rulesQuery,
		createProfileMutation,
		deleteProfileMutation,
		duplicateProfileMutation,
		saveRulesMutation,
	} = anonymization;

	const actions = useSchemaActions(
		activeConnection,
		() => schemaQuery.refetch(),
		() => dumpsQuery.refetch(),
	);
	const {
		seedMutation,
		clearTableMutation,
		wipeAllDataMutation,
		dropAllTablesMutation,
		restoreDumpMutation,
		deleteDumpMutation,
		handleDownloadDump,
	} = actions;

	const dumpMutation = useDumpMutation(
		activeConnection,
		() => dumpsQuery.refetch(),
		() => setIsDumpModalOpen(false),
	);

	// Derived state
	const selectedTableData = tables.find(
		(table) => table.tableName === selectedTable,
	);
	const selectedTableColumns = selectedTableData?.columns ?? [];
	const tableDetailState = {
		seedCount,
		isSeeding: seedMutation.isPending,
		isClearingTable: clearTableMutation.isPending,
		isImporting: importMutation.isPending,
	};
	const tableDetailHandlers = {
		onSeedCountChange: setSeedCount,
		onSeed: (tableName: string, count: number) =>
			seedMutation.mutate({ tableName, count }),
		onOpenImportDrawer: openImportDrawer,
		onClearTable: (tableName: string) => clearTableMutation.mutate(tableName),
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
				isDumping={dumpMutation.isPending}
				isWipingAllData={wipeAllDataMutation.isPending}
				isDroppingAllTables={dropAllTablesMutation.isPending}
				isClearingTable={clearTableMutation.isPending}
				isRestoringDump={restoreDumpMutation.isPending}
				isSeeding={seedMutation.isPending}
				onSchemaExportFormatChange={setSchemaExportFormat}
				onOpenDumpModal={() => setIsDumpModalOpen(true)}
				onOpenDumpsDrawer={() => setIsDumpsDrawerOpen(true)}
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
								connectionId={activeConnection.id}
								table={selectedTableData}
								state={tableDetailState}
								handlers={tableDetailHandlers}
							/>
						) : (
							<TableDetailEmpty />
						)}
					</div>
				</div>
			) : null}

			<DumpModal
				isOpen={isDumpModalOpen}
				tables={tables}
				isDumping={dumpMutation.isPending}
				profiles={profilesQuery.data ?? []}
				selectedProfileId={selectedProfileId}
				profileRules={rulesQuery.data ?? []}
				isLoadingProfiles={profilesQuery.isLoading}
				isCreatingProfile={createProfileMutation.isPending}
				isDeletingProfile={deleteProfileMutation.isPending}
				isSavingRules={saveRulesMutation.isPending}
				onOpenChange={setIsDumpModalOpen}
				onDump={(options) => dumpMutation.mutate(options)}
				onSelectProfile={setSelectedProfileId}
				onCreateProfile={(name) => createProfileMutation.mutate(name)}
				onDeleteProfile={(id) => deleteProfileMutation.mutate(id)}
				onDuplicateProfile={(id, name) =>
					duplicateProfileMutation.mutate({ profileId: id, newName: name })
				}
				onSaveRules={(profileId, rules) =>
					saveRulesMutation.mutate({ profileId, rules })
				}
			/>

			<DumpsDrawer
				isOpen={isDumpsDrawerOpen}
				dumps={dumpsQuery.data ?? []}
				isLoading={dumpsQuery.isLoading || dumpsQuery.isRefetching}
				isRestoring={restoreDumpMutation.isPending}
				isDeleting={deleteDumpMutation.isPending}
				onOpenChange={setIsDumpsDrawerOpen}
				onRefresh={() => dumpsQuery.refetch()}
				onRestore={(filePath) => restoreDumpMutation.mutate(filePath)}
				onDownload={handleDownloadDump}
				onDelete={(filePath) => deleteDumpMutation.mutate(filePath)}
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
				onColumnMappingChange={setColumnMappingForHeader}
				onImport={handleImport}
				onReset={resetImportDrawer}
			/>
		</section>
	);
}
