import { mkdirSync } from "node:fs";
import { createFileRoute } from "@tanstack/react-router";
import { parse } from "csv-parse";

import { savedConnectionToDbCredentials } from "../../lib/credentials";
import { extractErrorMessage } from "../../lib/errors";

const IMPORT_BATCH_SIZE = 1000;

type ParsedImportRequest = {
	file: File;
	connectionId: number;
	tableName: string;
	mapping: Record<string, string>;
};

type ImportBatchRow = {
	mappedRow: Record<string, unknown>;
	originalRecord: Record<string, unknown>;
};

type ImportEventPayload = {
	successfulRows: number;
	failedRows: number;
	status: "processing" | "completed" | "failed";
	error?: string;
	rejectFileName?: string;
};

const toCsvCell = (value: unknown): string => {
	const normalized = value === null || value === undefined ? "" : String(value);
	const escaped = normalized.replaceAll('"', '""');

	return `"${escaped}"`;
};

const isRecordStringMap = (value: unknown): value is Record<string, string> => {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}

	return Object.values(value).every((entry) => typeof entry === "string");
};

const importErrorResponse = (error: string, status = 400): Response =>
	Response.json({ success: false, error }, { status });

const parseImportRequest = (
	formData: FormData,
): ParsedImportRequest | Response => {
	const file = formData.get("file");
	const connectionId = formData.get("connectionId");
	const tableName = formData.get("tableName");
	const mappingRaw = formData.get("mapping");

	if (!(file instanceof File)) {
		return importErrorResponse("Missing CSV file.");
	}

	if (typeof connectionId !== "string" || connectionId.trim() === "") {
		return importErrorResponse("Missing connectionId.");
	}

	if (typeof tableName !== "string" || tableName.trim() === "") {
		return importErrorResponse("Missing tableName.");
	}

	if (typeof mappingRaw !== "string") {
		return importErrorResponse("Missing mapping.");
	}

	let mapping: Record<string, string>;

	try {
		const parsed = JSON.parse(mappingRaw) as unknown;

		if (!isRecordStringMap(parsed)) {
			return importErrorResponse("Invalid mapping format.");
		}

		mapping = parsed;
	} catch {
		return importErrorResponse("Mapping must be valid JSON.");
	}

	const parsedConnectionId = Number(connectionId);

	if (Number.isNaN(parsedConnectionId)) {
		return importErrorResponse("Invalid connectionId.");
	}

	return {
		file,
		connectionId: parsedConnectionId,
		tableName,
		mapping,
	};
};

const sendImportEvent = (
	controller: ReadableStreamDefaultController<Uint8Array>,
	encoder: TextEncoder,
	payload: ImportEventPayload,
) => {
	controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
};

const mapRecordToRow = (
	record: Record<string, unknown>,
	mapping: Record<string, string>,
): Record<string, unknown> => {
	const mappedRow: Record<string, unknown> = {};

	for (const [csvHeader, dbColumn] of Object.entries(mapping)) {
		if (!dbColumn) {
			continue;
		}

		mappedRow[dbColumn] = record[csvHeader];
	}

	return mappedRow;
};

const buildRejectRowLine = (
	headers: string[],
	record: Record<string, unknown>,
	errorMessage: string,
): string =>
	`${headers.map((header) => toCsvCell(record[header])).join(",")},${toCsvCell(errorMessage)}\n`;

export const Route = createFileRoute("/api/import")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const [{ getSavedConnectionById }, { getKyselyInstance }] =
					await Promise.all([
						import("../../server/saved-connections"),
						import("../../lib/db/connection"),
					]);

				const parsedRequest = parseImportRequest(await request.formData());

				if (parsedRequest instanceof Response) {
					return parsedRequest;
				}

				const { file, connectionId, tableName, mapping } = parsedRequest;

				const connection = getSavedConnectionById(connectionId);

				if (!connection) {
					return importErrorResponse("Connection not found.", 404);
				}

				const db = getKyselyInstance(
					savedConnectionToDbCredentials(connection),
				);
				const encoder = new TextEncoder();

				const stream = new ReadableStream({
					async start(controller) {
						let successfulRows = 0;
						let failedRows = 0;
						let isClosed = false;
						const rejectFileName = `rejects_${tableName}_${Date.now()}.csv`;
						const rejectFilePath = `./exports/${rejectFileName}`;

						mkdirSync("./exports", { recursive: true });
						const rejectWriter = Bun.file(rejectFilePath).writer();
						let rejectWriterClosed = false;
						let csvHeaders: string[] = [];

						const closeController = () => {
							if (isClosed) {
								return;
							}

							isClosed = true;
							controller.close();
						};

						try {
							const parser = parse({
								columns: (headerColumns: string[]) => {
									csvHeaders = headerColumns;

									rejectWriter.write(
										`${headerColumns.map((column) => toCsvCell(column)).join(",")},${toCsvCell("_error_reason")}\n`,
									);

									return headerColumns;
								},
								skip_empty_lines: true,
								delimiter: [",", ";"],
							});

							const streamReader = file.stream().getReader();
							const pumpStreamToParser = (async () => {
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

							let batch: ImportBatchRow[] = [];

							const flushBatch = async () => {
								if (batch.length === 0) {
									return;
								}

								const rowsToInsert = batch;
								batch = [];
								const mappedRowsToInsert = rowsToInsert.map(
									(rowEntry) => rowEntry.mappedRow,
								);

								try {
									await db
										.insertInto(tableName as never)
										.values(mappedRowsToInsert as never)
										.execute();
									successfulRows += mappedRowsToInsert.length;
								} catch (error) {
									console.error("Batch insert failed during CSV import", error);

									for (const rowEntry of rowsToInsert) {
										try {
											await db
												.insertInto(tableName as never)
												.values(rowEntry.mappedRow as never)
												.execute();
											successfulRows += 1;
										} catch (rowError) {
											failedRows += 1;

											const errorMessage =
												rowError instanceof Error
													? rowError.message
													: "Row insert failed during import.";

											rejectWriter.write(
												buildRejectRowLine(
													csvHeaders,
													rowEntry.originalRecord,
													errorMessage,
												),
											);

											console.error(
												"Row insert failed during CSV import fallback",
												{
													row: rowEntry.mappedRow,
													error: rowError,
												},
											);
										}
									}
								}

								sendImportEvent(controller, encoder, {
									successfulRows,
									failedRows,
									status: "processing",
								});
							};

							for await (const record of parser) {
								const originalRecord = record as Record<string, unknown>;
								const mappedRow = mapRecordToRow(originalRecord, mapping);

								if (Object.keys(mappedRow).length === 0) {
									continue;
								}

								batch.push({
									mappedRow,
									originalRecord,
								});

								if (batch.length >= IMPORT_BATCH_SIZE) {
									await flushBatch();
								}
							}

							await flushBatch();
							await pumpStreamToParser;

							sendImportEvent(controller, encoder, {
								successfulRows,
								failedRows,
								status: "completed",
								rejectFileName: failedRows > 0 ? rejectFileName : undefined,
							});
						} catch (error) {
							sendImportEvent(controller, encoder, {
								successfulRows,
								failedRows,
								status: "failed",
								error: extractErrorMessage(error, "Import failed."),
							});
						} finally {
							if (!rejectWriterClosed) {
								rejectWriterClosed = true;
								await rejectWriter.end();
							}

							await db.destroy();
							closeController();
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
