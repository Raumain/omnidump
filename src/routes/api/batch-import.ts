import { once } from "node:events";
import { mkdirSync, rmSync } from "node:fs";
import { createFileRoute } from "@tanstack/react-router";
import { parse } from "csv-parse";
import { sql } from "kysely";
import type {
	BatchImportProgressEvent,
	BatchImportTableConfig,
	CsvColumnDef,
	ForeignKeyDef,
} from "../../lib/csv-import-types";
import { getDbColumnType } from "../../lib/csv-import-types";
import type { DbCredentials } from "../../lib/db/connection";
import {
	executeRowTransaction,
	formatImportErrorMessage,
	getColumnsForAdvancedCreatedTable,
	getFileGeneratedLinks,
	mergeRuntimePolicy,
	parseBatchImportConfig,
	type RuntimeTableConfig,
	recordToRejectCsvCell,
} from "../../server/batch-import-runtime";
import type { SavedConnection } from "../../server/connection-fns";
import { sortTablesByDependencies } from "../../server/csv-import-fns";

// Current Bun SQL adapter uses a single acquired connection per importer DB instance.
const MAX_IN_FLIGHT_TRANSACTIONS = 1;

type RuntimeTableCounters = {
	totalRows: number;
	insertedRows: number;
	failedRows: number;
	rejectFileName: string;
	rejectFilePath: string;
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

				let parsedPayload: ReturnType<typeof parseBatchImportConfig>;
				try {
					parsedPayload = parseBatchImportConfig(payloadRaw);
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
														const canContinue = parser.write(value);
														if (!canContinue) {
															await once(parser, "drain");
														}
													}
												}

												parser.end();
											} catch (error) {
												parser.destroy(error as Error);
											} finally {
												streamReader.releaseLock();
											}
										})();

										const generatedLinks = getFileGeneratedLinks(fileConfig);
										const inFlight = new Set<Promise<void>>();

										for await (const record of parser) {
											const row = record as Record<string, unknown>;

											let wrapped: Promise<void>;
											wrapped = (async () => {
												const outcome = await executeRowTransaction({
													db,
													driver: tunneledCreds.driver,
													fileConfig,
													record: row,
													orderedTableNames,
													policyByTable,
													generatedLinks,
												});

												if (outcome.touchedTables.length === 0) {
													return;
												}

												for (const tableName of outcome.touchedTables) {
													const counters = countersByTable.get(tableName);
													if (counters) {
														counters.totalRows += 1;
													}
												}

												if (outcome.ok) {
													for (const tableName of outcome.touchedTables) {
														const counters = countersByTable.get(tableName);
														if (counters) {
															counters.insertedRows += 1;
														}
													}
												} else {
													const errorMessage = formatImportErrorMessage(
														outcome.error,
													);
													for (const tableName of outcome.touchedTables) {
														const counters = countersByTable.get(tableName);
														if (counters) {
															counters.failedRows += 1;
														}

														rejectWriters
															.get(tableName)
															?.write(
																`"${recordToRejectCsvCell(row)}",${JSON.stringify(errorMessage)}\n`,
															);

														sendEvent({
															type: "table_error",
															tableIndex: tableIndexByName.get(tableName) ?? -1,
															tableName,
															totalRows: counters?.totalRows ?? 0,
															insertedRows: counters?.insertedRows ?? 0,
															failedRows: counters?.failedRows ?? 0,
															error: errorMessage,
															errorStage: outcome.error.stage,
															errorCode: outcome.error.code,
														});
													}
												}

												for (const tableName of outcome.touchedTables) {
													const counters = countersByTable.get(tableName);
													sendEvent({
														type: "table_progress",
														tableIndex: tableIndexByName.get(tableName) ?? -1,
														tableName,
														totalRows: counters?.totalRows ?? 0,
														insertedRows: counters?.insertedRows ?? 0,
														failedRows: counters?.failedRows ?? 0,
													});
												}
											})().finally(() => {
												inFlight.delete(wrapped);
											});

											inFlight.add(wrapped);
											if (inFlight.size >= MAX_IN_FLIGHT_TRANSACTIONS) {
												await Promise.race(inFlight);
											}
										}

										await Promise.all(inFlight);
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
