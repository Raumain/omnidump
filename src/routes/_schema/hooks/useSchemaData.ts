import { useQuery } from "@tanstack/react-query";
import type { SavedConnection } from "#/server/connection-fns";
import { getAvailableDumpsFn, getDatabaseSchemaFn } from "#/server/schema-fns";

export function useSchemaData(activeConnection: SavedConnection | null) {
	const schemaQuery = useQuery({
		queryKey: ["schema", activeConnection?.id],
		queryFn: async () => {
			if (!activeConnection) {
				throw new Error("No active connection.");
			}
			return getDatabaseSchemaFn({ data: activeConnection });
		},
		enabled: !!activeConnection,
	});

	const dumpsQuery = useQuery({
		queryKey: ["available-dumps"],
		queryFn: () => getAvailableDumpsFn(),
	});

	const schemaData = schemaQuery.data;
	const schemaError =
		schemaData && "error" in schemaData ? schemaData.error : null;
	const tables = schemaData && Array.isArray(schemaData) ? schemaData : [];

	return {
		schemaQuery,
		dumpsQuery,
		schemaData,
		schemaError,
		tables,
		refetch: schemaQuery.refetch,
		refetchDumps: dumpsQuery.refetch,
	};
}
