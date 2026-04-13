import { createFileRoute } from "@tanstack/react-router";

import { savedConnectionToDbCredentials } from "../../lib/credentials";
import { extractErrorMessage } from "../../lib/errors";
import { parseSeedRequest } from "./seed/request-parsing";
import { seedTableRows } from "./seed/table-seeder";

export { getColumnSeedValue } from "./seed/column-value-strategy";
export {
	extractSqliteEnumValuesFromCreateStatement,
	parseMysqlEnumColumnType,
	parseSqlStringLiteralList,
} from "./seed/enum-values";
export { parseSeedRequestBody } from "./seed/request-parsing";

export const Route = createFileRoute("/api/seed" as never)({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const [{ getSavedConnectionById }, { getKyselyInstance }] =
					await Promise.all([
						import("../../server/saved-connections"),
						import("../../lib/db/connection"),
					]);

				const parsedRequest = await parseSeedRequest(request);

				if (!parsedRequest.success) {
					return parsedRequest.response;
				}

				const { connectionId, tableName, count } = parsedRequest.data;
				const connection = getSavedConnectionById(connectionId);

				if (!connection) {
					return Response.json(
						{
							success: false,
							error: "Connection not found.",
						},
						{ status: 404 },
					);
				}

				const credentials = savedConnectionToDbCredentials(connection);
				const db = getKyselyInstance(credentials);

				try {
					const inserted = await seedTableRows(
						db,
						credentials.driver,
						tableName,
						count,
					);

					return Response.json({
						success: true,
						inserted,
					});
				} catch (error) {
					return Response.json(
						{
							success: false,
							error: extractErrorMessage(error),
						},
						{ status: 500 },
					);
				} finally {
					await db.destroy();
				}
			},
		},
	},
});
