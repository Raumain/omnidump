import { readdirSync, rmSync, statSync } from "node:fs";
import { createServerFn } from "@tanstack/react-start";
import { type Kysely, sql } from "kysely";

import { normalizeCredentials } from "../lib/credentials";
import type { DbCredentials } from "../lib/db/connection";
import { extractErrorMessage } from "../lib/errors";
import type { Failure, Result } from "../lib/result";
import type { SavedConnection } from "./connection-fns";
import {
	disableForeignKeyChecks,
	restoreForeignKeyChecks,
} from "./db-helpers/foreign-keys";
import {
	getForeignKeysForTable,
	getPrimaryKeyColumnsForTable,
} from "./db-helpers/introspection";
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

type DatabaseConnection = Kysely<unknown>;
type IntrospectedTable = Awaited<
	ReturnType<DatabaseConnection["introspection"]["getTables"]>
>[number];

const createDatabaseConnection = async (
	credentials: DbCredentials,
): Promise<DatabaseConnection> => {
	const { getKyselyInstance } = await import("../lib/db/connection");
	return getKyselyInstance(credentials);
};

export type DumpFileInfo = {
	path: string;
	fileName: string;
	size: number;
	createdAt: string;
};

const toDumpFileInfo = (filePath: string): DumpFileInfo | null => {
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
};

const scanDumpSqlFiles = (baseDirectory: string): string[] => {
	const walk = (relativeDirectory: string): string[] => {
		const absoluteDirectory = relativeDirectory
			? `${baseDirectory}/${relativeDirectory}`
			: baseDirectory;
		const entries = readdirSync(absoluteDirectory, { withFileTypes: true });
		const sqlFiles: string[] = [];

		for (const entry of entries) {
			const relativePath = relativeDirectory
				? `${relativeDirectory}/${entry.name}`
				: entry.name;

			if (entry.isDirectory()) {
				sqlFiles.push(...walk(relativePath));
				continue;
			}

			if (entry.isFile() && entry.name.endsWith(".sql")) {
				sqlFiles.push(relativePath);
			}
		}

		return sqlFiles;
	};

	try {
		return walk("");
	} catch {
		return [];
	}
};

const spawnRestoreProcess = (
	credentials: DbCredentials,
	fullPath: string,
): Bun.Subprocess => {
	if (credentials.driver === "postgres") {
		const commandArgs = [
			"psql",
			`postgresql://${credentials.user}:${credentials.password}@${credentials.host}:${credentials.port}/${credentials.database}`,
			"-f",
			fullPath,
		];

		return Bun.spawn(commandArgs, { stdout: "ignore", stderr: "pipe" });
	}

	if (credentials.driver === "mysql") {
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

		return Bun.spawn(commandArgs, {
			stdin: file,
			stdout: "ignore",
			stderr: "pipe",
		});
	}

	const commandArgs = [
		"sqlite3",
		credentials.database ?? "",
		`.read ${fullPath}`,
	];
	return Bun.spawn(commandArgs, { stdout: "ignore", stderr: "pipe" });
};

const getRestoreErrorText = async (proc: Bun.Subprocess): Promise<string> => {
	if (!proc.stderr || typeof proc.stderr === "number") {
		return "Unknown error";
	}

	return new Response(proc.stderr).text();
};

const ensureRestoreSucceeded = async (proc: Bun.Subprocess): Promise<void> => {
	const exitCode = await proc.exited;
	if (exitCode === 0) {
		return;
	}

	const errorText = await getRestoreErrorText(proc);
	throw new Error(errorText);
};

const toSchemaTable = async (
	db: DatabaseConnection,
	driver: DbCredentials["driver"],
	table: IntrospectedTable,
): Promise<SchemaTable> => {
	const primaryKeys = await getPrimaryKeyColumnsForTable(
		db,
		driver,
		table.name,
	);
	const foreignKeys = await getForeignKeysForTable(db, driver, table.name);

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
};

const loadSchemaTablesWithConnection = async (
	credentials: DbCredentials,
): Promise<SchemaTable[]> => {
	const db = await createDatabaseConnection(credentials);

	try {
		const introspectedTables = await db.introspection.getTables();
		const schemaTables: SchemaTable[] = [];

		for (const table of introspectedTables) {
			schemaTables.push(await toSchemaTable(db, credentials.driver, table));
		}

		return schemaTables;
	} finally {
		await db.destroy();
	}
};

/**
 * Determines if a table is a system/protected table that should not be dropped or wiped
 */
function isSystemTable(
	tableName: string,
	driver: DbCredentials["driver"],
): boolean {
	// Postgres system schemas/tables
	if (driver === "postgres") {
		return (
			tableName.startsWith("pg_") ||
			tableName.startsWith("information_schema.") ||
			tableName.includes(".") // Qualified names like schema.table
		);
	}

	// MySQL system databases/tables
	if (driver === "mysql") {
		return (
			tableName.startsWith("mysql") ||
			tableName.startsWith("information_schema") ||
			tableName.startsWith("performance_schema") ||
			tableName.startsWith("sys")
		);
	}

	// SQLite: sqlite_sequence is already handled elsewhere
	// No additional system tables to protect
	return false;
}

const getWipeTableNames = (
	tables: IntrospectedTable[],
	driver: DbCredentials["driver"],
): string[] => {
	return tables
		.map((table) => table.name)
		.filter(
			(tableName) =>
				!(driver === "sqlite" && tableName === "sqlite_sequence") &&
				!isSystemTable(tableName, driver),
		);
};

const restoreForeignKeyChecksIfNeeded = async (
	db: DatabaseConnection,
	driver: DbCredentials["driver"],
	fkChecksDisabled: boolean,
): Promise<void> => {
	try {
		if (fkChecksDisabled) {
			await restoreForeignKeyChecks(db, driver);
		}
	} catch (error) {
		console.error("Failed to restore foreign key checks:", error);
	}
};

const dropTable = async (
	db: DatabaseConnection,
	driver: DbCredentials["driver"],
	tableName: string,
): Promise<void> => {
	// Safety check: should never reach here, but defense in depth
	if (isSystemTable(tableName, driver)) {
		throw new Error(
			`Cannot drop system table "${tableName}". System tables are protected.`,
		);
	}

	try {
		if (driver === "postgres") {
			await sql.raw(`DROP TABLE "${tableName}" CASCADE`).execute(db);
			return;
		}

		const quote = driver === "mysql" ? "`" : '"';
		await sql.raw(`DROP TABLE ${quote}${tableName}${quote}`).execute(db);
	} catch (error) {
		throw new Error(
			`Failed to drop table "${tableName}": ${error instanceof Error ? error.message : String(error)}`,
		);
	}
};

export const getAvailableDumpsFn = createServerFn({ method: "GET" }).handler(
	async (): Promise<DumpFileInfo[]> => {
		try {
			const files = scanDumpSqlFiles(DUMPS_DIRECTORY);

			return files
				.map((filePath) => toDumpFileInfo(filePath))
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
		const fullPath = `${DUMPS_DIRECTORY}/${input.filePath}`;

		try {
			const proc = spawnRestoreProcess(input.credentials, fullPath);
			await ensureRestoreSucceeded(proc);
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
			return await withTunnel(
				normalizedCredentials,
				loadSchemaTablesWithConnection,
			);
		} catch (error) {
			return {
				error: extractErrorMessage(error),
			};
		}
	});

export const clearTableDataFn = createServerFn({ method: "POST" })
	.inputValidator((input: ClearTableDataInput) => input)
	.handler(async ({ data: input }): Promise<MessageServerFnResult> => {
		const db = await createDatabaseConnection(input.credentials);

		try {
			await db.deleteFrom(input.tableName as never).execute();

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
		const db = await createDatabaseConnection(credentials);
		let fkChecksDisabled = false;

		try {
			const tables = await db.introspection.getTables();
			const tableNames = getWipeTableNames(tables, credentials.driver);

			await disableForeignKeyChecks(db, credentials.driver);
			fkChecksDisabled = true;

			for (const tableName of tableNames) {
				await db.deleteFrom(tableName as never).execute();
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
			await restoreForeignKeyChecksIfNeeded(
				db,
				credentials.driver,
				fkChecksDisabled,
			);
			await db.destroy();
		}
	});

export const dropAllTablesFn = createServerFn({ method: "POST" })
	.inputValidator((credentials: DbCredentials) => credentials)
	.handler(async ({ data: credentials }): Promise<MessageServerFnResult> => {
		const db = await createDatabaseConnection(credentials);
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
			const tableNames = getWipeTableNames(tables, driver);

			if (tableNames.length === 0) {
				return {
					success: true,
					message: "No user tables to drop.",
				};
			}

			if (driver !== "postgres") {
				await disableForeignKeyChecks(db, driver);
				fkChecksDisabled = true;
			}

			for (const tableName of tableNames) {
				await dropTable(db, driver, tableName);
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
			await restoreForeignKeyChecksIfNeeded(
				db,
				credentials.driver,
				fkChecksDisabled,
			);
			await db.destroy();
		}
	});
