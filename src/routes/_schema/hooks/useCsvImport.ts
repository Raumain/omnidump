import { useMutation } from "@tanstack/react-query";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { extractErrorMessage } from "#/lib/errors";

type TableSchema = {
	tableName: string;
	columns: Array<{
		name: string;
		dataType: string;
		isNullable: boolean;
	}>;
};

const normalizeColumnName = (name: string) =>
	name.toLowerCase().replace(/[\s_-]/g, "");

export function useCsvImport(
	activeConnectionId: number | undefined,
	selectedTable: string | null,
	tables: TableSchema[],
	onSchemaRefetch: () => void,
) {
	const [isImportDrawerOpen, setIsImportDrawerOpen] = useState(false);
	const [csvFile, setCsvFile] = useState<File | null>(null);
	const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
	const [columnMapping, setColumnMapping] = useState<Record<string, string>>(
		{},
	);
	const [importSuccessCount, setImportSuccessCount] = useState(0);
	const [importFailedCount, setImportFailedCount] = useState(0);
	const [rejectFileName, setRejectFileName] = useState<string | null>(null);
	const csvFileInputRef = useRef<HTMLInputElement>(null);

	const importMutation = useMutation({
		mutationFn: async (input: {
			file: File;
			connectionId: number;
			tableName: string;
			mapping: Record<string, string>;
		}) => {
			const formData = new FormData();
			formData.append("file", input.file);
			formData.append("connectionId", String(input.connectionId));
			formData.append("tableName", input.tableName);
			formData.append("mapping", JSON.stringify(input.mapping));

			const response = await fetch("/api/import", {
				method: "POST",
				body: formData,
			});

			if (!response.ok) {
				const errorData = (await response.json().catch(() => null)) as {
					error?: string;
				} | null;
				const message = errorData?.error ?? "Import failed.";
				throw new Error(message);
			}

			const reader = response.body?.getReader();
			const decoder = new TextDecoder();

			if (!reader) {
				throw new Error("Import stream is unavailable.");
			}

			let pendingChunk = "";

			const processEvent = (event: string) => {
				const dataLine = event
					.split("\n")
					.find((line) => line.startsWith("data: "));

				if (!dataLine) {
					return;
				}

				const payload = JSON.parse(dataLine.slice(6)) as {
					successfulRows?: number;
					failedRows?: number;
					status?: "processing" | "completed" | "failed";
					error?: string;
					rejectFileName?: string;
				};

				setImportSuccessCount(payload.successfulRows ?? 0);
				setImportFailedCount(payload.failedRows ?? 0);

				if (payload.status === "completed") {
					setRejectFileName(payload.rejectFileName ?? null);
				}

				if (payload.status === "failed") {
					throw new Error(payload.error ?? "Import failed.");
				}
			};

			while (true) {
				const { done, value } = await reader.read();

				if (done) {
					break;
				}

				pendingChunk += decoder.decode(value, { stream: true });
				const events = pendingChunk.split("\n\n");
				pendingChunk = events.pop() ?? "";

				for (const event of events) {
					processEvent(event);
				}
			}

			const trailingEvent = pendingChunk.trim();

			if (trailingEvent) {
				processEvent(trailingEvent);
			}
		},
		onMutate: () => {
			setImportSuccessCount(0);
			setImportFailedCount(0);
			setRejectFileName(null);
		},
		onSuccess: () => {
			onSchemaRefetch();
			toast.success("Import completed", {
				description: `Imported ${importSuccessCount} rows successfully.`,
			});
		},
		onError: (error) => {
			toast.error("Import failed", {
				description: extractErrorMessage(error),
			});
		},
	});

	const isMappingReady =
		csvHeaders.length > 0 &&
		csvHeaders.every((header) => Boolean(columnMapping[header]));

	// Auto-map CSV headers to table columns when drawer opens or table changes
	useEffect(() => {
		if (!selectedTable || csvHeaders.length === 0) {
			return;
		}

		const tableColumns =
			tables.find((table) => table.tableName === selectedTable)?.columns ?? [];

		if (tableColumns.length === 0) {
			setColumnMapping({});
			return;
		}

		const normalizedColumnLookup = new Map<string, string>();

		for (const column of tableColumns) {
			normalizedColumnLookup.set(normalizeColumnName(column.name), column.name);
		}

		const autoMapping: Record<string, string> = {};

		for (const header of csvHeaders) {
			const matchedColumn = normalizedColumnLookup.get(
				normalizeColumnName(header),
			);

			if (matchedColumn) {
				autoMapping[header] = matchedColumn;
			}
		}

		setColumnMapping(autoMapping);
	}, [csvHeaders, selectedTable, tables]);

	const handleCsvFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
		const nextFile = event.target.files?.[0] ?? null;

		setCsvFile(nextFile);
		setColumnMapping({});

		if (!nextFile) {
			setCsvHeaders([]);
			return;
		}

		const preview = await nextFile.slice(0, 1024).text();
		const [firstLine = ""] = preview.split("\n");
		const normalizedLine = firstLine.replace(/\r$/, "").trim();

		if (normalizedLine === "") {
			setCsvHeaders([]);
			return;
		}

		const commaCount = (normalizedLine.match(/,/g) ?? []).length;
		const semicolonCount = (normalizedLine.match(/;/g) ?? []).length;
		const delimiter = semicolonCount > commaCount ? ";" : ",";

		const headers = normalizedLine
			.split(delimiter)
			.map((header) => header.trim())
			.filter((header) => header !== "");

		setCsvHeaders(headers);
	};

	const handleImport = async () => {
		if (!csvFile || !selectedTable || !activeConnectionId || !isMappingReady) {
			return;
		}

		importMutation.mutate({
			file: csvFile,
			connectionId: activeConnectionId,
			tableName: selectedTable,
			mapping: columnMapping,
		});
	};

	const resetImportDrawer = () => {
		setCsvFile(null);
		setCsvHeaders([]);
		setColumnMapping({});
		setImportSuccessCount(0);
		setImportFailedCount(0);
		setRejectFileName(null);
		importMutation.reset();

		if (csvFileInputRef.current) {
			csvFileInputRef.current.value = "";
		}
	};

	const openImportDrawer = () => {
		resetImportDrawer();
		setIsImportDrawerOpen(true);
	};

	const setColumnMappingForHeader = (header: string, column: string) => {
		setColumnMapping((prev) => ({
			...prev,
			[header]: column,
		}));
	};

	return {
		isImportDrawerOpen,
		setIsImportDrawerOpen,
		csvFile,
		csvHeaders,
		columnMapping,
		importSuccessCount,
		importFailedCount,
		rejectFileName,
		csvFileInputRef,
		importMutation,
		isMappingReady,
		handleCsvFileChange,
		handleImport,
		resetImportDrawer,
		openImportDrawer,
		setColumnMappingForHeader,
	};
}
