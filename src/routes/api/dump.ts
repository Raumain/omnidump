import { mkdirSync, rmSync } from "node:fs";
import { createFileRoute } from "@tanstack/react-router";
import type { DbCredentials } from "../../lib/db/connection";
import type { SavedConnection } from "../../server/connection-fns";

type DumpType = "data" | "both";

const isDumpType = (value: string | null): value is DumpType =>
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
): string[] => {
	if (credentials.driver === "postgres") {
		const commandArgs = ["pg_dump", "--no-owner", "--no-privileges"];

		if (dumpType === "data") {
			commandArgs.push("-a");
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

		return commandArgs;
	}

	const database = requireValue(credentials.database, "database");

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

					const body = await request.json().catch(() => ({}));
					const connectionIdParam = body.connectionId;
					const dumpTypeParam = body.type;

					const connectionId = Number(connectionIdParam);
					const dumpType: DumpType = isDumpType(dumpTypeParam)
						? dumpTypeParam
						: "both";

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
					const filePath = `${dirPath}/${dumpPrefix}_${Date.now()}.sql`;
					mkdirSync(dirPath, { recursive: true });

					const commandArgs = buildCommandArgs(credentials, dumpType);
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

					return Response.json({
						success: true,
						message: "Native dump saved locally",
						path: filePath,
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
