import { createServerFn } from "@tanstack/react-start";
import { parse } from "csv-parse";
import { sql } from "kysely";
import { CSV_SAMPLE_ROW_COUNT } from "../lib/constants";
import { savedConnectionToCredentials } from "../lib/credentials";
import {
	type BatchImportTableConfig,
	type CsvColumnDef,
	type ForeignKeyDef,
	getDbColumnType,
} from "../lib/csv-import-types";
import { type DbDriver, getKyselyInstance } from "../lib/db/connection";
import { extractErrorMessage } from "../lib/errors";
import type { Result } from "../lib/result";
import { quoteIdentifier } from "./db-helpers/sql-utils";
import { getSavedConnectionById } from "./saved-connections";
import { withTunnel } from "./ssh-tunnel";

type AnalyzeCsvInput = {
	fileContent: string;
};

type AnalyzeCsvResult = Result<{
	headers: string[];
	sampleRows: Record<string, string>[];
	rowCount: number;
	delimiter: "," | ";";
}>;

type CreateTableInput = {
	connectionId: number;
	tableName: string;
	columns: CsvColumnDef[];
	primaryKeyColumn: string | null;
};

type CreateTableResult = Result<object>;

/**
 * Analyze a CSV file and extract headers + sample rows
 */
export const analyzeCsvFn = createServerFn({ method: "POST" })
	.inputValidator((input: AnalyzeCsvInput) => input)
	.handler(async ({ data: input }): Promise<AnalyzeCsvResult> => {
		try {
			const { fileContent } = input;

			// Detect delimiter from first line
			const firstLine = fileContent.split("\n")[0] ?? "";
			const commaCount = (firstLine.match(/,/g) ?? []).length;
			const semicolonCount = (firstLine.match(/;/g) ?? []).length;
			const delimiter = semicolonCount > commaCount ? ";" : ",";

			return new Promise((resolve) => {
				const rows: Record<string, string>[] = [];
				let headers: string[] = [];
				let rowCount = 0;

				const parser = parse({
					columns: (headerRow: string[]) => {
						headers = headerRow;
						return headerRow;
					},
					skip_empty_lines: true,
					delimiter,
					relax_quotes: true,
					relax_column_count: true,
				});

				parser.on("readable", () => {
					let record: Record<string, string> | null = parser.read();
					while (record !== null) {
						rowCount++;
						if (rows.length < CSV_SAMPLE_ROW_COUNT) {
							rows.push(record);
						}
						record = parser.read();
					}
				});

				parser.on("end", () => {
					resolve({
						success: true,
						headers,
						sampleRows: rows,
						rowCount,
						delimiter,
					});
				});

				parser.on("error", (err) => {
					resolve({
						success: false,
						error: err.message,
					});
				});

				parser.write(fileContent);
				parser.end();
			});
		} catch (error) {
			return {
				success: false,
				error: extractErrorMessage(error, "CSV analysis failed"),
			};
		}
	});

/**
 * Build a CREATE TABLE statement for a given driver
 */
const buildCreateTableSql = (
	tableName: string,
	columns: CsvColumnDef[],
	primaryKeyColumn: string | null,
	driver: DbDriver,
): string => {
	const columnDefs = columns.map((col) => {
		const columnType = col.userType ?? col.inferredType;
		const sqlType = getDbColumnType(columnType, driver);
		const nullability = col.nullable ? "" : " NOT NULL";
		const pk = col.name === primaryKeyColumn ? " PRIMARY KEY" : "";
		return `${quoteIdentifier(col.name, driver)} ${sqlType}${nullability}${pk}`;
	});

	return `CREATE TABLE ${quoteIdentifier(tableName, driver)} (\n  ${columnDefs.join(",\n  ")}\n)`;
};

/**
 * Create a new table in the database
 */
export const createTableFn = createServerFn({ method: "POST" })
	.inputValidator((input: CreateTableInput) => input)
	.handler(async ({ data: input }): Promise<CreateTableResult> => {
		const connection = getSavedConnectionById(input.connectionId);

		if (!connection) {
			return { success: false, error: "Connection not found" };
		}

		const credentials = savedConnectionToCredentials(connection);

		try {
			await withTunnel(credentials, async (tunneledCreds) => {
				const db = getKyselyInstance(tunneledCreds);

				try {
					const createSql = buildCreateTableSql(
						input.tableName,
						input.columns,
						input.primaryKeyColumn,
						tunneledCreds.driver,
					);

					await sql.raw(createSql).execute(db);
				} finally {
					await db.destroy();
				}
			});

			return { success: true };
		} catch (error) {
			return {
				success: false,
				error: extractErrorMessage(error, "Failed to create table"),
			};
		}
	});

/**
 * Topologically sort tables based on foreign key dependencies
 * Returns tables in order they should be imported (parents before children)
 */
export const sortTablesByDependencies = (
	tables: BatchImportTableConfig[],
	relationships: ForeignKeyDef[],
): { sorted: BatchImportTableConfig[]; hasCycle: boolean } => {
	const tableNames = new Set(tables.map((t) => t.tableName));
	const inDegree = new Map<string, number>();
	const adjacency = new Map<string, string[]>();

	// Initialize
	for (const table of tables) {
		inDegree.set(table.tableName, 0);
		adjacency.set(table.tableName, []);
	}

	// Build graph from relationships
	for (const rel of relationships) {
		if (tableNames.has(rel.sourceTable) && tableNames.has(rel.targetTable)) {
			// sourceTable depends on targetTable (FK points to target)
			adjacency.get(rel.targetTable)?.push(rel.sourceTable);
			inDegree.set(rel.sourceTable, (inDegree.get(rel.sourceTable) ?? 0) + 1);
		}
	}

	// Kahn's algorithm for topological sort
	const queue: string[] = [];
	const sorted: string[] = [];

	for (const [name, degree] of inDegree) {
		if (degree === 0) {
			queue.push(name);
		}
	}

	while (queue.length > 0) {
		const current = queue.shift();
		if (!current) break;
		sorted.push(current);

		for (const neighbor of adjacency.get(current) ?? []) {
			const newDegree = (inDegree.get(neighbor) ?? 0) - 1;
			inDegree.set(neighbor, newDegree);
			if (newDegree === 0) {
				queue.push(neighbor);
			}
		}
	}

	// Check for cycle
	const hasCycle = sorted.length !== tables.length;

	// Map sorted names back to table configs
	const tableMap = new Map(tables.map((t) => [t.tableName, t]));
	const sortedTables = hasCycle
		? tables
		: sorted
				.map((name) => tableMap.get(name))
				.filter((t): t is BatchImportTableConfig => t !== undefined);

	return { sorted: sortedTables, hasCycle };
};
