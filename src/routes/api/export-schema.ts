import { createFileRoute } from "@tanstack/react-router";

import type { DbCredentials } from "../../lib/db/connection";
import type { SavedConnection } from "../../server/connection-fns";

type ExportFormat = "json" | "dbml" | "sql";

const isExportFormat = (value: string | null): value is ExportFormat =>
	value === "json" || value === "dbml" || value === "sql";

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

const buildSchemaDumpCommand = (credentials: DbCredentials): string[] => {
	if (credentials.driver === "postgres") {
		const user = requireValue(credentials.user, "user");
		const password = requireValue(credentials.password, "password");
		const host = requireValue(credentials.host, "host");
		const port = requireValue(credentials.port, "port");
		const database = requireValue(credentials.database, "database");

		return [
			"pg_dump",
			"--no-owner",
			"--no-privileges",
			"-s",
			`postgresql://${user}:${password}@${host}:${port}/${database}`,
		];
	}

	if (credentials.driver === "mysql") {
		const host = requireValue(credentials.host, "host");
		const port = requireValue(credentials.port, "port");
		const user = requireValue(credentials.user, "user");
		const password = requireValue(credentials.password, "password");
		const database = requireValue(credentials.database, "database");

		return [
			"mysqldump",
			"-h",
			host,
			"-P",
			port,
			"-u",
			user,
			`-p${password}`,
			database,
			"--no-data",
		];
	}

	const database = requireValue(credentials.database, "database");
	return ["sqlite3", database, ".schema"];
};

export const Route = createFileRoute("/api/export-schema" as never)({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const [{ getSavedConnectionById }, { getKyselyInstance }] =
					await Promise.all([
						import("../../server/saved-connections"),
						import("../../lib/db/connection"),
					]);

				const url = new URL(request.url);
				const connectionIdParam = url.searchParams.get("connectionId");
				const formatParam = url.searchParams.get("format");
				const connectionId = Number(connectionIdParam);

				if (!connectionIdParam || Number.isNaN(connectionId)) {
					return new Response("Invalid connectionId query parameter.", {
						status: 400,
					});
				}

				if (!isExportFormat(formatParam)) {
					return new Response(
						"Invalid format query parameter. Use json, dbml, or sql.",
						{
							status: 400,
						},
					);
				}

				const connection = getSavedConnectionById(connectionId);

				if (!connection) {
					return new Response("Connection not found.", { status: 404 });
				}

				// For SQL format, use native database tools
				if (formatParam === "sql") {
					const credentials = toDbCredentials(connection);
					const commandArgs = buildSchemaDumpCommand(credentials);

					const proc = Bun.spawn(commandArgs, {
						stdout: "pipe",
						stderr: "pipe",
						stdin: "ignore",
					});

					const exitCode = await proc.exited;

					if (exitCode !== 0) {
						const errorText = await new Response(proc.stderr).text();
						return new Response(`Schema dump failed: ${errorText}`, {
							status: 500,
						});
					}

					const sqlContent = await new Response(proc.stdout).text();

					return new Response(sqlContent, {
						headers: {
							"Content-Type": "application/sql",
							"Content-Disposition": 'attachment; filename="schema.sql"',
						},
					});
				}

				const db = getKyselyInstance(toDbCredentials(connection));

				try {
					const tables = await db.introspection.getTables();

					if (formatParam === "json") {
						return new Response(JSON.stringify(tables, null, 2), {
							headers: {
								"Content-Type": "application/json",
								"Content-Disposition": 'attachment; filename="schema.json"',
							},
						});
					}

					let dbml = "";

					for (const table of tables) {
						dbml += `Table "${table.name}" {\n`;

						for (const col of table.columns) {
							const nullable = col.isNullable ? "" : " not null";
							dbml += `  "${col.name}" ${col.dataType}${nullable}\n`;
						}

						dbml += `}\n\n`;
					}

					return new Response(dbml, {
						headers: {
							"Content-Type": "text/plain",
							"Content-Disposition": 'attachment; filename="schema.dbml"',
						},
					});
				} catch (error) {
					const message =
						error instanceof Error ? error.message : "Unknown error";

					return new Response(message, { status: 500 });
				} finally {
					await db.destroy();
				}
			},
		},
	},
});
