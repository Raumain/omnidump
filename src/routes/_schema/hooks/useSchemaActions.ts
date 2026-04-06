import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { savedConnectionToCredentials } from "#/lib/credentials";
import { extractErrorMessage } from "#/lib/errors";
import type { SavedConnection } from "#/server/connection-fns";
import {
	clearTableDataFn,
	deleteDumpFn,
	dropAllTablesFn,
	restoreDumpFn,
	wipeAllDataFn,
} from "#/server/schema-fns";

export function useSchemaActions(
	activeConnection: SavedConnection | null,
	onSchemaRefetch: () => void,
	onDumpsRefetch: () => void,
) {
	const seedMutation = useMutation({
		mutationFn: async (input: { tableName: string; count: number }) => {
			if (!activeConnection) {
				throw new Error("No active connection.");
			}

			const response = await fetch("/api/seed", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					connectionId: activeConnection.id,
					tableName: input.tableName,
					count: input.count,
				}),
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(errorData.error || "Seed failed.");
			}

			return response.json();
		},
		onSuccess: () => {
			onSchemaRefetch();
			toast.success("Table seeded", {
				description: "Fake data has been inserted into the table.",
			});
		},
		onError: (error) => {
			toast.error("Seed failed", {
				description: extractErrorMessage(error),
			});
		},
	});

	const clearTableMutation = useMutation({
		mutationFn: async (tableName: string) => {
			if (!activeConnection) {
				throw new Error("No active connection.");
			}

			const result = await clearTableDataFn({
				data: {
					tableName,
					credentials: savedConnectionToCredentials(activeConnection),
				},
			});

			if (!result.success) {
				throw new Error(result.error);
			}

			return result;
		},
		onSuccess: () => {
			onSchemaRefetch();
			toast.success("Table cleared", {
				description: "All rows were removed from the selected table.",
			});
		},
		onError: (error) => {
			toast.error("Clear failed", {
				description: extractErrorMessage(error),
			});
		},
	});

	const wipeAllDataMutation = useMutation({
		mutationFn: async () => {
			if (!activeConnection) {
				throw new Error("No active connection.");
			}

			const result = await wipeAllDataFn({
				data: savedConnectionToCredentials(activeConnection),
			});

			if (!result.success) {
				throw new Error(result.error);
			}

			return result;
		},
		onSuccess: () => {
			onSchemaRefetch();
			toast.success("Data wiped", {
				description: "All data has been deleted from all tables.",
			});
		},
		onError: (error) => {
			toast.error("Wipe failed", {
				description: extractErrorMessage(error),
			});
		},
	});

	const dropAllTablesMutation = useMutation({
		mutationFn: async () => {
			if (!activeConnection) {
				throw new Error("No active connection.");
			}

			const result = await dropAllTablesFn({
				data: savedConnectionToCredentials(activeConnection),
			});

			if (!result.success) {
				throw new Error(result.error);
			}

			return result;
		},
		onSuccess: () => {
			onSchemaRefetch();
			toast.success("Tables dropped", {
				description: "All tables have been removed from the database.",
			});
		},
		onError: (error) => {
			toast.error("Drop failed", {
				description: extractErrorMessage(error),
			});
		},
	});

	const restoreDumpMutation = useMutation({
		mutationFn: async (filePath: string) => {
			if (!activeConnection) {
				throw new Error("No active connection.");
			}

			const result = await restoreDumpFn({
				data: {
					filePath,
					credentials: savedConnectionToCredentials(activeConnection),
				},
			});

			if (!result.success) {
				throw new Error(result.error);
			}

			return result;
		},
		onSuccess: () => {
			onSchemaRefetch();
			toast.success("Dump restored", {
				description: "The database has been restored from the selected dump.",
			});
		},
		onError: (error) => {
			toast.error("Restore failed", {
				description: extractErrorMessage(error),
			});
		},
	});

	const deleteDumpMutation = useMutation({
		mutationFn: async (filePath: string) => {
			const result = await deleteDumpFn({ data: { filePath } });

			if (!result.success) {
				throw new Error(result.error);
			}

			return result;
		},
		onSuccess: () => {
			onDumpsRefetch();
			toast.success("Dump deleted", {
				description: "The dump file has been removed.",
			});
		},
		onError: (error) => {
			toast.error("Delete failed", {
				description: extractErrorMessage(error),
			});
		},
	});

	const handleDownloadDump = (filePath: string) => {
		const url = `/api/download-dump?path=${encodeURIComponent(filePath)}`;
		const a = document.createElement("a");
		a.href = url;
		a.download = filePath.split("/").pop() ?? "dump.sql";
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	};

	return {
		seedMutation,
		clearTableMutation,
		wipeAllDataMutation,
		dropAllTablesMutation,
		restoreDumpMutation,
		deleteDumpMutation,
		handleDownloadDump,
	};
}
