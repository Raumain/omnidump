import { createFileRoute } from "@tanstack/react-router";

import type { DbCredentials } from "../../lib/db/connection";
import { extractErrorMessage } from "../../lib/errors";
import type { SavedConnection } from "../../server/connection-fns";

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

const toCsvCell = (value: unknown): string => {
	let formattedValue = String(
		value === null || value === undefined ? "" : value,
	);

	if (/[",\n;]/.test(formattedValue)) {
		formattedValue = `"${formattedValue.replace(/"/g, '""')}"`;
	}

	return formattedValue;
};

export const Route = createFileRoute("/api/export-csv" as never)({
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
				const tableName = url.searchParams.get("tableName");
				const connectionId = Number(connectionIdParam);

				if (!connectionIdParam || Number.isNaN(connectionId)) {
					return new Response("Invalid connectionId query parameter.", {
						status: 400,
					});
				}

				if (!tableName || tableName.trim().length === 0) {
					return new Response("Invalid tableName query parameter.", {
						status: 400,
					});
				}

				const connection = getSavedConnectionById(connectionId);

				if (!connection) {
					return new Response("Connection not found.", { status: 404 });
				}

				const db = getKyselyInstance(toDbCredentials(connection));

				try {
					const rows = await db.selectFrom(tableName).selectAll().execute();

					if (rows.length === 0) {
						return new Response("No rows found for selected table.", {
							status: 404,
						});
					}

					const headers = Object.keys(rows[0] as Record<string, unknown>);
					const lines = [headers.join(",")];

					for (const row of rows as Array<Record<string, unknown>>) {
						const line = headers
							.map((header) => {
								return toCsvCell(row[header]);
							})
							.join(",");

						lines.push(line);
					}

					const csv = lines.join("\n");

					return new Response(csv, {
						headers: {
							"Content-Type": "text/csv; charset=utf-8",
							"Content-Disposition": `attachment; filename="${tableName}_export.csv"`,
						},
					});
				} catch (error) {
					return new Response(extractErrorMessage(error), { status: 500 });
				} finally {
					await db.destroy();
				}
			},
		},
	},
});
