import type { DbDriver } from "./db/connection";

/**
 * Inferred column types from CSV data analysis
 */
export type InferredColumnType =
	| "INTEGER"
	| "DECIMAL"
	| "BOOLEAN"
	| "DATE"
	| "TIMESTAMP"
	| "UUID"
	| "EMAIL"
	| "TEXT";

/**
 * Column definition for a CSV file
 */
export type CsvColumnDef = {
	name: string;
	inferredType: InferredColumnType;
	userType: InferredColumnType | null;
	nullable: boolean;
	sampleValues: string[];
};

/**
 * Table mode - whether to create a new table or map to existing
 */
export type TableMode = "create" | "map";
export type ImportMode = "simple" | "advanced";
export type TableWriteMode = "insert" | "upsert";

export type ColumnTarget = {
	tableName: string;
	columnName: string;
};

export type TableWritePolicy = {
	tableName: string;
	tableMode: TableMode;
	writeMode: TableWriteMode;
	conflictColumns: string[];
	primaryKeyColumn: string | null;
};

export type GeneratedIdLink = {
	id: string;
	parentTable: string;
	parentKeyColumn: string;
	childTable: string;
	childForeignKeyColumn: string;
};

export type RowLinkStrategy =
	| {
			mode: "explicit_fk";
			links: [];
	  }
	| {
			mode: "generated_id";
			links: GeneratedIdLink[];
	  };

/**
 * Configuration for a single CSV file in the import workflow
 */
export type CsvFileConfig = {
	id: string;
	file: File;
	fileName: string;
	fileSize: number;
	headers: string[];
	sampleRows: Record<string, string>[];
	columns: CsvColumnDef[];
	tableMode: TableMode;
	tableName: string;
	mapping: Record<string, string>;
	primaryKeyColumn: string | null;
	importMode: ImportMode;
	advancedMapping: Record<string, ColumnTarget | null>;
	tablePolicies: TableWritePolicy[];
	rowLinkStrategy: RowLinkStrategy;
};

/**
 * Foreign key relationship definition
 */
export type ForeignKeyDef = {
	id: string;
	sourceTable: string;
	sourceColumn: string;
	targetTable: string;
	targetColumn: string;
};

/**
 * Import progress for a single table
 */
export type TableImportProgress = {
	tableIndex: number;
	tableName: string;
	status:
		| "pending"
		| "creating"
		| "importing"
		| "completed"
		| "completed_with_errors"
		| "failed";
	totalRows: number;
	insertedRows: number;
	failedRows: number;
	error?: string;
	rejectFileName?: string;
};

/**
 * Overall import progress
 */
export type ImportProgress = {
	status: "idle" | "running" | "completed" | "completed_with_errors" | "failed";
	tables: TableImportProgress[];
	currentTableIndex: number;
	error?: string;
};

/**
 * Import wizard step
 */
export type ImportWizardStep =
	| "upload"
	| "configure"
	| "relationships"
	| "import";

/**
 * Full wizard state
 */
export type ImportWizardState = {
	step: ImportWizardStep;
	csvFiles: CsvFileConfig[];
	relationships: ForeignKeyDef[];
	importProgress: ImportProgress;
};

/**
 * CSV analysis result from server
 */
export type CsvAnalysisResult = {
	headers: string[];
	sampleRows: Record<string, string>[];
	rowCount: number;
	delimiter: "," | ";";
};

/**
 * Batch import request for the API
 */
export type BatchImportRequest = {
	connectionId: number;
	files: BatchImportFileConfig[];
	relationships: ForeignKeyDef[];
};

export type BatchImportFileConfig = {
	fileName: string;
	columns: CsvColumnDef[];
	importMode: ImportMode;
	simpleConfig?: {
		tableName: string;
		tableMode: TableMode;
		writeMode: TableWriteMode;
		conflictColumns: string[];
		primaryKeyColumn: string | null;
		mapping: Record<string, string>;
	};
	advancedConfig?: {
		columnTargets: Record<string, ColumnTarget | null>;
		tablePolicies: TableWritePolicy[];
		rowLinkStrategy: RowLinkStrategy;
	};
};

/**
 * Per-table configuration for batch import
 */
export type BatchImportTableConfig = {
	fileName: string;
	tableMode: TableMode;
	tableName: string;
	columns: CsvColumnDef[];
	mapping: Record<string, string>;
	primaryKeyColumn: string | null;
};

/**
 * SSE event payload for batch import progress
 */
export type BatchImportProgressEvent = {
	type:
		| "table_start"
		| "table_progress"
		| "table_complete"
		| "table_error"
		| "complete"
		| "error";
	tableIndex?: number;
	tableName?: string;
	totalRows?: number;
	insertedRows?: number;
	failedRows?: number;
	rejectFileName?: string;
	error?: string;
	errorStage?: "validation" | "constraint" | "sql" | "runtime";
	errorCode?: string;
};

/**
 * Map inferred type to database-specific SQL type
 */
export const getDbColumnType = (
	inferredType: InferredColumnType,
	driver: DbDriver,
): string => {
	const typeMap: Record<DbDriver, Record<InferredColumnType, string>> = {
		postgres: {
			INTEGER: "INTEGER",
			DECIMAL: "NUMERIC",
			BOOLEAN: "BOOLEAN",
			DATE: "DATE",
			TIMESTAMP: "TIMESTAMP",
			UUID: "UUID",
			EMAIL: "TEXT",
			TEXT: "TEXT",
		},
		mysql: {
			INTEGER: "INT",
			DECIMAL: "DECIMAL(18,6)",
			BOOLEAN: "TINYINT(1)",
			DATE: "DATE",
			TIMESTAMP: "DATETIME",
			UUID: "CHAR(36)",
			EMAIL: "VARCHAR(255)",
			TEXT: "TEXT",
		},
		sqlite: {
			INTEGER: "INTEGER",
			DECIMAL: "REAL",
			BOOLEAN: "INTEGER",
			DATE: "TEXT",
			TIMESTAMP: "TEXT",
			UUID: "TEXT",
			EMAIL: "TEXT",
			TEXT: "TEXT",
		},
	};

	return typeMap[driver][inferredType];
};

/**
 * Generate a unique ID for file configs and relationships
 */
export const generateId = (): string => {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

/**
 * Initial empty wizard state
 */
export const createInitialWizardState = (): ImportWizardState => ({
	step: "upload",
	csvFiles: [],
	relationships: [],
	importProgress: {
		status: "idle",
		tables: [],
		currentTableIndex: -1,
	},
});

// Type inference patterns
const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP_PATTERN =
	/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;
const INTEGER_PATTERN = /^-?\d+$/;
const DECIMAL_PATTERN = /^-?\d+\.\d+$/;
const BOOLEAN_VALUES = new Set([
	"true",
	"false",
	"yes",
	"no",
	"1",
	"0",
	"t",
	"f",
	"y",
	"n",
]);

/**
 * Infer the type of a single value
 */
const inferValueType = (value: string): InferredColumnType | null => {
	const trimmed = value.trim();

	if (trimmed === "" || trimmed.toLowerCase() === "null") {
		return null;
	}

	if (UUID_PATTERN.test(trimmed)) {
		return "UUID";
	}

	if (TIMESTAMP_PATTERN.test(trimmed)) {
		return "TIMESTAMP";
	}

	if (DATE_PATTERN.test(trimmed)) {
		return "DATE";
	}

	if (EMAIL_PATTERN.test(trimmed)) {
		return "EMAIL";
	}

	if (BOOLEAN_VALUES.has(trimmed.toLowerCase())) {
		return "BOOLEAN";
	}

	if (INTEGER_PATTERN.test(trimmed)) {
		return "INTEGER";
	}

	if (DECIMAL_PATTERN.test(trimmed)) {
		return "DECIMAL";
	}

	return "TEXT";
};

/**
 * Merge two inferred types into a compatible type
 */
const mergeTypes = (
	type1: InferredColumnType,
	type2: InferredColumnType,
): InferredColumnType => {
	if (type1 === type2) {
		return type1;
	}

	// INTEGER + DECIMAL = DECIMAL
	if (
		(type1 === "INTEGER" && type2 === "DECIMAL") ||
		(type1 === "DECIMAL" && type2 === "INTEGER")
	) {
		return "DECIMAL";
	}

	// DATE + TIMESTAMP = TIMESTAMP
	if (
		(type1 === "DATE" && type2 === "TIMESTAMP") ||
		(type1 === "TIMESTAMP" && type2 === "DATE")
	) {
		return "TIMESTAMP";
	}

	// Any other mismatch falls back to TEXT
	return "TEXT";
};

/**
 * Infer column type from an array of sample values
 */
export const inferColumnType = (values: string[]): InferredColumnType => {
	const nonEmptyValues = values.filter(
		(v) => v.trim() !== "" && v.trim().toLowerCase() !== "null",
	);

	if (nonEmptyValues.length === 0) {
		return "TEXT";
	}

	let inferredType: InferredColumnType | null = null;

	for (const value of nonEmptyValues) {
		const valueType = inferValueType(value);

		if (valueType === null) {
			continue;
		}

		if (inferredType === null) {
			inferredType = valueType;
		} else {
			inferredType = mergeTypes(inferredType, valueType);
		}

		// Early exit if we've fallen back to TEXT
		if (inferredType === "TEXT") {
			break;
		}
	}

	return inferredType ?? "TEXT";
};

/**
 * Check if a column appears to be nullable based on sample values
 */
export const inferColumnNullable = (values: string[]): boolean => {
	return values.some(
		(v) => v.trim() === "" || v.trim().toLowerCase() === "null",
	);
};

/**
 * Analyze all columns from sample data and return column definitions
 */
export const analyzeColumns = (
	headers: string[],
	sampleRows: Record<string, string>[],
): CsvColumnDef[] => {
	return headers.map((header) => {
		const values = sampleRows.map((row) => row[header] ?? "");
		const sampleValues = values.slice(0, 5).filter((v) => v.trim() !== "");

		return {
			name: header,
			inferredType: inferColumnType(values),
			userType: null,
			nullable: inferColumnNullable(values),
			sampleValues,
		};
	});
};

/**
 * Normalize column name for auto-matching (lowercase, remove separators)
 */
export const normalizeColumnName = (name: string): string =>
	name.toLowerCase().replace(/[\s_-]/g, "");

/**
 * Auto-match CSV headers to database columns
 */
export const autoMatchColumns = (
	csvHeaders: string[],
	dbColumns: string[],
): Record<string, string> => {
	const normalizedDbLookup = new Map<string, string>();

	for (const column of dbColumns) {
		normalizedDbLookup.set(normalizeColumnName(column), column);
	}

	const mapping: Record<string, string> = {};

	for (const header of csvHeaders) {
		const matchedColumn = normalizedDbLookup.get(normalizeColumnName(header));
		if (matchedColumn) {
			mapping[header] = matchedColumn;
		}
	}

	return mapping;
};

export const getMappedTargetTables = (
	advancedMapping: Record<string, ColumnTarget | null>,
): string[] => {
	const names = new Set<string>();

	for (const target of Object.values(advancedMapping)) {
		if (!target) {
			continue;
		}

		const tableName = target.tableName.trim();
		if (tableName !== "") {
			names.add(tableName);
		}
	}

	return Array.from(names);
};

export const syncTablePoliciesFromAdvancedMapping = (
	existingPolicies: TableWritePolicy[],
	advancedMapping: Record<string, ColumnTarget | null>,
	existingTableNames: string[],
): TableWritePolicy[] => {
	const tableNames = getMappedTargetTables(advancedMapping);
	const existingPolicyMap = new Map(
		existingPolicies.map((policy) => [policy.tableName, policy]),
	);
	const existingTableSet = new Set(existingTableNames);

	return tableNames.map((tableName) => {
		const policy = existingPolicyMap.get(tableName);
		if (policy) {
			return policy;
		}

		return {
			tableName,
			tableMode: existingTableSet.has(tableName) ? "map" : "create",
			writeMode: "insert",
			conflictColumns: [],
			primaryKeyColumn: null,
		};
	});
};

/**
 * Convert CSV file name to a valid table name
 */
export const fileNameToTableName = (fileName: string): string => {
	return fileName
		.replace(/\.csv$/i, "")
		.replace(/[^a-zA-Z0-9_]/g, "_")
		.replace(/^(\d)/, "_$1")
		.replace(/_+/g, "_")
		.toLowerCase();
};
