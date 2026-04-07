import "@tanstack/react-start/server-only";
import { strToU8, zipSync } from "fflate";

export type CsvExportScope = "table" | "database";

export type ParsedCsvExportQuery =
	| {
			connectionId: number;
			scope: "table";
			tableName: string;
	  }
	| {
			connectionId: number;
			scope: "database";
	  };

const parseConnectionId = (connectionIdParam: string | null): number => {
	if (!connectionIdParam) {
		throw new Error("Invalid connectionId query parameter.");
	}

	const connectionId = Number(connectionIdParam);

	if (!Number.isInteger(connectionId) || connectionId < 1) {
		throw new Error("Invalid connectionId query parameter.");
	}

	return connectionId;
};

const parseExportScope = (scopeParam: string | null): CsvExportScope => {
	if (scopeParam === null || scopeParam === "" || scopeParam === "table") {
		return "table";
	}

	if (scopeParam === "database") {
		return "database";
	}

	throw new Error("Invalid scope query parameter. Use table or database.");
};

export const parseCsvExportQuery = (url: URL): ParsedCsvExportQuery => {
	const connectionId = parseConnectionId(url.searchParams.get("connectionId"));
	const scope = parseExportScope(url.searchParams.get("scope"));

	if (scope === "database") {
		return { connectionId, scope };
	}

	const tableNameParam = url.searchParams.get("tableName");

	if (typeof tableNameParam !== "string" || tableNameParam.trim().length === 0) {
		throw new Error("Invalid tableName query parameter.");
	}

	return {
		connectionId,
		scope,
		tableName: tableNameParam.trim(),
	};
};

export const toCsvCell = (value: unknown): string => {
	const normalized = value === null || value === undefined ? "" : String(value);
	const escaped = normalized.replaceAll('"', '""');
	return `"${escaped}"`;
};

export const buildCsv = (
	headers: string[],
	rows: Array<Record<string, unknown>>,
): string => {
	const lines = [headers.map((header) => toCsvCell(header)).join(",")];

	for (const row of rows) {
		const values = headers.map((header) => toCsvCell(row[header]));
		lines.push(values.join(","));
	}

	return lines.join("\n");
};

export const sanitizeFileNamePart = (value: string): string => {
	const trimmed = value.trim();
	const sanitized = trimmed
		.replace(/[^a-zA-Z0-9._-]/g, "_")
		.replace(/_+/g, "_")
		.replace(/^[_.]+|[_.]+$/g, "");

	return sanitized.length > 0 ? sanitized : "database";
};

export const buildUniqueCsvFileName = (
	tableName: string,
	usedFileNames: Set<string>,
): string => {
	const baseName = sanitizeFileNamePart(tableName);
	let candidate = `${baseName}.csv`;
	let counter = 2;

	while (usedFileNames.has(candidate)) {
		candidate = `${baseName}_${counter}.csv`;
		counter += 1;
	}

	usedFileNames.add(candidate);
	return candidate;
};

export const buildCsvZip = (
	files: ReadonlyMap<string, string> | Record<string, string>,
): Uint8Array => {
	const entries = files instanceof Map ? [...files.entries()] : Object.entries(files);
	entries.sort((a, b) => a[0].localeCompare(b[0]));

	const zipEntries: Record<string, Uint8Array> = {};

	for (const [fileName, content] of entries) {
		zipEntries[fileName] = strToU8(content);
	}

	const zipData = zipSync(zipEntries, { level: 0 });
	const normalizedZipData = new Uint8Array(zipData.byteLength);
	normalizedZipData.set(zipData);
	return normalizedZipData;
};

export const buildCsvArchiveFileName = (name: string): string => {
	const safeName = sanitizeFileNamePart(name);
	return `${safeName}_csv_export.zip`;
};
