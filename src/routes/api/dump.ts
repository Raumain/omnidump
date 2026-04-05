import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { createFileRoute } from "@tanstack/react-router";
import type { DbCredentials } from "../../lib/db/connection";
import type { SavedConnection } from "../../server/connection-fns";

type DumpType = "data" | "both";

type DumpRequestBody = {
	connectionId: number;
	type?: DumpType;
	tables?: string[];
	download?: boolean;
};

const isDumpType = (value: string | null | undefined): value is DumpType =>
	value === "data" || value === "both";

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
	};
};

const requireValue = (
	value: string | number | undefined,
	label: string,
): string => {
	if (value === undefined || value === null || String(value).length === 0) {
		throw new Error(`Missing required credential: ${label}`);
	}

	return String(value);
};

const buildCommandArgs = (
	credentials: DbCredentials,
	dumpType: DumpType,
	tables?: string[],
): string[] => {
	if (credentials.driver === "postgres") {
		const commandArgs = ["pg_dump", "--no-owner", "--no-privileges"];

		if (dumpType === "data") {
			commandArgs.push("-a");
		}

		// Add table selection flags for PostgreSQL
		if (tables && tables.length > 0) {
			for (const table of tables) {
				commandArgs.push("-t", table);
			}
		}

		const user = requireValue(credentials.user, "user");
		const password = requireValue(credentials.password, "password");
		const host = requireValue(credentials.host, "host");
		const port = requireValue(credentials.port, "port");
		const database = requireValue(credentials.database, "database");

		commandArgs.push(
			`postgresql://${user}:${password}@${host}:${port}/${database}`,
		);

		return commandArgs;
	}

	if (credentials.driver === "mysql") {
		const host = requireValue(credentials.host, "host");
		const port = requireValue(credentials.port, "port");
		const user = requireValue(credentials.user, "user");
		const password = requireValue(credentials.password, "password");
		const database = requireValue(credentials.database, "database");

		const commandArgs = [
			"mysqldump",
			"-h",
			host,
			"-P",
			port,
			"-u",
			user,
			`-p${password}`,
			database,
		];

		if (dumpType === "data") {
			commandArgs.push("--no-create-info");
		}

		// Add table names for MySQL (positional args after database name)
		if (tables && tables.length > 0) {
			commandArgs.push(...tables);
		}

		return commandArgs;
	}

	// SQLite
	const database = requireValue(credentials.database, "database");

	// SQLite doesn't support selective dump natively, dump all tables
	// For selective dumps, we'd need a more complex approach with .schema + SELECT
	return ["sqlite3", database, ".dump"];
};

export const Route = createFileRoute("/api/dump" as never)({
	server: {
		handlers: {
			POST: async ({ request }) => {
				try {
					const { getSavedConnectionById } = await import(
						"../../server/saved-connections"
					);

					const body = (await request
						.json()
						.catch(() => ({}))) as Partial<DumpRequestBody>;
					const connectionIdParam = body.connectionId;
					const dumpTypeParam = body.type;
					const tablesParam = body.tables;
					const downloadParam = body.download ?? false;

					const connectionId = Number(connectionIdParam);
					const dumpType: DumpType = isDumpType(dumpTypeParam)
						? dumpTypeParam
						: "both";

					// Validate tables array if provided
					const tables = Array.isArray(tablesParam)
						? tablesParam.filter(
								(t): t is string => typeof t === "string" && t.length > 0,
							)
						: undefined;

					if (!connectionIdParam || Number.isNaN(connectionId)) {
						return new Response("Invalid connectionId in body.", {
							status: 400,
						});
					}

					const connection = getSavedConnectionById(connectionId);

					if (!connection) {
						return new Response("Connection not found.", { status: 404 });
					}

					const credentials = toDbCredentials(connection);
					const dirPath = `./exports/dumps/${connection.name || "default"}/default`;
					const dumpPrefix = dumpType === "data" ? "data" : "dump";
					const timestamp = Date.now();
					const fileName = `${dumpPrefix}_${timestamp}.sql`;
					const filePath = `${dirPath}/${fileName}`;
					mkdirSync(dirPath, { recursive: true });

					const commandArgs = buildCommandArgs(credentials, dumpType, tables);
					const file = Bun.file(filePath);
					const proc = Bun.spawn(commandArgs, {
						stdout: file,
						stderr: "pipe",
						stdin: "ignore",
					});

					const exitCode = await proc.exited;

					if (exitCode !== 0) {
						const errorText = await new Response(proc.stderr).text();
						const fileCheck = Bun.file(filePath);

						if ((await fileCheck.exists()) && fileCheck.size === 0) {
							rmSync(filePath, { force: true });
						}

						throw new Error(errorText);
					}

					// If download requested, return the file content
					if (downloadParam) {
						const fileContent = readFileSync(filePath);

						return new Response(fileContent, {
							status: 200,
							headers: {
								"Content-Type": "application/sql",
								"Content-Disposition": `attachment; filename="${fileName}"`,
								"X-File-Path": filePath,
								"X-File-Name": fileName,
							},
						});
					}

					return Response.json({
						success: true,
						message: "Native dump saved locally",
						path: filePath,
						fileName,
					});
				} catch (error) {
					const message =
						error instanceof Error ? error.message : "Unknown error";

					return Response.json(
						{
							success: false,
							error: message,
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
