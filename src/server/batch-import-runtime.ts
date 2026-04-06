import "@tanstack/react-start/server-only";
import type { Kysely } from "kysely";
import { z } from "zod";
import type {
	BatchImportFileConfig,
	CsvColumnDef,
	ForeignKeyDef,
	GeneratedIdLink,
} from "../lib/csv-import-types";
import type { DbDriver } from "../lib/db/connection";

// biome-ignore lint/suspicious/noExplicitAny: dynamic table/column names are resolved at runtime for importer mappings
type DynamicDb = Kysely<any>;

const INFERRED_COLUMN_TYPES = [
	"INTEGER",
	"DECIMAL",
	"BOOLEAN",
	"DATE",
	"TIMESTAMP",
	"UUID",
	"EMAIL",
	"TEXT",
] as const;

const columnTargetSchema = z.object({
	tableName: z.string().min(1),
	columnName: z.string().min(1),
});

const csvColumnSchema = z.object({
	name: z.string().min(1),
	inferredType: z.enum(INFERRED_COLUMN_TYPES),
	userType: z.enum(INFERRED_COLUMN_TYPES).nullable(),
	nullable: z.boolean(),
	sampleValues: z.array(z.string()),
});

const generatedIdLinkSchema = z.object({
	id: z.string().min(1),
	parentTable: z.string().min(1),
	parentKeyColumn: z.string().min(1),
	childTable: z.string().min(1),
	childForeignKeyColumn: z.string().min(1),
});

const rowLinkStrategySchema = z.discriminatedUnion("mode", [
	z.object({
		mode: z.literal("explicit_fk"),
		links: z.array(z.never()).default([]),
	}),
	z.object({
		mode: z.literal("generated_id"),
		links: z.array(generatedIdLinkSchema),
	}),
]);

const tableWritePolicySchema = z
	.object({
		tableName: z.string().min(1),
		tableMode: z.enum(["create", "map"]),
		writeMode: z.enum(["insert", "upsert"]),
		conflictColumns: z.array(z.string().min(1)),
		primaryKeyColumn: z.string().min(1).nullable(),
	})
	.superRefine((value, ctx) => {
		if (value.writeMode === "upsert" && value.conflictColumns.length === 0) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: `Table ${value.tableName} is configured for upsert without conflict columns.`,
			});
		}
	});

const simpleFileSchema = z.object({
	fileName: z.string().min(1),
	columns: z.array(csvColumnSchema),
	importMode: z.literal("simple"),
	simpleConfig: z.object({
		tableName: z.string().min(1),
		tableMode: z.enum(["create", "map"]),
		writeMode: z.enum(["insert", "upsert"]),
		conflictColumns: z.array(z.string().min(1)),
		primaryKeyColumn: z.string().min(1).nullable(),
		mapping: z.record(z.string(), z.string()),
	}),
	advancedConfig: z.undefined().optional(),
});

const advancedFileSchema = z.object({
	fileName: z.string().min(1),
	columns: z.array(csvColumnSchema),
	importMode: z.literal("advanced"),
	simpleConfig: z.undefined().optional(),
	advancedConfig: z.object({
		columnTargets: z.record(z.string(), columnTargetSchema.nullable()),
		tablePolicies: z.array(tableWritePolicySchema),
		rowLinkStrategy: rowLinkStrategySchema,
	}),
});

const foreignKeySchema = z.object({
	id: z.string().min(1),
	sourceTable: z.string().min(1),
	sourceColumn: z.string().min(1),
	targetTable: z.string().min(1),
	targetColumn: z.string().min(1),
});

const batchImportConfigSchema = z.object({
	files: z
		.array(z.union([simpleFileSchema, advancedFileSchema]))
		.min(1, "Batch payload must provide at least one file config."),
	relationships: z.array(foreignKeySchema),
});

const rowValueSchema = z.record(z.string(), z.unknown());

export type ParsedBatchImportConfig = {
	files: BatchImportFileConfig[];
	relationships: ForeignKeyDef[];
};

export type RuntimeTableConfig = {
	tableName: string;
	tableMode: "create" | "map";
	writeMode: "insert" | "upsert";
	conflictColumns: string[];
	primaryKeyColumn: string | null;
};

export type ImportErrorStage = "validation" | "constraint" | "sql" | "runtime";

export type NormalizedImportError = {
	stage: ImportErrorStage;
	message: string;
	code?: string;
};

export type RowTransactionOutcome =
	| {
			ok: true;
			touchedTables: string[];
	  }
	| {
			ok: false;
			touchedTables: string[];
			error: NormalizedImportError;
	  };

const normalizeZodError = (error: z.ZodError): string => {
	return error.issues.map((issue) => issue.message).join("; ");
};

export const parseBatchImportConfig = (raw: string): ParsedBatchImportConfig => {
	let parsedUnknown: unknown;
	try {
		parsedUnknown = JSON.parse(raw) as unknown;
	} catch {
		throw new Error("Invalid batch payload JSON.");
	}

	const parsed = batchImportConfigSchema.safeParse(parsedUnknown);
	if (!parsed.success) {
		throw new Error(normalizeZodError(parsed.error));
	}

	return {
		files: parsed.data.files as BatchImportFileConfig[],
		relationships: parsed.data.relationships as ForeignKeyDef[],
	};
};

export const mergeRuntimePolicy = (
	policyByTable: Map<string, RuntimeTableConfig>,
	policy: RuntimeTableConfig,
) => {
	const existing = policyByTable.get(policy.tableName);
	if (!existing) {
		policyByTable.set(policy.tableName, policy);
		return;
	}

	if (
		existing.tableMode !== policy.tableMode ||
		existing.writeMode !== policy.writeMode ||
		existing.primaryKeyColumn !== policy.primaryKeyColumn ||
		existing.conflictColumns.join(",") !== policy.conflictColumns.join(",")
	) {
		throw new Error(
			`Conflicting write policy detected for table ${policy.tableName}.`,
		);
	}
};

export const getColumnsForAdvancedCreatedTable = (
	fileConfig: BatchImportFileConfig,
	tableName: string,
): CsvColumnDef[] => {
	if (fileConfig.importMode !== "advanced" || !fileConfig.advancedConfig) {
		return [];
	}

	const sourceColumns = new Map(
		fileConfig.columns.map((column) => [column.name, column]),
	);
	const tableColumns = new Map<string, CsvColumnDef>();

	for (const [header, target] of Object.entries(
		fileConfig.advancedConfig.columnTargets,
	)) {
		if (!target || target.tableName !== tableName) {
			continue;
		}

		const sourceColumn = sourceColumns.get(header);
		if (!sourceColumn || tableColumns.has(target.columnName)) {
			continue;
		}

		tableColumns.set(target.columnName, {
			...sourceColumn,
			name: target.columnName,
		});
	}

	return Array.from(tableColumns.values());
};

export const getFileGeneratedLinks = (
	fileConfig: BatchImportFileConfig,
): GeneratedIdLink[] => {
	if (
		fileConfig.importMode !== "advanced" ||
		!fileConfig.advancedConfig ||
		fileConfig.advancedConfig.rowLinkStrategy.mode !== "generated_id"
	) {
		return [];
	}

	return fileConfig.advancedConfig.rowLinkStrategy.links;
};

const buildRowPayloads = (
	record: Record<string, unknown>,
	fileConfig: BatchImportFileConfig,
): Map<string, Record<string, unknown>> => {
	const rowsByTable = new Map<string, Record<string, unknown>>();

	if (fileConfig.importMode === "simple") {
		const simple = fileConfig.simpleConfig;
		if (!simple) {
			throw new Error(`Missing simple config for file ${fileConfig.fileName}.`);
		}

		const row: Record<string, unknown> = {};
		for (const [csvHeader, tableColumn] of Object.entries(simple.mapping)) {
			if (!tableColumn) {
				continue;
			}
			row[tableColumn] = record[csvHeader];
		}

		const validated = rowValueSchema.safeParse(row);
		if (!validated.success) {
			throw new z.ZodError(validated.error.issues);
		}

		rowsByTable.set(simple.tableName, validated.data);
		return rowsByTable;
	}

	const advanced = fileConfig.advancedConfig;
	if (!advanced) {
		throw new Error(`Missing advanced config for file ${fileConfig.fileName}.`);
	}

	for (const [header, target] of Object.entries(advanced.columnTargets)) {
		if (
			!target ||
			target.tableName.trim() === "" ||
			target.columnName.trim() === ""
		) {
			continue;
		}

		const current = rowsByTable.get(target.tableName) ?? {};
		current[target.columnName] = record[header];
		rowsByTable.set(target.tableName, current);
	}

	for (const [tableName, row] of rowsByTable.entries()) {
		const validated = rowValueSchema.safeParse(row);
		if (!validated.success) {
			throw new z.ZodError(validated.error.issues);
		}
		rowsByTable.set(tableName, validated.data);
	}

	return rowsByTable;
};

const selectOneByColumns = async (
	db: DynamicDb,
	tableName: string,
	criteria: Record<string, unknown>,
) => {
	let query = db.selectFrom(tableName as never).selectAll();
	for (const [column, value] of Object.entries(criteria)) {
		query = query.where(column as never, "=", value as never);
	}

	return (await query.executeTakeFirst()) as Record<string, unknown> | undefined;
};

const resolveParentKeyValue = async (
	db: DynamicDb,
	row: Record<string, unknown>,
	policy: RuntimeTableConfig,
	parentKeyColumn: string,
) => {
	if (row[parentKeyColumn] !== undefined && row[parentKeyColumn] !== null) {
		return row[parentKeyColumn];
	}

	let criteria: Record<string, unknown> = {};
	if (policy.conflictColumns.length > 0) {
		for (const column of policy.conflictColumns) {
			if (row[column] !== undefined) {
				criteria[column] = row[column];
			}
		}
	}

	if (Object.keys(criteria).length === 0) {
		criteria = Object.fromEntries(
			Object.entries(row).filter(([, value]) => value !== undefined),
		);
	}

	if (Object.keys(criteria).length === 0) {
		return undefined;
	}

	const found = await selectOneByColumns(db, policy.tableName, criteria);
	return found?.[parentKeyColumn];
};

const executeTableWrite = async (
	db: DynamicDb,
	driver: DbDriver,
	tablePolicy: RuntimeTableConfig,
	row: Record<string, unknown>,
) => {
	const values = Object.fromEntries(
		Object.entries(row).filter(([, value]) => value !== undefined),
	);

	if (tablePolicy.writeMode === "insert") {
		await db.insertInto(tablePolicy.tableName as never).values(values).execute();
		return;
	}

	if (tablePolicy.conflictColumns.length === 0) {
		throw new Error(
			`Table ${tablePolicy.tableName} is set to upsert but has no conflict columns.`,
		);
	}

	const missingColumns = tablePolicy.conflictColumns.filter(
		(column) => values[column] === undefined,
	);

	if (missingColumns.length > 0) {
		throw new Error(
			`Upsert conflict column(s) missing for ${tablePolicy.tableName}: ${missingColumns.join(", ")}.`,
		);
	}

	const updateValues = Object.fromEntries(
		Object.entries(values).filter(
			([column]) => !tablePolicy.conflictColumns.includes(column),
		),
	);

	if (driver === "mysql") {
		const mysqlUpdateValues =
			Object.keys(updateValues).length > 0
				? updateValues
				: Object.fromEntries(
						tablePolicy.conflictColumns.map((column) => [column, values[column]]),
					);

		await db
			.insertInto(tablePolicy.tableName as never)
			.values(values)
			.onDuplicateKeyUpdate(mysqlUpdateValues as never)
			.execute();
		return;
	}

	const insert = db.insertInto(tablePolicy.tableName as never).values(values);
	await insert
		.onConflict((conflict) => {
			const target = conflict.columns(tablePolicy.conflictColumns as never);
			return Object.keys(updateValues).length > 0
				? target.doUpdateSet(updateValues as never)
				: target.doNothing();
		})
		.execute();
};

export const normalizeImportError = (error: unknown): NormalizedImportError => {
	if (error instanceof z.ZodError) {
		return {
			stage: "validation",
			message: normalizeZodError(error),
		};
	}

	if (error instanceof Error) {
		const sqlLike = error as Error & {
			code?: string;
			errno?: number;
			sqlState?: string;
		};
		const code = sqlLike.code ?? sqlLike.sqlState ?? undefined;
		const message = error.message;

		if (
			typeof code === "string" &&
			[
				"23503",
				"23505",
				"23502",
				"23000",
				"23001",
				"SQLITE_CONSTRAINT",
				"SQLITE_CONSTRAINT_FOREIGNKEY",
				"SQLITE_CONSTRAINT_UNIQUE",
			].includes(code)
		) {
			return {
				stage: "constraint",
				code,
				message,
			};
		}

		if (code) {
			return {
				stage: "sql",
				code,
				message,
			};
		}

		return {
			stage: "runtime",
			message,
		};
	}

	return {
		stage: "runtime",
		message: "Unexpected import error.",
	};
};

export const formatImportErrorMessage = (error: NormalizedImportError): string => {
	const code = error.code ? ` [${error.code}]` : "";
	return `${error.stage.toUpperCase()}${code}: ${error.message}`;
};

export const recordToRejectCsvCell = (record: Record<string, unknown>) =>
	JSON.stringify(record).replaceAll('"', '""');

export const executeRowTransaction = async (params: {
	db: DynamicDb;
	driver: DbDriver;
	fileConfig: BatchImportFileConfig;
	record: Record<string, unknown>;
	orderedTableNames: string[];
	policyByTable: Map<string, RuntimeTableConfig>;
	generatedLinks: GeneratedIdLink[];
}): Promise<RowTransactionOutcome> => {
	const rowPayloads = buildRowPayloads(params.record, params.fileConfig);
	const touchedTables = params.orderedTableNames.filter((tableName) =>
		rowPayloads.has(tableName),
	);

	if (touchedTables.length === 0) {
		return { ok: true, touchedTables: [] };
	}

	try {
		await params.db.transaction().execute(async (trx) => {
			const generatedValues = new Map<string, unknown>();

			for (const tableName of touchedTables) {
				const tableRow = rowPayloads.get(tableName);
				if (!tableRow) {
					continue;
				}

				for (const link of params.generatedLinks) {
					if (link.childTable !== tableName) {
						continue;
					}

					if (tableRow[link.childForeignKeyColumn] !== undefined) {
						continue;
					}

					const parentKey = `${link.parentTable}.${link.parentKeyColumn}`;
					const resolvedValue = generatedValues.get(parentKey);
					if (resolvedValue === undefined) {
						throw new Error(
							`Missing generated value for ${parentKey} while writing ${tableName}.${link.childForeignKeyColumn}.`,
						);
					}

					tableRow[link.childForeignKeyColumn] = resolvedValue;
				}

				const tablePolicy = params.policyByTable.get(tableName);
				if (!tablePolicy) {
					throw new Error(`Missing table policy for table ${tableName}.`);
				}

				await executeTableWrite(trx, params.driver, tablePolicy, tableRow);

				for (const link of params.generatedLinks) {
					if (link.parentTable !== tableName) {
						continue;
					}

					const parentPolicy = params.policyByTable.get(link.parentTable);
					if (!parentPolicy) {
						continue;
					}

					const parentValue = await resolveParentKeyValue(
						trx,
						tableRow,
						parentPolicy,
						link.parentKeyColumn,
					);

					if (parentValue === undefined || parentValue === null) {
						throw new Error(
							`Unable to resolve generated key ${link.parentTable}.${link.parentKeyColumn}.`,
						);
					}

					generatedValues.set(
						`${link.parentTable}.${link.parentKeyColumn}`,
						parentValue,
					);
				}
			}
		});

		return {
			ok: true,
			touchedTables,
		};
	} catch (error) {
		return {
			ok: false,
			touchedTables,
			error: normalizeImportError(error),
		};
	}
};
