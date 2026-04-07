import { rmSync, statSync } from "node:fs";
import { createServerFn } from "@tanstack/react-start";
import { Glob } from "bun";
import { sql } from "kysely";

import { normalizeCredentials } from "../lib/credentials";
import { type DbCredentials, getKyselyInstance } from "../lib/db/connection";
import { extractErrorMessage } from "../lib/errors";
import type { Failure, Result } from "../lib/result";
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
						return await db.introspection.getTables();
					} finally {
						await db.destroy();
					}
				},
			);

			return tables.map((table) => ({
				tableName: table.name,
				columns: table.columns.map((column) => ({
					name: column.name,
					dataType: column.dataType,
					isNullable: column.isNullable,
				})),
			}));
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
