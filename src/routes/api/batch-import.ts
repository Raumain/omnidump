import { mkdirSync, rmSync } from "node:fs";
import { createFileRoute } from "@tanstack/react-router";
import { parse } from "csv-parse";
import { sql } from "kysely";

import type {
	BatchImportFileConfig,
	BatchImportProgressEvent,
	BatchImportTableConfig,
	ColumnTarget,
	CsvColumnDef,
	ForeignKeyDef,
	GeneratedIdLink,
	RowLinkStrategy,
	TableWritePolicy,
} from "../../lib/csv-import-types";
import { getDbColumnType } from "../../lib/csv-import-types";
import type { DbCredentials } from "../../lib/db/connection";
import type { SavedConnection } from "../../server/connection-fns";
import { sortTablesByDependencies } from "../../server/csv-import-fns";

type ParsedBatchImportConfig = {
	files: BatchImportFileConfig[];
	relationships: ForeignKeyDef[];
};

type RuntimeTableCounters = {
	totalRows: number;
	insertedRows: number;
	failedRows: number;
	rejectFileName: string;
	rejectFilePath: string;
};

type RuntimeTableConfig = {
	tableName: string;
	tableMode: "create" | "map";
	writeMode: "insert" | "upsert";
	conflictColumns: string[];
	primaryKeyColumn: string | null;
};

const toDbCredentials = (connection: SavedConnection): DbCredentials => {
	const normalizedDriver: DbCredentials["driver"] =
		connection.driver === "mysql" ||
		connection.driver === "sqlite" ||
		connection.driver === "postgres"
			? connection.driver
			: "postgres";

	return {
		driver: normalizedDriver,
		host: connection.host ?? undefined,
		port: connection.port ?? undefined,
		user: connection.user ?? undefined,
		password: connection.password ?? undefined,
		database: connection.database_name ?? undefined,
		useSsh: Boolean(connection.use_ssh),
		sshHost: connection.ssh_host ?? undefined,
		sshPort: connection.ssh_port ?? undefined,
		sshUser: connection.ssh_user ?? undefined,
		sshPrivateKey: connection.ssh_private_key ?? undefined,
	};
};

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const isRecordStringMap = (value: unknown): value is Record<string, string> => {
	if (!isObject(value)) {
		return false;
	}
	return Object.values(value).every((entry) => typeof entry === "string");
};

const isColumnTarget = (value: unknown): value is ColumnTarget => {
	if (!isObject(value)) {
		return false;
	}
	return (
		typeof value.tableName === "string" && typeof value.columnName === "string"
	);
};

const isGeneratedIdLink = (value: unknown): value is GeneratedIdLink => {
	if (!isObject(value)) {
		return false;
	}
	return (
		typeof value.id === "string" &&
		typeof value.parentTable === "string" &&
		typeof value.parentKeyColumn === "string" &&
		typeof value.childTable === "string" &&
		typeof value.childForeignKeyColumn === "string"
	);
};

const isRowLinkStrategy = (value: unknown): value is RowLinkStrategy => {
	if (!isObject(value)) {
		return false;
	}

	if (value.mode === "explicit_fk") {
		return Array.isArray(value.links) && value.links.length === 0;
	}

	if (value.mode === "generated_id") {
		return (
			Array.isArray(value.links) &&
			value.links.every((link) => isGeneratedIdLink(link))
		);
	}

	return false;
};

const isTableWritePolicy = (value: unknown): value is TableWritePolicy => {
	if (!isObject(value)) {
		return false;
	}

	return (
		typeof value.tableName === "string" &&
		(value.tableMode === "create" || value.tableMode === "map") &&
		(value.writeMode === "insert" || value.writeMode === "upsert") &&
		Array.isArray(value.conflictColumns) &&
		value.conflictColumns.every((column) => typeof column === "string") &&
		(value.primaryKeyColumn === null ||
			typeof value.primaryKeyColumn === "string")
	);
};

const isForeignKeyDef = (value: unknown): value is ForeignKeyDef => {
	if (!isObject(value)) {
		return false;
	}

	return (
		typeof value.id === "string" &&
		typeof value.sourceTable === "string" &&
		typeof value.sourceColumn === "string" &&
		typeof value.targetTable === "string" &&
		typeof value.targetColumn === "string"
	);
};

const isCsvColumnDef = (value: unknown): value is CsvColumnDef => {
	if (!isObject(value)) {
		return false;
	}

	return (
		typeof value.name === "string" &&
		typeof value.inferredType === "string" &&
		(value.userType === null || typeof value.userType === "string") &&
		typeof value.nullable === "boolean" &&
		Array.isArray(value.sampleValues)
	);
};

const parseBatchConfig = (raw: string): ParsedBatchImportConfig => {
	const parsed = JSON.parse(raw) as unknown;
	if (!isObject(parsed)) {
		throw new Error("Invalid batch payload.");
	}

	if (!Array.isArray(parsed.files) || parsed.files.length === 0) {
		throw new Error("Batch payload must provide at least one file config.");
	}

	const relationshipsRaw = parsed.relationships;
	if (
		!Array.isArray(relationshipsRaw) ||
		!relationshipsRaw.every(isForeignKeyDef)
	) {
		throw new Error("Batch payload relationships are invalid.");
	}

	const files = parsed.files.map((fileRaw, index) => {
		if (!isObject(fileRaw)) {
			throw new Error(`File config at index ${index} is invalid.`);
		}

		if (
			typeof fileRaw.fileName !== "string" ||
			fileRaw.fileName.trim() === ""
		) {
			throw new Error(`File config at index ${index} has invalid fileName.`);
		}

		if (
			!Array.isArray(fileRaw.columns) ||
			!fileRaw.columns.every(isCsvColumnDef)
		) {
			throw new Error(`File config ${fileRaw.fileName} has invalid columns.`);
		}

		if (fileRaw.importMode !== "simple" && fileRaw.importMode !== "advanced") {
			throw new Error(
				`File config ${fileRaw.fileName} has invalid importMode.`,
			);
		}

		if (fileRaw.importMode === "simple") {
			if (!isObject(fileRaw.simpleConfig)) {
				throw new Error(
					`File config ${fileRaw.fileName} is missing simpleConfig.`,
				);
			}
			const simple = fileRaw.simpleConfig;
			if (
				typeof simple.tableName !== "string" ||
				simple.tableName.trim() === "" ||
				(simple.tableMode !== "create" && simple.tableMode !== "map") ||
				(simple.writeMode !== "insert" && simple.writeMode !== "upsert") ||
				!Array.isArray(simple.conflictColumns) ||
				!simple.conflictColumns.every((column) => typeof column === "string") ||
				(simple.primaryKeyColumn !== null &&
					typeof simple.primaryKeyColumn !== "string") ||
				!isRecordStringMap(simple.mapping)
			) {
				throw new Error(
					`File config ${fileRaw.fileName} has invalid simpleConfig.`,
				);
			}
		}

		if (fileRaw.importMode === "advanced") {
			if (!isObject(fileRaw.advancedConfig)) {
				throw new Error(
					`File config ${fileRaw.fileName} is missing advancedConfig.`,
				);
			}

			const advanced = fileRaw.advancedConfig;
			if (!isObject(advanced.columnTargets)) {
				throw new Error(
					`File config ${fileRaw.fileName} has invalid advanced columnTargets.`,
				);
			}

			for (const [header, target] of Object.entries(advanced.columnTargets)) {
				if (target !== null && !isColumnTarget(target)) {
					throw new Error(
						`File config ${fileRaw.fileName} has invalid target for header ${header}.`,
					);
				}
			}

			if (
				!Array.isArray(advanced.tablePolicies) ||
				!advanced.tablePolicies.every(isTableWritePolicy)
			) {
				throw new Error(
					`File config ${fileRaw.fileName} has invalid advanced tablePolicies.`,
				);
			}

			if (!isRowLinkStrategy(advanced.rowLinkStrategy)) {
				throw new Error(
					`File config ${fileRaw.fileName} has invalid rowLinkStrategy.`,
				);
			}

			for (const policy of advanced.tablePolicies) {
				if (
					policy.writeMode === "upsert" &&
					policy.conflictColumns.length === 0
				) {
					throw new Error(
						`Table ${policy.tableName} is configured for upsert without conflict columns.`,
					);
				}
			}
		}

		return fileRaw as BatchImportFileConfig;
	});

	return {
		files,
		relationships: relationshipsRaw,
	};
};

const mergeRuntimePolicy = (
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

const buildCreateTableSql = (
	driver: DbCredentials["driver"],
	tableName: string,
	columns: CsvColumnDef[],
	primaryKeyColumn: string | null,
) => {
	const quote = (name: string) =>
		driver === "mysql" ? `\`${name}\`` : `"${name}"`;

	const definitions = columns.map((column) => {
		const type = getDbColumnType(
			column.userType ?? column.inferredType,
			driver,
		);
		const nullable = column.nullable ? "" : " NOT NULL";
		const primary = column.name === primaryKeyColumn ? " PRIMARY KEY" : "";
		return `${quote(column.name)} ${type}${nullable}${primary}`;
	});

	return `CREATE TABLE ${quote(tableName)} (\n  ${definitions.join(",\n  ")}\n)`;
};

const getColumnsForAdvancedCreatedTable = (
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
		rowsByTable.set(simple.tableName, row);
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

	return rowsByTable;
};

type SelectQueryLike = {
	where: (column: string, operator: "=", value: unknown) => SelectQueryLike;
	executeTakeFirst: () => Promise<unknown>;
};

type UpdateQueryLike = {
	where: (column: string, operator: "=", value: unknown) => UpdateQueryLike;
	execute: () => Promise<unknown>;
};

type InsertQueryLike = {
	values: (row: Record<string, unknown>) => {
		execute: () => Promise<unknown>;
	};
};

type DbLike = {
	selectFrom: (tableName: string) => {
		selectAll: () => SelectQueryLike;
	};
	updateTable: (tableName: string) => {
		set: (row: Record<string, unknown>) => UpdateQueryLike;
	};
	insertInto: (tableName: string) => InsertQueryLike;
};

const selectOneByColumns = async (
	db: unknown,
	tableName: string,
	criteria: Record<string, unknown>,
) => {
	const typedDb = db as DbLike;
	let query = typedDb.selectFrom(tableName).selectAll();
	for (const [column, value] of Object.entries(criteria)) {
		query = query.where(column, "=", value);
	}
	return (await query.executeTakeFirst()) as
		| Record<string, unknown>
		| undefined;
};

const updateByColumns = async (
	db: unknown,
	tableName: string,
	criteria: Record<string, unknown>,
	row: Record<string, unknown>,
) => {
	const typedDb = db as DbLike;
	let query = typedDb.updateTable(tableName).set(row);
	for (const [column, value] of Object.entries(criteria)) {
		query = query.where(column, "=", value);
	}
	await query.execute();
};

const executeTableWrite = async (
	db: unknown,
	tablePolicy: RuntimeTableConfig,
	row: Record<string, unknown>,
) => {
	const typedDb = db as DbLike;

	if (tablePolicy.writeMode === "insert") {
		await typedDb.insertInto(tablePolicy.tableName).values(row).execute();
		return;
	}

	if (tablePolicy.conflictColumns.length === 0) {
		throw new Error(
			`Table ${tablePolicy.tableName} is set to upsert but has no conflict columns.`,
		);
	}

	const conflictCriteria: Record<string, unknown> = {};
	for (const column of tablePolicy.conflictColumns) {
		if (!(column in row)) {
			throw new Error(
				`Upsert conflict column ${column} is missing in row for ${tablePolicy.tableName}.`,
			);
		}
		conflictCriteria[column] = row[column];
	}

	const existing = await selectOneByColumns(
		db,
		tablePolicy.tableName,
		conflictCriteria,
	);
	if (existing) {
		await updateByColumns(db, tablePolicy.tableName, conflictCriteria, row);
		return;
	}

	await typedDb.insertInto(tablePolicy.tableName).values(row).execute();
};

const resolveParentKeyValue = async (
	db: unknown,
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

const getFileGeneratedLinks = (
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

const recordToRejectCsvCell = (record: Record<string, unknown>) =>
	JSON.stringify(record).replaceAll('"', '""');

export const Route = createFileRoute("/api/batch-import")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const [
					{ getSavedConnectionById },
					{ getKyselyInstance },
					{ withTunnel },
				] = await Promise.all([
					import("../../server/saved-connections"),
					import("../../lib/db/connection"),
					import("../../server/ssh-tunnel"),
				]);

				const formData = await request.formData();
				const connectionIdRaw = formData.get("connectionId");
				const payloadRaw = formData.get("payload");
				const filesRaw = formData.getAll("files");

				if (
					typeof connectionIdRaw !== "string" ||
					connectionIdRaw.trim() === ""
				) {
					return Response.json(
						{ success: false, error: "Missing connectionId." },
						{ status: 400 },
					);
				}
				if (typeof payloadRaw !== "string" || payloadRaw.trim() === "") {
					return Response.json(
						{ success: false, error: "Missing payload." },
						{ status: 400 },
					);
				}

				const parsedConnectionId = Number(connectionIdRaw);
				if (Number.isNaN(parsedConnectionId)) {
					return Response.json(
						{ success: false, error: "Invalid connectionId." },
						{ status: 400 },
					);
				}

				const files = filesRaw.filter(
					(entry): entry is File => entry instanceof File,
				);
				if (files.length === 0) {
					return Response.json(
						{ success: false, error: "Missing CSV files." },
						{ status: 400 },
					);
				}

				let parsedPayload: ParsedBatchImportConfig;
				try {
					parsedPayload = parseBatchConfig(payloadRaw);
				} catch (error) {
					return Response.json(
						{
							success: false,
							error:
								error instanceof Error
									? error.message
									: "Invalid batch payload.",
						},
						{ status: 400 },
					);
				}

				if (parsedPayload.files.length !== files.length) {
					return Response.json(
						{
							success: false,
							error: "Uploaded files count does not match payload files count.",
						},
						{ status: 400 },
					);
				}

				const connection = getSavedConnectionById(parsedConnectionId);
				if (!connection) {
					return Response.json(
						{ success: false, error: "Connection not found." },
						{ status: 404 },
					);
				}

				const credentials = toDbCredentials(connection);
				const encoder = new TextEncoder();

				const stream = new ReadableStream({
					async start(controller) {
						let closed = false;

						const close = () => {
							if (closed) {
								return;
							}
							closed = true;
							controller.close();
						};

						const sendEvent = (payload: BatchImportProgressEvent) => {
							controller.enqueue(
								encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
							);
						};

						try {
							const policyByTable = new Map<string, RuntimeTableConfig>();

							for (const fileConfig of parsedPayload.files) {
								if (
									fileConfig.importMode === "simple" &&
									fileConfig.simpleConfig
								) {
									mergeRuntimePolicy(policyByTable, {
										tableName: fileConfig.simpleConfig.tableName,
										tableMode: fileConfig.simpleConfig.tableMode,
										writeMode: fileConfig.simpleConfig.writeMode,
										conflictColumns: fileConfig.simpleConfig.conflictColumns,
										primaryKeyColumn: fileConfig.simpleConfig.primaryKeyColumn,
									});
								}

								if (
									fileConfig.importMode === "advanced" &&
									fileConfig.advancedConfig
								) {
									for (const policy of fileConfig.advancedConfig
										.tablePolicies) {
										mergeRuntimePolicy(policyByTable, {
											tableName: policy.tableName,
											tableMode: policy.tableMode,
											writeMode: policy.writeMode,
											conflictColumns: policy.conflictColumns,
											primaryKeyColumn: policy.primaryKeyColumn,
										});
									}
								}
							}

							const tableConfigs: BatchImportTableConfig[] = Array.from(
								policyByTable.values(),
							).map((policy) => ({
								fileName: "",
								tableMode: policy.tableMode,
								tableName: policy.tableName,
								columns: [],
								mapping: {},
								primaryKeyColumn: policy.primaryKeyColumn,
							}));

							const generatedRelationships: ForeignKeyDef[] = [];
							for (const fileConfig of parsedPayload.files) {
								for (const link of getFileGeneratedLinks(fileConfig)) {
									generatedRelationships.push({
										id: link.id,
										sourceTable: link.childTable,
										sourceColumn: link.childForeignKeyColumn,
										targetTable: link.parentTable,
										targetColumn: link.parentKeyColumn,
									});
								}
							}

							const { sorted, hasCycle } = sortTablesByDependencies(
								tableConfigs,
								[...parsedPayload.relationships, ...generatedRelationships],
							);

							if (hasCycle) {
								throw new Error(
									"Circular table dependency detected. Review relationship configuration.",
								);
							}

							const orderedTableNames = sorted.map((table) => table.tableName);
							const tableIndexByName = new Map(
								orderedTableNames.map((tableName, index) => [tableName, index]),
							);

							const countersByTable = new Map<string, RuntimeTableCounters>(
								orderedTableNames.map((tableName) => [
									tableName,
									(() => {
										const rejectFileName = `rejects_${tableName}_${Date.now()}.csv`;
										return {
											totalRows: 0,
											insertedRows: 0,
											failedRows: 0,
											rejectFileName,
											rejectFilePath: `./exports/${rejectFileName}`,
										};
									})(),
								]),
							);

							mkdirSync("./exports", { recursive: true });
							const rejectWriters = new Map<
								string,
								{
									write: (chunk: string) => unknown;
									end: () => number | Promise<number>;
								}
							>();
							for (const [tableName, counters] of countersByTable.entries()) {
								const writer = Bun.file(counters.rejectFilePath).writer();
								writer.write(`"_raw_row","_error_reason"\n`);
								rejectWriters.set(tableName, writer);
								sendEvent({
									type: "table_start",
									tableIndex: tableIndexByName.get(tableName) ?? -1,
									tableName,
									totalRows: 0,
									insertedRows: 0,
									failedRows: 0,
								});
							}

							await withTunnel(credentials, async (tunneledCreds) => {
								const db = getKyselyInstance(tunneledCreds);
								const createdTables = new Set<string>();

								try {
									// Create tables configured as create.
									for (let i = 0; i < parsedPayload.files.length; i++) {
										const fileConfig = parsedPayload.files[i];
										const file = files[i];

										if (fileConfig.fileName !== file.name) {
											throw new Error(
												`Uploaded file ${file.name} does not match payload file ${fileConfig.fileName}.`,
											);
										}

										if (fileConfig.importMode === "simple") {
											const simple = fileConfig.simpleConfig;
											if (
												!simple ||
												simple.tableMode !== "create" ||
												createdTables.has(simple.tableName)
											) {
												continue;
											}

											const createSql = buildCreateTableSql(
												tunneledCreds.driver,
												simple.tableName,
												fileConfig.columns,
												simple.primaryKeyColumn,
											);
											await sql.raw(createSql).execute(db);
											createdTables.add(simple.tableName);
											continue;
										}

										if (!fileConfig.advancedConfig) {
											continue;
										}

										for (const policy of fileConfig.advancedConfig
											.tablePolicies) {
											if (
												policy.tableMode !== "create" ||
												createdTables.has(policy.tableName)
											) {
												continue;
											}

											const columns = getColumnsForAdvancedCreatedTable(
												fileConfig,
												policy.tableName,
											);
											if (columns.length === 0) {
												throw new Error(
													`No columns routed to new table ${policy.tableName}.`,
												);
											}

											const createSql = buildCreateTableSql(
												tunneledCreds.driver,
												policy.tableName,
												columns,
												policy.primaryKeyColumn,
											);
											await sql.raw(createSql).execute(db);
											createdTables.add(policy.tableName);
										}
									}

									// Process files.
									for (let i = 0; i < parsedPayload.files.length; i++) {
										const fileConfig = parsedPayload.files[i];
										const file = files[i];

										const parser = parse({
											columns: true,
											skip_empty_lines: true,
											delimiter: [",", ";"],
										});

										const streamReader = file.stream().getReader();
										const pump = (async () => {
											try {
												while (true) {
													const { done, value } = await streamReader.read();
													if (done) {
														break;
													}
													if (value) {
														parser.write(value);
													}
												}
												parser.end();
											} catch (error) {
												parser.destroy(error as Error);
											} finally {
												streamReader.releaseLock();
											}
										})();

										for await (const record of parser) {
											const row = record as Record<string, unknown>;
											const rowPayloads = buildRowPayloads(row, fileConfig);
											const generatedValues = new Map<string, unknown>();
											const generatedLinks = getFileGeneratedLinks(fileConfig);

											for (const tableName of orderedTableNames) {
												const tableRow = rowPayloads.get(tableName);
												if (!tableRow) {
													continue;
												}

												const counters = countersByTable.get(tableName);
												if (counters) {
													counters.totalRows += 1;
												}
												const tableIndex =
													tableIndexByName.get(tableName) ?? -1;

												try {
													for (const link of generatedLinks) {
														if (link.childTable !== tableName) {
															continue;
														}

														if (
															tableRow[link.childForeignKeyColumn] !== undefined
														) {
															continue;
														}

														const parentKey = `${link.parentTable}.${link.parentKeyColumn}`;
														const resolvedValue =
															generatedValues.get(parentKey);
														if (resolvedValue === undefined) {
															throw new Error(
																`Missing generated value for ${parentKey} while writing ${tableName}.${link.childForeignKeyColumn}.`,
															);
														}
														tableRow[link.childForeignKeyColumn] =
															resolvedValue;
													}

													const tablePolicy = policyByTable.get(tableName);
													if (!tablePolicy) {
														throw new Error(
															`Missing table policy for table ${tableName}.`,
														);
													}

													await executeTableWrite(db, tablePolicy, tableRow);

													const countersToUpdate =
														countersByTable.get(tableName);
													if (countersToUpdate) {
														countersToUpdate.insertedRows += 1;
													}

													for (const link of generatedLinks) {
														if (link.parentTable !== tableName) {
															continue;
														}

														const parentPolicy = policyByTable.get(
															link.parentTable,
														);
														if (!parentPolicy) {
															continue;
														}

														const parentValue = await resolveParentKeyValue(
															db,
															tableRow,
															parentPolicy,
															link.parentKeyColumn,
														);

														if (
															parentValue === undefined ||
															parentValue === null
														) {
															throw new Error(
																`Unable to resolve generated key ${link.parentTable}.${link.parentKeyColumn}.`,
															);
														}

														generatedValues.set(
															`${link.parentTable}.${link.parentKeyColumn}`,
															parentValue,
														);
													}

													sendEvent({
														type: "table_progress",
														tableIndex,
														tableName,
														totalRows: countersToUpdate?.totalRows ?? 0,
														insertedRows: countersToUpdate?.insertedRows ?? 0,
														failedRows: countersToUpdate?.failedRows ?? 0,
													});
												} catch (rowError) {
													const message =
														rowError instanceof Error
															? rowError.message
															: "Row write failed.";
													const countersToUpdate =
														countersByTable.get(tableName);
													if (countersToUpdate) {
														countersToUpdate.failedRows += 1;
													}
													rejectWriters
														.get(tableName)
														?.write(
															`"${recordToRejectCsvCell(row)}",${JSON.stringify(message)}\n`,
														);
													sendEvent({
														type: "table_progress",
														tableIndex,
														tableName,
														totalRows: countersToUpdate?.totalRows ?? 0,
														insertedRows: countersToUpdate?.insertedRows ?? 0,
														failedRows: countersToUpdate?.failedRows ?? 0,
													});
												}
											}
										}

										await pump;
									}
								} finally {
									await db.destroy();
								}
							});

							for (const [tableName, counters] of countersByTable.entries()) {
								sendEvent({
									type: "table_complete",
									tableIndex: tableIndexByName.get(tableName) ?? -1,
									tableName,
									totalRows: counters.totalRows,
									insertedRows: counters.insertedRows,
									failedRows: counters.failedRows,
									rejectFileName:
										counters.failedRows > 0
											? counters.rejectFileName
											: undefined,
								});
							}

							sendEvent({ type: "complete" });

							for (const [tableName, writer] of rejectWriters.entries()) {
								await writer.end();
								const counters = countersByTable.get(tableName);
								if (counters && counters.failedRows === 0) {
									rmSync(counters.rejectFilePath, { force: true });
								}
							}
						} catch (error) {
							sendEvent({
								type: "error",
								error:
									error instanceof Error
										? error.message
										: "Batch import failed.",
							});
						} finally {
							close();
						}
					},
				});

				return new Response(stream, {
					headers: {
						"Content-Type": "text/event-stream",
						"Cache-Control": "no-cache",
						Connection: "keep-alive",
					},
				});
			},
		},
	},
});
