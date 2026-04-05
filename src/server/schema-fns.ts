import { rmSync, statSync } from "node:fs";
import { createServerFn } from "@tanstack/react-start";
import { Glob } from "bun";
import { sql } from "kysely";

import { type DbCredentials, getKyselyInstance } from "../lib/db/connection";
import type { MessageServerFnResult } from "./result-types";
import { withTunnel } from "./ssh-tunnel";

type ActiveConnectionInput =
	| DbCredentials
	| {
			driver: string | null;
			host: string | null;
			port: number | null;
			user: string | null;
			password: string | null;
			database_name: string | null;
			use_ssh: number | null;
			ssh_host: string | null;
			ssh_port: number | null;
			ssh_user: string | null;
			ssh_private_key: string | null;
	  };

type SchemaTable = {
	tableName: string;
	columns: Array<{
		name: string;
		dataType: string;
		isNullable: boolean;
	}>;
};

type GetDatabaseSchemaResult = SchemaTable[] | { error: string };

type ClearTableDataInput = {
	credentials: DbCredentials;
	tableName: string;
};

type RestoreDumpInput = {
	credentials: DbCredentials;
	filePath: string;
};

type RestoreDumpResult = { success: true } | { success: false; error: string };

const DUMPS_DIRECTORY = "./exports/dumps";

const hasDatabaseName = (
	input: ActiveConnectionInput,
): input is {
	driver: string | null;
	host: string | null;
	port: number | null;
	user: string | null;
	password: string | null;
	database_name: string | null;
	use_ssh: number | null;
	ssh_host: string | null;
	ssh_port: number | null;
	ssh_user: string | null;
	ssh_private_key: string | null;
} => "database_name" in input;

const normalizeCredentials = (input: ActiveConnectionInput): DbCredentials => {
	const driver = input.driver;

	const normalizedDriver: DbCredentials["driver"] =
		driver === "mysql" || driver === "sqlite" || driver === "postgres"
			? driver
			: "postgres";

	return {
		driver: normalizedDriver,
		host: input.host ?? undefined,
		port: input.port ?? undefined,
		user: input.user ?? undefined,
		password: input.password ?? undefined,
		database: hasDatabaseName(input)
			? (input.database_name ?? undefined)
			: (input.database ?? undefined),
		useSsh: hasDatabaseName(input)
			? Boolean(input.use_ssh)
			: (input.useSsh ?? false),
		sshHost: hasDatabaseName(input)
			? (input.ssh_host ?? undefined)
			: (input.sshHost ?? undefined),
		sshPort: hasDatabaseName(input)
			? (input.ssh_port ?? undefined)
			: (input.sshPort ?? undefined),
		sshUser: hasDatabaseName(input)
			? (input.ssh_user ?? undefined)
			: (input.sshUser ?? undefined),
		sshPrivateKey: hasDatabaseName(input)
			? (input.ssh_private_key ?? undefined)
			: (input.sshPrivateKey ?? undefined),
	};
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
						console.log(stats);
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
			const message = error instanceof Error ? error.message : "Unknown error";

			return {
				success: false,
				error: message,
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
			const message = error instanceof Error ? error.message : "Unknown error";

			return {
				success: false,
				error: message,
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
				error: error instanceof Error ? error.message : "Unknown error",
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
			const message = error instanceof Error ? error.message : "Unknown error";

			return {
				success: false,
				error: message,
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

		const disableForeignKeyChecks = async () => {
			if (credentials.driver === "postgres") {
				await sql`SET session_replication_role = 'replica';`.execute(db);
			}

			if (credentials.driver === "mysql") {
				await sql`SET FOREIGN_KEY_CHECKS = 0;`.execute(db);
			}

			if (credentials.driver === "sqlite") {
				await sql`PRAGMA foreign_keys = OFF;`.execute(db);
			}

			fkChecksDisabled = true;
		};

		const restoreForeignKeyChecks = async () => {
			if (!fkChecksDisabled) {
				return;
			}

			if (credentials.driver === "postgres") {
				await sql`SET session_replication_role = 'origin';`.execute(db);
			}

			if (credentials.driver === "mysql") {
				await sql`SET FOREIGN_KEY_CHECKS = 1;`.execute(db);
			}

			if (credentials.driver === "sqlite") {
				await sql`PRAGMA foreign_keys = ON;`.execute(db);
			}
		};

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

			await disableForeignKeyChecks();

			for (const tableName of tableNames) {
				await db.deleteFrom(tableName).execute();
			}

			return {
				success: true,
				message: "All data wiped successfully.",
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";

			return {
				success: false,
				error: message,
			};
		} finally {
			try {
				await restoreForeignKeyChecks();
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
		let mysqlForeignKeyChecksDisabled = false;
		let sqliteForeignKeysDisabled = false;

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
			}

			if (driver === "mysql") {
				await sql.raw("SET FOREIGN_KEY_CHECKS = 0;").execute(db);
				mysqlForeignKeyChecksDisabled = true;

				for (const table of tables) {
					await sql.raw(`DROP TABLE \`${table.name}\``).execute(db);
				}
			}

			if (driver === "sqlite") {
				await sql.raw("PRAGMA foreign_keys = OFF;").execute(db);
				sqliteForeignKeysDisabled = true;

				for (const table of tables) {
					await sql.raw(`DROP TABLE "${table.name}"`).execute(db);
				}
			}

			return {
				success: true,
				message: "All tables dropped.",
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";

			return {
				success: false,
				error: message,
			};
		} finally {
			try {
				if (mysqlForeignKeyChecksDisabled) {
					await sql.raw("SET FOREIGN_KEY_CHECKS = 1;").execute(db);
				}

				if (sqliteForeignKeysDisabled) {
					await sql.raw("PRAGMA foreign_keys = ON;").execute(db);
				}
			} catch (error) {
				console.error("Failed to restore foreign key checks:", error);
			}

			await db.destroy();
		}
	});
