import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, ArrowRight, Plus } from "lucide-react";

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
import { useActiveConnection } from "#/hooks/use-active-connection.tsx";
import { getDatabaseSchemaFn } from "#/server/schema-fns";

import { ConfigureStep } from "./_import/components/ConfigureStep";
import { ImportStep } from "./_import/components/ImportStep";
import { RelationshipsStep } from "./_import/components/RelationshipsStep";
import { UploadStep } from "./_import/components/UploadStep";
import { WizardStepper } from "./_import/components/WizardStepper";
import { useImportWizard } from "./_import/hooks/useImportWizard";
import { STEP_ORDER } from "./_import/types";

export const Route = createFileRoute("/import")({ component: ImportPage });

function ImportPage() {
	const { activeConnection, isHydrated } = useActiveConnection();
	const {
		wizardState,
		errorMessage,
		setErrorMessage,
		currentStepIndex,
		canProceed,
		updateCsvFiles,
		updateRelationships,
		updateImportProgress,
		resetWizard,
		handleNext,
		handleBack,
	} = useImportWizard();

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

	if (!isHydrated) {
		return <Loader />;
	}

	if (!activeConnection) {
		return <NoConnectionState />;
	}

	return (
		<section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 p-6 md:p-10 font-mono">
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

			<WizardStepper
				currentStep={wizardState.step}
				completedSteps={STEP_ORDER.slice(0, currentStepIndex)}
			/>

			<div className="flex-1">
				{wizardState.step === "upload" && (
					<UploadStep
						csvFiles={wizardState.csvFiles}
						onUpdate={updateCsvFiles}
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

				{wizardState.step === "import" && (
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
					(wizardState.importProgress.status === "completed" ||
						wizardState.importProgress.status === "completed_with_errors") && (
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
