import { useCallback, useState } from "react";

import {
	type CsvFileConfig,
	createInitialWizardState,
	type ForeignKeyDef,
	type ImportProgress,
	type ImportWizardState,
	type ImportWizardStep,
} from "#/lib/csv-import-types";

import { STEP_ORDER } from "../types";

export function useImportWizard() {
	const [wizardState, setWizardState] = useState<ImportWizardState>(
		createInitialWizardState,
	);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
				return (
					wizardState.importProgress.status === "completed" ||
					wizardState.importProgress.status === "completed_with_errors"
				);
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

	return {
		wizardState,
		errorMessage,
		setErrorMessage,
		currentStepIndex,
		canProceed,
		goToStep,
		updateCsvFiles,
		updateRelationships,
		updateImportProgress,
		resetWizard,
		handleNext,
		handleBack,
	};
}
