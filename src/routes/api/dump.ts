import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createFileRoute } from "@tanstack/react-router";
import { savedConnectionToDbCredentials } from "../../lib/credentials";
import type { DbCredentials } from "../../lib/db/connection";
import { extractErrorMessage } from "../../lib/errors";

type DumpType = "data" | "both";

type DumpRequestBody = {
	connectionId: number;
	type?: DumpType;
	tables?: string[];
	download?: boolean;
	anonymize?: boolean;
	profileId?: number;
};

const isDumpType = (value: string | null | undefined): value is DumpType =>
	value === "data" || value === "both";

type ParsedDumpRequest = {
	connectionIdParam: Partial<DumpRequestBody>["connectionId"];
	connectionId: number;
	dumpType: DumpType;
	tables: string[] | undefined;
	download: boolean;
	anonymize: boolean;
	profileId: number | undefined;
};

type DumpFileTarget = {
	dirPath: string;
	fileName: string;
	filePath: string;
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

const parseDumpRequest = async (
	request: Request,
): Promise<ParsedDumpRequest> => {
	const body = (await request
		.json()
		.catch(() => ({}))) as Partial<DumpRequestBody>;
	const connectionIdParam = body.connectionId;
	const dumpTypeParam = body.type;
	const tablesParam = body.tables;

	return {
		connectionIdParam,
		connectionId: Number(connectionIdParam),
		dumpType: isDumpType(dumpTypeParam) ? dumpTypeParam : "both",
		tables: Array.isArray(tablesParam)
			? tablesParam.filter(
					(tableName): tableName is string =>
						typeof tableName === "string" && tableName.length > 0,
				)
			: undefined,
		download: body.download ?? false,
		anonymize: body.anonymize ?? false,
		profileId: body.profileId,
	};
};

const buildDumpFileTarget = (
	connectionName: string,
	dumpType: DumpType,
	anonymize: boolean,
): DumpFileTarget => {
	const dirPath = `./exports/dumps/${connectionName || "default"}/default`;
	const dumpPrefix = anonymize ? "anon" : dumpType === "data" ? "data" : "dump";
	const timestamp = Date.now();
	const fileName = `${dumpPrefix}_${timestamp}.sql`;
	const filePath = `${dirPath}/${fileName}`;

	return { dirPath, fileName, filePath };
};

const createDownloadResponse = (
	content: BodyInit,
	fileName: string,
	filePath: string,
): Response =>
	new Response(content, {
		status: 200,
		headers: {
			"Content-Type": "application/sql",
			"Content-Disposition": `attachment; filename="${fileName}"`,
			"X-File-Path": filePath,
			"X-File-Name": fileName,
		},
	});

const runNativeDump = async (
	credentials: DbCredentials,
	dumpType: DumpType,
	tables: string[] | undefined,
	filePath: string,
) => {
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
};

export const Route = createFileRoute("/api/dump" as never)({
	server: {
		handlers: {
			POST: async ({ request }) => {
				try {
					const { getSavedConnectionById } = await import(
						"../../server/saved-connections"
					);
					const {
						connectionIdParam,
						connectionId,
						dumpType,
						tables,
						download,
						anonymize,
						profileId,
					} = await parseDumpRequest(request);

					if (!connectionIdParam || Number.isNaN(connectionId)) {
						return new Response("Invalid connectionId in body.", {
							status: 400,
						});
					}

					const connection = getSavedConnectionById(connectionId);

					if (!connection) {
						return new Response("Connection not found.", { status: 404 });
					}

					const credentials = savedConnectionToDbCredentials(connection);
					const { dirPath, fileName, filePath } = buildDumpFileTarget(
						connection.name,
						dumpType,
						anonymize,
					);
					mkdirSync(dirPath, { recursive: true });

					// If anonymization is requested, use the anonymized dump generator
					if (anonymize && profileId) {
						const { getAnonymizationRulesFn } = await import(
							"../../server/anonymization-fns"
						);
						const { generateAnonymizedDump } = await import(
							"../../server/anonymized-dump"
						);

						const rules = await getAnonymizationRulesFn({
							data: profileId,
						});

						if (rules.length === 0) {
							return Response.json(
								{
									success: false,
									error:
										"No anonymization rules found for the selected profile.",
								},
								{ status: 400 },
							);
						}

						const dumpContent = await generateAnonymizedDump({
							credentials,
							tables,
							rules,
							includeSchema: dumpType === "both",
						});

						writeFileSync(filePath, dumpContent, "utf-8");

						if (download) {
							return createDownloadResponse(dumpContent, fileName, filePath);
						}

						return Response.json({
							success: true,
							message: "Anonymized dump saved locally",
							path: filePath,
							fileName,
						});
					}

					// Standard native dump (pg_dump, mysqldump, etc.)

					await runNativeDump(credentials, dumpType, tables, filePath);

					// If download requested, return the file content
					if (download) {
						const fileContent = readFileSync(filePath);

						return createDownloadResponse(fileContent, fileName, filePath);
					}

					return Response.json({
						success: true,
						message: "Native dump saved locally",
						path: filePath,
						fileName,
					});
				} catch (error) {
					return Response.json(
						{
							success: false,
							error: extractErrorMessage(error),
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
