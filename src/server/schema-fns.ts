import { rmSync, statSync } from "node:fs";
import { createServerFn } from "@tanstack/react-start";
import { Glob } from "bun";
import { sql, type Kysely } from "kysely";

import { normalizeCredentials } from "../lib/credentials";
import { type DbCredentials, getKyselyInstance } from "../lib/db/connection";
import { extractErrorMessage } from "../lib/errors";
import type { Failure, Result } from "../lib/result";
import { quoteIdentifier } from "./db-helpers/sql-utils";
import type { SavedConnection } from "./connection-fns";
import {
	disableForeignKeyChecks,
	restoreForeignKeyChecks,
} from "./db-helpers/foreign-keys";
import type { MessageServerFnResult } from "./result-types";
import { withTunnel } from "./ssh-tunnel";

type ActiveConnectionInput = DbCredentials | SavedConnection;

type SchemaTable = {
	tableName: string;
	columns: Array<{
		name: string;
		dataType: string;
		isNullable: boolean;
		isPrimaryKey: boolean;
	}>;
	foreignKeys: Array<{
		sourceColumn: string;
		targetTable: string;
		targetColumn: string;
	}>;
};

type GetDatabaseSchemaResult = SchemaTable[] | Omit<Failure<string>, "success">;

type ClearTableDataInput = {
	credentials: DbCredentials;
	tableName: string;
};

type RestoreDumpInput = {
	credentials: DbCredentials;
	filePath: string;
};

type RestoreDumpResult = Result<object>;

const DUMPS_DIRECTORY = "./exports/dumps";

type SchemaForeignKeyRow = {
	column_name: string;
	referenced_table_name: string;
	referenced_column_name: string;
};

type PrimaryKeyRow = {
	column_name: string;
};

const getForeignKeysForTable = async (
	db: Kysely<unknown>,
	driver: DbCredentials["driver"],
	tableName: string,
): Promise<
	Array<{
		sourceColumn: string;
		targetTable: string;
		targetColumn: string;
	}>
> => {
	if (driver === "postgres") {
		const result = await sql<SchemaForeignKeyRow>`
			SELECT
				kcu.column_name AS column_name,
				ccu.table_name AS referenced_table_name,
				ccu.column_name AS referenced_column_name
			FROM information_schema.table_constraints tc
			JOIN information_schema.key_column_usage kcu
				ON tc.constraint_name = kcu.constraint_name
				AND tc.table_schema = kcu.table_schema
			JOIN information_schema.constraint_column_usage ccu
				ON ccu.constraint_name = tc.constraint_name
				AND ccu.table_schema = tc.table_schema
			WHERE tc.constraint_type = 'FOREIGN KEY'
				AND tc.table_schema = current_schema()
				AND tc.table_name = ${tableName}
		`.execute(db);

		return result.rows.map((row) => ({
			sourceColumn: row.column_name,
			targetTable: row.referenced_table_name,
			targetColumn: row.referenced_column_name,
		}));
	}

	if (driver === "mysql") {
		const result = await sql<SchemaForeignKeyRow>`
			SELECT
				COLUMN_NAME AS column_name,
				REFERENCED_TABLE_NAME AS referenced_table_name,
				REFERENCED_COLUMN_NAME AS referenced_column_name
			FROM information_schema.KEY_COLUMN_USAGE
			WHERE TABLE_SCHEMA = DATABASE()
				AND TABLE_NAME = ${tableName}
				AND REFERENCED_TABLE_NAME IS NOT NULL
				AND REFERENCED_COLUMN_NAME IS NOT NULL
		`.execute(db);

		return result.rows.map((row) => ({
			sourceColumn: row.column_name,
			targetTable: row.referenced_table_name,
			targetColumn: row.referenced_column_name,
		}));
	}

	const pragmaStatement = `PRAGMA foreign_key_list(${quoteIdentifier(tableName, "sqlite")});`;
	const result = await sql.raw(pragmaStatement).execute(db);

	return (result.rows as Array<Record<string, unknown>>)
		.map((row) => ({
			sourceColumn: row.from,
			targetTable: row.table,
			targetColumn: row.to,
		}))
		.filter(
			(row): row is {
				sourceColumn: string;
				targetTable: string;
				targetColumn: string;
			} =>
				typeof row.sourceColumn === "string" &&
				typeof row.targetTable === "string" &&
				typeof row.targetColumn === "string" &&
				row.targetColumn.trim() !== "",
		);
};

const getPrimaryKeyColumnsForTable = async (
	db: Kysely<unknown>,
	driver: DbCredentials["driver"],
	tableName: string,
): Promise<Set<string>> => {
	if (driver === "postgres") {
		const result = await sql<PrimaryKeyRow>`
			SELECT kcu.column_name AS column_name
			FROM information_schema.table_constraints tc
			JOIN information_schema.key_column_usage kcu
				ON tc.constraint_name = kcu.constraint_name
				AND tc.table_schema = kcu.table_schema
			WHERE tc.constraint_type = 'PRIMARY KEY'
				AND tc.table_schema = current_schema()
				AND tc.table_name = ${tableName}
			ORDER BY kcu.ordinal_position
		`.execute(db);

		return new Set(result.rows.map((row) => row.column_name));
	}

	if (driver === "mysql") {
		const result = await sql<PrimaryKeyRow>`
			SELECT COLUMN_NAME AS column_name
			FROM information_schema.KEY_COLUMN_USAGE
			WHERE TABLE_SCHEMA = DATABASE()
				AND TABLE_NAME = ${tableName}
				AND CONSTRAINT_NAME = 'PRIMARY'
			ORDER BY ORDINAL_POSITION
		`.execute(db);

		return new Set(result.rows.map((row) => row.column_name));
	}

	const pragmaStatement = `PRAGMA table_info(${quoteIdentifier(tableName, "sqlite")});`;
	const result = await sql.raw(pragmaStatement).execute(db);

	return new Set(
		(result.rows as Array<Record<string, unknown>>)
			.filter((row) => row.pk === 1 || row.pk === "1")
			.map((row) => row.name)
			.filter((value): value is string => typeof value === "string"),
	);
};

export type DumpFileInfo = {
	path: string;
	fileName: string;
	size: number;
	createdAt: string;
};

export const getAvailableDumpsFn = createServerFn({ method: "GET" }).handler(
	async (): Promise<DumpFileInfo[]> => {
		try {
			const glob = new Glob("**/*.sql");
			const files = Array.from(glob.scanSync({ cwd: DUMPS_DIRECTORY }));

			return files
				.map((filePath) => {
					try {
						const fullPath = `${DUMPS_DIRECTORY}/${filePath}`;
						const stats = statSync(fullPath);
						const fileName = filePath.split("/").pop() ?? filePath;

						return {
							path: filePath,
							fileName,
							size: stats.size,
							createdAt: stats.mtime.toISOString(),
						};
					} catch {
						return null;
					}
				})
				.filter((info): info is DumpFileInfo => info !== null)
				.sort(
					(a, b) =>
						new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
				);
		} catch {
			return [];
		}
	},
);

export const deleteDumpFn = createServerFn({ method: "POST" })
	.inputValidator((input: { filePath: string }) => input)
	.handler(async ({ data: input }): Promise<MessageServerFnResult> => {
		const { filePath } = input;

		// Security: Ensure path doesn't escape dumps directory
		if (filePath.includes("..") || filePath.startsWith("/")) {
			return {
				success: false,
				error: "Invalid file path.",
			};
		}

		const fullPath = `${DUMPS_DIRECTORY}/${filePath}`;

		try {
			rmSync(fullPath, { force: true });

			return {
				success: true,
				message: `Dump file deleted: ${filePath}`,
			};
		} catch (error) {
			return {
				success: false,
				error: extractErrorMessage(error),
			};
		}
	});

export const restoreDumpFn = createServerFn({ method: "POST" })
	.inputValidator((input: RestoreDumpInput) => input)
	.handler(async ({ data: input }): Promise<RestoreDumpResult> => {
		const fullPath = `./exports/dumps/${input.filePath}`;

		try {
			const credentials = input.credentials;
			let proc: Bun.Subprocess;

			if (credentials.driver === "postgres") {
				const commandArgs = [
					"psql",
					`postgresql://${credentials.user}:${credentials.password}@${credentials.host}:${credentials.port}/${credentials.database}`,
					"-f",
					fullPath,
				];

				proc = Bun.spawn(commandArgs, { stdout: "ignore", stderr: "pipe" });
			} else if (credentials.driver === "mysql") {
				const commandArgs = [
					"mysql",
					"-h",
					credentials.host ?? "",
					"-P",
					(credentials.port ?? 0).toString(),
					"-u",
					credentials.user ?? "",
					`-p${credentials.password ?? ""}`,
					credentials.database ?? "",
				];

				const file = Bun.file(fullPath);

				proc = Bun.spawn(commandArgs, {
					stdin: file,
					stdout: "ignore",
					stderr: "pipe",
				});
			} else {
				const commandArgs = [
					"sqlite3",
					credentials.database ?? "",
					`.read ${fullPath}`,
				];

				proc = Bun.spawn(commandArgs, { stdout: "ignore", stderr: "pipe" });
			}

			const exitCode = await proc.exited;

			if (exitCode !== 0) {
				const errorText =
					proc.stderr && typeof proc.stderr !== "number"
						? await new Response(proc.stderr).text()
						: "Unknown error";

				throw new Error(errorText);
			}

			return { success: true };
		} catch (error) {
			return {
				success: false,
				error: extractErrorMessage(error),
			};
		}
	});

export const getDatabaseSchemaFn = createServerFn({ method: "POST" })
	.inputValidator((credentials: ActiveConnectionInput) => credentials)
	.handler(async ({ data: credentials }): Promise<GetDatabaseSchemaResult> => {
		const normalizedCredentials = normalizeCredentials(credentials);

		try {
			const tables = await withTunnel(
				normalizedCredentials,
				async (tunneledCreds) => {
					const db = getKyselyInstance(tunneledCreds);

					try {
						const introspectedTables = await db.introspection.getTables();
						return await Promise.all(
							introspectedTables.map(async (table) => {
								const [primaryKeys, foreignKeys] = await Promise.all([
									getPrimaryKeyColumnsForTable(
										db,
										tunneledCreds.driver,
										table.name,
									),
									getForeignKeysForTable(db, tunneledCreds.driver, table.name),
								]);

								return {
									tableName: table.name,
									columns: table.columns.map((column) => ({
										name: column.name,
										dataType: column.dataType,
										isNullable: column.isNullable,
										isPrimaryKey: primaryKeys.has(column.name),
									})),
									foreignKeys,
								};
							}),
						);
					} finally {
						await db.destroy();
					}
				},
			);

			return tables;
		} catch (error) {
			return {
				error: extractErrorMessage(error),
			};
		}
	});

export const clearTableDataFn = createServerFn({ method: "POST" })
	.inputValidator((input: ClearTableDataInput) => input)
	.handler(async ({ data: input }): Promise<MessageServerFnResult> => {
		const db = getKyselyInstance(input.credentials);

		try {
			await db.deleteFrom(input.tableName).execute();

			return {
				success: true,
				message: `Table ${input.tableName} cleared`,
			};
		} catch (error) {
			return {
				success: false,
				error: extractErrorMessage(error),
			};
		} finally {
			await db.destroy();
		}
	});

export const wipeAllDataFn = createServerFn({ method: "POST" })
	.inputValidator((credentials: DbCredentials) => credentials)
	.handler(async ({ data: credentials }): Promise<MessageServerFnResult> => {
		const db = getKyselyInstance(credentials);
		let fkChecksDisabled = false;

		try {
			const tables = await db.introspection.getTables();
			const tableNames = tables
				.map((table) => table.name)
				.filter((tableName) => {
					if (credentials.driver !== "sqlite") {
						return true;
					}

					return tableName !== "sqlite_sequence";
				});

			await disableForeignKeyChecks(db, credentials.driver);
			fkChecksDisabled = true;

			for (const tableName of tableNames) {
				await db.deleteFrom(tableName).execute();
			}

			return {
				success: true,
				message: "All data wiped successfully.",
			};
		} catch (error) {
			return {
				success: false,
				error: extractErrorMessage(error),
			};
		} finally {
			try {
				if (fkChecksDisabled) {
					await restoreForeignKeyChecks(db, credentials.driver);
				}
			} catch (error) {
				console.error("Failed to restore foreign key checks:", error);
			}

			await db.destroy();
		}
	});

export const dropAllTablesFn = createServerFn({ method: "POST" })
	.inputValidator((credentials: DbCredentials) => credentials)
	.handler(async ({ data: credentials }): Promise<MessageServerFnResult> => {
		const db = getKyselyInstance(credentials);
		let fkChecksDisabled = false;

		try {
			const tables = await db.introspection.getTables();

			if (tables.length === 0) {
				return {
					success: true,
					message: "Database is already empty.",
				};
			}

			const { driver } = credentials;

			if (driver === "postgres") {
				for (const table of tables) {
					await sql.raw(`DROP TABLE "${table.name}" CASCADE`).execute(db);
				}
			} else {
				await disableForeignKeyChecks(db, driver);
				fkChecksDisabled = true;

				for (const table of tables) {
					const quote = driver === "mysql" ? "`" : '"';
					await sql.raw(`DROP TABLE ${quote}${table.name}${quote}`).execute(db);
				}
			}

			return {
				success: true,
				message: "All tables dropped.",
			};
		} catch (error) {
			return {
				success: false,
				error: extractErrorMessage(error),
			};
		} finally {
			try {
				if (fkChecksDisabled) {
					await restoreForeignKeyChecks(db, credentials.driver);
				}
			} catch (error) {
				console.error("Failed to restore foreign key checks:", error);
			}

			await db.destroy();
		}
	});
