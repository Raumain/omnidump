import { createFileRoute } from "@tanstack/react-router";

import { extractErrorMessage } from "../../lib/errors";

class TableNotFoundError extends Error {}

export const Route = createFileRoute("/api/export-csv" as never)({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const [
					{ getSavedConnectionById },
					{ savedConnectionToCredentials },
					{ getKyselyInstance },
					{ withTunnel },
					{
						buildCsv,
						buildCsvArchiveFileName,
						buildCsvZip,
						buildUniqueCsvFileName,
						parseCsvExportQuery,
						sanitizeFileNamePart,
					},
				] = await Promise.all([
					import("../../server/saved-connections"),
					import("../../lib/credentials"),
					import("../../lib/db/connection"),
					import("../../server/ssh-tunnel"),
					import("../../server/csv-export"),
				]);

				let parsedQuery: ReturnType<typeof parseCsvExportQuery>;

				try {
					parsedQuery = parseCsvExportQuery(new URL(request.url));
				} catch (error) {
					return new Response(extractErrorMessage(error), { status: 400 });
				}

				const connection = getSavedConnectionById(parsedQuery.connectionId);

				if (!connection) {
					return new Response("Connection not found.", { status: 404 });
				}

				const credentials = savedConnectionToCredentials(connection);

				try {
					const exportResult = await withTunnel(credentials, async (tunneledCreds) => {
						const db = getKyselyInstance(tunneledCreds);

						try {
							const tables = await db.introspection.getTables();
							const tableByName = new Map(tables.map((table) => [table.name, table]));

							if (parsedQuery.scope === "table") {
								const targetTable = tableByName.get(parsedQuery.tableName);

								if (!targetTable) {
									throw new TableNotFoundError(
										`Table "${parsedQuery.tableName}" not found.`,
									);
								}

								const rows = await db
									.selectFrom(parsedQuery.tableName as never)
									.selectAll()
									.execute();
								const headers = targetTable.columns.map((column) => column.name);
								const csv = buildCsv(
									headers,
									rows as Array<Record<string, unknown>>,
								);

								return {
									scope: "table" as const,
									tableName: parsedQuery.tableName,
									csv,
								};
							}

							const usedFileNames = new Set<string>();
							const csvFiles = new Map<string, string>();

							for (const table of tables) {
								const rows = await db
									.selectFrom(table.name as never)
									.selectAll()
									.execute();
								const headers = table.columns.map((column) => column.name);
								const csv = buildCsv(
									headers,
									rows as Array<Record<string, unknown>>,
								);
								const fileName = buildUniqueCsvFileName(
									table.name,
									usedFileNames,
								);
								csvFiles.set(fileName, csv);
							}

							return {
								scope: "database" as const,
								zipData: buildCsvZip(csvFiles),
							};
						} finally {
							await db.destroy();
						}
					});

					if (exportResult.scope === "table") {
						const safeTableName = sanitizeFileNamePart(exportResult.tableName);

						return new Response(exportResult.csv, {
							headers: {
								"Content-Type": "text/csv; charset=utf-8",
								"Content-Disposition": `attachment; filename="${safeTableName}_export.csv"`,
							},
						});
					}

					const archiveNameSource =
						connection.database_name ?? connection.name ?? "database";
					const archiveFileName = buildCsvArchiveFileName(archiveNameSource);
					const zipBody = new Uint8Array(exportResult.zipData.byteLength);
					zipBody.set(exportResult.zipData);

					return new Response(zipBody.buffer, {
						headers: {
							"Content-Type": "application/zip",
							"Content-Disposition": `attachment; filename="${archiveFileName}"`,
						},
					});
				} catch (error) {
					if (error instanceof TableNotFoundError) {
						return new Response(error.message, { status: 404 });
					}

					return new Response(extractErrorMessage(error), { status: 500 });
				}
			},
		},
	},
});
