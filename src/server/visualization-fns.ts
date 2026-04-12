import { createServerFn } from "@tanstack/react-start";
import { type Kysely, sql } from "kysely";

import { normalizeCredentials } from "../lib/credentials";
import { type DbCredentials, getKyselyInstance } from "../lib/db/connection";
import { extractErrorMessage } from "../lib/errors";
import type { Result } from "../lib/result";
import {
	classifyVisualizationColumnKind,
	VISUALIZATION_AGGREGATIONS,
	VISUALIZATION_CHART_TYPES,
	VISUALIZATION_LIMITS,
	VISUALIZATION_MODES,
	VISUALIZATION_TIME_GRAINS,
} from "../lib/visualization";
import type { SavedConnection } from "./connection-fns";
import { getPrimaryKeyColumnsForTable } from "./db-helpers/introspection";
import { quoteIdentifier } from "./db-helpers/sql-utils";
import {
	buildVisualizationQuerySql,
	mapRowsToVisualizationPoints,
	resolveVisualizationQueryConfig,
	type VisualizationQueryConfigInput,
	type VisualizationTableSchema,
} from "./db-helpers/visualization-query-builder";
import {
	loadTableMutationContext,
	parseRowIdentity,
	parseRowValues,
	RowValidationError,
} from "./db-helpers/visualization-row-mutation";
import { buildVisualizationTableDataQueries } from "./db-helpers/visualization-table-query";
import {
	normalizeVisualizationTableDataRequest as normalizeVisualizationTableDataRequestHelper,
	type TableFilterInput,
	type TableSortInput,
	toVisualizationTableSchema,
	type VisualizationTableDataRequestInput,
} from "./db-helpers/visualization-table-request";
import { withTunnel } from "./ssh-tunnel";

type ActiveConnectionInput = DbCredentials | SavedConnection;

type GetVisualizationMetadataInput = {
	connection: ActiveConnectionInput;
	includeRowEstimates?: boolean;
};

type RunVisualizationQueryInput = {
	connection: ActiveConnectionInput;
	query: VisualizationQueryConfigInput;
};

type GetVisualizationTableDataInput = {
	connection: ActiveConnectionInput;
	request: VisualizationTableDataRequestInput;
};

export type {
	TableFilterInput,
	TableSortInput,
	VisualizationTableDataRequestInput,
} from "./db-helpers/visualization-table-request";
export const normalizeVisualizationTableDataRequest =
	normalizeVisualizationTableDataRequestHelper;

type CreateVisualizationTableRowInput = {
	connection: ActiveConnectionInput;
	tableName: string;
	values: Record<string, unknown>;
};

type UpdateVisualizationTableRowInput = {
	connection: ActiveConnectionInput;
	tableName: string;
	rowIdentity: Record<string, unknown>;
	values: Record<string, unknown>;
};

export type VisualizationColumnMetadata = {
	name: string;
	dataType: string;
	kind: "numeric" | "temporal" | "boolean" | "categorical" | "unknown";
	isNullable: boolean;
	isPrimaryKey: boolean;
	isAutoIncrementing: boolean;
};

export type VisualizationTableMetadata = {
	tableName: string;
	rowCountEstimate: number | null;
	columns: VisualizationColumnMetadata[];
};

export type VisualizationMetadataSuccess = {
	tables: VisualizationTableMetadata[];
	limits: typeof VISUALIZATION_LIMITS;
	contract: {
		chartTypes: readonly string[];
		modes: readonly string[];
		aggregations: readonly string[];
		timeGrains: readonly string[];
	};
};

export type VisualizationMetadataResult = Result<VisualizationMetadataSuccess>;

export type VisualizationChartPoint = {
	x: string;
	y: number;
};

type VisualizationCellValue = NonNullable<unknown>;

type VisualizationQuerySuccess = {
	points: VisualizationChartPoint[];
	meta: {
		tableName: string;
		chartType: string;
		mode: string;
		aggregation: string;
		timeGrain: string | null;
		limit: number;
		returnedPoints: number;
		truncated: boolean;
	};
};

export type VisualizationQueryResult = Result<VisualizationQuerySuccess>;

export type VisualizationTableDataSuccess = {
	tableName: string;
	columns: VisualizationColumnMetadata[];
	rows: Array<Record<string, VisualizationCellValue>>;
	rowIdentities: Array<Record<string, VisualizationCellValue>>;
	primaryKeyColumns: string[];
	totalRows: number;
	pageIndex: number;
	pageSize: number;
	pageCount: number;
	sorting: TableSortInput[];
	filters: TableFilterInput[];
	limits: {
		defaultPageSize: number;
		maxTablePageSize: number;
	};
};

export type VisualizationTableDataResult =
	Result<VisualizationTableDataSuccess>;

export type VisualizationRowMutationResult =
	| { success: true; message: string }
	| {
			success: false;
			error: string;
			fieldErrors?: Record<string, string>;
	  };

const normalizeRowEstimateValue = (value: unknown): number | null => {
	if (typeof value === "number") {
		return Number.isFinite(value) && value >= 0 ? Math.trunc(value) : null;
	}

	if (typeof value === "bigint") {
		const casted = Number(value);
		return Number.isFinite(casted) && casted >= 0 ? Math.trunc(casted) : null;
	}

	if (typeof value === "string") {
		const parsed = Number(value);
		return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : null;
	}

	return null;
};

const getRowEstimateForTable = async (
	db: Kysely<unknown>,
	driver: DbCredentials["driver"],
	tableName: string,
): Promise<number | null> => {
	const query = `SELECT COUNT(*) AS row_count FROM ${quoteIdentifier(tableName, driver)}`;
	const result = await sql.raw(query).execute(db);
	const firstRow = (result.rows as Array<Record<string, unknown>>)[0];
	const firstValue = firstRow ? firstRow.row_count : null;

	return normalizeRowEstimateValue(firstValue);
};

const withTimeout = async <T>(
	promise: Promise<T>,
	timeoutMs: number,
): Promise<T> => {
	let timeoutId: ReturnType<typeof setTimeout> | null = null;

	try {
		return await Promise.race([
			promise,
			new Promise<T>((_, reject) => {
				timeoutId = setTimeout(() => {
					reject(
						new Error(
							`Visualization query timed out after ${timeoutMs}ms. Try fewer groups or a coarser time grain.`,
						),
					);
				}, timeoutMs);
			}),
		]);
	} finally {
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
	}
};

export const getVisualizationMetadataFn = createServerFn({ method: "POST" })
	.inputValidator((input: GetVisualizationMetadataInput) => input)
	.handler(async ({ data: input }): Promise<VisualizationMetadataResult> => {
		const credentials = normalizeCredentials(input.connection);

		try {
			const tables = await withTunnel(credentials, async (tunneledCreds) => {
				const db = getKyselyInstance(tunneledCreds);

				try {
					const introspectedTables = await db.introspection.getTables();
					const sortedTables = [...introspectedTables].sort((a, b) =>
						a.name.localeCompare(b.name),
					);

					return await Promise.all(
						sortedTables.map(
							async (table, index): Promise<VisualizationTableMetadata> => {
								const primaryKeyColumns = await getPrimaryKeyColumnsForTable(
									db,
									tunneledCreds.driver,
									table.name,
								);
								const columns = table.columns.map((column) => ({
									name: column.name,
									dataType: column.dataType,
									kind: classifyVisualizationColumnKind(column.dataType),
									isNullable: column.isNullable,
									isPrimaryKey: primaryKeyColumns.has(column.name),
									isAutoIncrementing: Boolean(
										(column as { isAutoIncrementing?: boolean })
											.isAutoIncrementing,
									),
								}));

								const shouldEstimateRows =
									Boolean(input.includeRowEstimates) &&
									index < VISUALIZATION_LIMITS.maxTablesForRowEstimate;
								const rowCountEstimate = shouldEstimateRows
									? await getRowEstimateForTable(
											db,
											tunneledCreds.driver,
											table.name,
										)
									: null;

								return {
									tableName: table.name,
									rowCountEstimate,
									columns,
								};
							},
						),
					);
				} finally {
					await db.destroy();
				}
			});

			return {
				success: true,
				tables,
				limits: VISUALIZATION_LIMITS,
				contract: {
					chartTypes: VISUALIZATION_CHART_TYPES,
					modes: VISUALIZATION_MODES,
					aggregations: VISUALIZATION_AGGREGATIONS,
					timeGrains: VISUALIZATION_TIME_GRAINS,
				},
			};
		} catch (error) {
			return {
				success: false,
				error: extractErrorMessage(
					error,
					"Failed to load visualization metadata.",
				),
			};
		}
	});

export const runVisualizationQueryFn = createServerFn({ method: "POST" })
	.inputValidator((input: RunVisualizationQueryInput) => input)
	.handler(async ({ data: input }): Promise<VisualizationQueryResult> => {
		const credentials = normalizeCredentials(input.connection);

		try {
			const queryResult = await withTunnel(
				credentials,
				async (tunneledCreds) => {
					const db = getKyselyInstance(tunneledCreds);

					try {
						const tables = await db.introspection.getTables();
						const matchingTable = tables.find(
							(table) => table.name === input.query.tableName,
						);

						if (!matchingTable) {
							throw new Error(`Unknown table: ${input.query.tableName}`);
						}

						const tableSchema = toVisualizationTableSchema(matchingTable);
						const resolvedQuery = resolveVisualizationQueryConfig(
							input.query,
							tableSchema,
						);
						const querySql = buildVisualizationQuerySql({
							driver: tunneledCreds.driver,
							config: resolvedQuery,
						});
						const result = await withTimeout(
							sql.raw(querySql).execute(db),
							VISUALIZATION_LIMITS.queryTimeoutMs,
						);
						const { points, truncated } = mapRowsToVisualizationPoints(
							result.rows as Array<Record<string, unknown>>,
							resolvedQuery.limit,
						);

						return {
							points,
							meta: {
								tableName: resolvedQuery.tableName,
								chartType: resolvedQuery.chartType,
								mode: resolvedQuery.mode,
								aggregation: resolvedQuery.aggregation,
								timeGrain: resolvedQuery.timeGrain,
								limit: resolvedQuery.limit,
								returnedPoints: points.length,
								truncated,
							},
						};
					} finally {
						await db.destroy();
					}
				},
			);

			return {
				success: true,
				points: queryResult.points,
				meta: queryResult.meta,
			};
		} catch (error) {
			return {
				success: false,
				error: extractErrorMessage(error, "Visualization query failed."),
			};
		}
	});

export const getVisualizationTableDataFn = createServerFn({ method: "POST" })
	.inputValidator((input: GetVisualizationTableDataInput) => input)
	.handler(async ({ data: input }): Promise<VisualizationTableDataResult> => {
		const credentials = normalizeCredentials(input.connection);

		try {
			const payload = await withTunnel(credentials, async (tunneledCreds) => {
				const db = getKyselyInstance(tunneledCreds);

				try {
					const introspectedTables = await db.introspection.getTables();
					const matchingTable = introspectedTables.find(
						(table) => table.name === input.request.tableName,
					);

					if (!matchingTable) {
						throw new Error(`Unknown table: ${input.request.tableName}`);
					}

					const primaryKeyColumnsSet = await getPrimaryKeyColumnsForTable(
						db,
						tunneledCreds.driver,
						matchingTable.name,
					);
					const enrichedColumns: VisualizationColumnMetadata[] =
						matchingTable.columns.map((column) => ({
							name: column.name,
							dataType: column.dataType,
							kind: classifyVisualizationColumnKind(column.dataType),
							isNullable: column.isNullable,
							isPrimaryKey: primaryKeyColumnsSet.has(column.name),
							isAutoIncrementing: Boolean(
								(column as { isAutoIncrementing?: boolean }).isAutoIncrementing,
							),
						}));
					const tableSchema: VisualizationTableSchema = {
						tableName: matchingTable.name,
						columns: enrichedColumns.map((column) => ({
							name: column.name,
							dataType: column.dataType,
							kind: column.kind,
						})),
					};
					const normalizedRequest = normalizeVisualizationTableDataRequest(
						input.request,
						tableSchema,
					);
					const { dataQuery, countQuery } = buildVisualizationTableDataQueries({
						db,
						driver: tunneledCreds.driver,
						request: normalizedRequest,
						tableSchema,
					});

					const [rows, countRow] = await Promise.all([
						withTimeout(
							dataQuery.execute() as Promise<Array<Record<string, unknown>>>,
							VISUALIZATION_LIMITS.queryTimeoutMs,
						),
						withTimeout(
							countQuery.executeTakeFirst() as Promise<
								Record<string, unknown> | undefined
							>,
							VISUALIZATION_LIMITS.queryTimeoutMs,
						),
					]);
					const totalRows = normalizeRowEstimateValue(countRow?.total) ?? 0;
					const pageCount = Math.ceil(totalRows / normalizedRequest.pageSize);
					const primaryKeyColumns = Array.from(primaryKeyColumnsSet);
					const rowIdentities = rows.map((row) => {
						const identity: Record<string, VisualizationCellValue> = {};

						for (const primaryKeyColumn of primaryKeyColumns) {
							const value = row[primaryKeyColumn];

							if (value === undefined || value === null) {
								continue;
							}

							identity[primaryKeyColumn] = value as VisualizationCellValue;
						}

						return identity;
					});

					return {
						tableName: normalizedRequest.tableName,
						columns: enrichedColumns,
						rows: rows as Array<Record<string, VisualizationCellValue>>,
						rowIdentities,
						primaryKeyColumns,
						totalRows,
						pageIndex: normalizedRequest.pageIndex,
						pageSize: normalizedRequest.pageSize,
						pageCount,
						sorting: normalizedRequest.sorting,
						filters: normalizedRequest.filters,
						limits: {
							defaultPageSize: VISUALIZATION_LIMITS.defaultTablePageSize,
							maxTablePageSize: VISUALIZATION_LIMITS.maxTablePageSize,
						},
					};
				} finally {
					await db.destroy();
				}
			});

			return {
				success: true,
				...payload,
			};
		} catch (error) {
			return {
				success: false,
				error: extractErrorMessage(error, "Failed to load table data."),
			};
		}
	});

export const createVisualizationTableRowFn = createServerFn({ method: "POST" })
	.inputValidator((input: CreateVisualizationTableRowInput) => input)
	.handler(async ({ data: input }): Promise<VisualizationRowMutationResult> => {
		const credentials = normalizeCredentials(input.connection);

		try {
			await withTunnel(credentials, async (tunneledCreds) => {
				const db = getKyselyInstance(tunneledCreds);

				try {
					const { columns } = await loadTableMutationContext(
						db,
						tunneledCreds.driver,
						input.tableName,
					);
					const parsedValues = parseRowValues(columns, input.values, {
						allowPrimaryKeyWrite: true,
						requireAtLeastOneValue: true,
					});

					await withTimeout(
						db
							.insertInto(input.tableName as never)
							.values(parsedValues as never)
							.execute(),
						VISUALIZATION_LIMITS.queryTimeoutMs,
					);
				} finally {
					await db.destroy();
				}
			});

			return {
				success: true,
				message: "Row created successfully.",
			};
		} catch (error) {
			if (error instanceof RowValidationError) {
				return {
					success: false,
					error: error.message,
					fieldErrors: error.fieldErrors,
				};
			}

			return {
				success: false,
				error: extractErrorMessage(error, "Failed to create row."),
			};
		}
	});

export const updateVisualizationTableRowFn = createServerFn({ method: "POST" })
	.inputValidator((input: UpdateVisualizationTableRowInput) => input)
	.handler(async ({ data: input }): Promise<VisualizationRowMutationResult> => {
		const credentials = normalizeCredentials(input.connection);

		try {
			await withTunnel(credentials, async (tunneledCreds) => {
				const db = getKyselyInstance(tunneledCreds);

				try {
					const { columns, primaryKeyColumns } = await loadTableMutationContext(
						db,
						tunneledCreds.driver,
						input.tableName,
					);
					const parsedValues = parseRowValues(columns, input.values, {
						allowPrimaryKeyWrite: false,
						requireAtLeastOneValue: true,
					});
					const parsedIdentity = parseRowIdentity(
						primaryKeyColumns,
						columns,
						input.rowIdentity,
					);

					let updateQuery = db
						.updateTable(input.tableName as never)
						.set(parsedValues as never);

					for (const [pkColumn, pkValue] of Object.entries(parsedIdentity)) {
						updateQuery = updateQuery.where(
							db.dynamic.ref(pkColumn) as never,
							"=",
							pkValue as never,
						);
					}

					const updateResult = await withTimeout(
						updateQuery.executeTakeFirst(),
						VISUALIZATION_LIMITS.queryTimeoutMs,
					);
					const updatedRows =
						normalizeRowEstimateValue(updateResult?.numUpdatedRows) ?? 0;

					if (updatedRows === 0) {
						let existenceQuery = db
							.selectFrom(input.tableName as never)
							.select(sql<number>`COUNT(*)`.as("total"));

						for (const [pkColumn, pkValue] of Object.entries(parsedIdentity)) {
							existenceQuery = existenceQuery.where(
								db.dynamic.ref(pkColumn) as never,
								"=",
								pkValue as never,
							);
						}

						const existingRow = await withTimeout(
							existenceQuery.executeTakeFirst() as Promise<
								Record<string, unknown> | undefined
							>,
							VISUALIZATION_LIMITS.queryTimeoutMs,
						);
						const existingCount =
							normalizeRowEstimateValue(existingRow?.total) ?? 0;

						if (existingCount === 0) {
							throw new Error(
								"No row was updated. The target row may no longer exist.",
							);
						}
					}
				} finally {
					await db.destroy();
				}
			});

			return {
				success: true,
				message: "Row updated successfully.",
			};
		} catch (error) {
			if (error instanceof RowValidationError) {
				return {
					success: false,
					error: error.message,
					fieldErrors: error.fieldErrors,
				};
			}

			return {
				success: false,
				error: extractErrorMessage(error, "Failed to update row."),
			};
		}
	});
