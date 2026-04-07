import type {
	CsvFileConfig,
	ForeignKeyDef,
	ImportProgress,
	ImportWizardStep,
} from "#/lib/csv-import-types";

export type SchemaTable = {
	tableName: string;
	columns: Array<{ name: string; dataType: string; isNullable: boolean }>;
};

export type ImportWizardState = {
	step: ImportWizardStep;
	csvFiles: CsvFileConfig[];
	relationships: ForeignKeyDef[];
	importProgress: ImportProgress;
};

export const STEP_ORDER: ImportWizardStep[] = [
	"upload",
	"configure",
	"relationships",
	"import",
];

export const STEP_LABELS: Record<ImportWizardStep, string> = {
	upload: "UPLOAD",
	configure: "CONFIGURE",
	relationships: "RELATIONSHIPS",
	import: "IMPORT",
};
