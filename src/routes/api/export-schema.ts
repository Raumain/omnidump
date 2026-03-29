import { createFileRoute } from "@tanstack/react-router";

import type { DbCredentials } from "../../lib/db/connection";
import type { SavedConnection } from "../../server/connection-fns";

type ExportFormat = "json" | "dbml";

const isExportFormat = (value: string | null): value is ExportFormat =>
	value === "json" || value === "dbml";

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
						"Invalid format query parameter. Use json or dbml.",
						{
							status: 400,
						},
					);
				}

				const connection = getSavedConnectionById(connectionId);

				if (!connection) {
					return new Response("Connection not found.", { status: 404 });
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
