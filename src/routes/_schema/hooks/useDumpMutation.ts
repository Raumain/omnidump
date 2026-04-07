import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { extractErrorMessage } from "#/lib/errors";
import type { SavedConnection } from "#/server/connection-fns";

export function useDumpMutation(
	activeConnection: SavedConnection | null,
	onDumpsRefetch: () => void,
	onModalClose: () => void,
) {
	const dumpMutation = useMutation({
		mutationFn: async (options: {
			tables: string[];
			type: "data" | "both";
			download: boolean;
			anonymize: boolean;
			profileId: number | null;
		}) => {
			if (!activeConnection) {
				throw new Error("No active connection.");
			}

			const response = await fetch("/api/dump", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					connectionId: activeConnection.id,
					type: options.type,
					tables: options.tables.length > 0 ? options.tables : undefined,
					download: options.download,
					anonymize: options.anonymize,
					profileId: options.profileId,
				}),
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(
					errorData.message ||
						errorData.error ||
						"Failed to execute dump on server.",
				);
			}

			// If download requested, trigger browser download
			if (options.download) {
				const blob = await response.blob();
				const fileName = response.headers.get("X-File-Name") || "dump.sql";
				const url = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url;
				a.download = fileName;
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(url);
				return { fileName, downloaded: true };
			}

			return response.json();
		},
		onSuccess: (data) => {
			onModalClose();
			onDumpsRefetch();
			toast.success("Dump saved", {
				description: data.downloaded
					? `File downloaded: ${data.fileName}`
					: `File saved: ${data.fileName ?? "dump.sql"}`,
			});
		},
		onError: (error) => {
			toast.error("Dump failed", {
				description: extractErrorMessage(error),
			});
		},
	});

	return dumpMutation;
}
