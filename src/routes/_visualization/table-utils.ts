export type TableRow = Record<string, unknown>;
export type TableRowIdentity = Record<string, unknown>;

export function formatCellValue(value: unknown): string {
	if (value === null || value === undefined) {
		return "NULL";
	}

	if (typeof value === "string") {
		return value;
	}

	if (
		typeof value === "number" ||
		typeof value === "bigint" ||
		typeof value === "boolean"
	) {
		return String(value);
	}

	if (value instanceof Date) {
		return value.toISOString();
	}

	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

export function getStableRowKey(
	row: TableRow,
	identity: TableRowIdentity | undefined,
): string {
	if (identity && Object.keys(identity).length > 0) {
		return `pk:${stableSerializeRecord(identity)}`;
	}

	return `row:${stableSerializeRecord(row)}`;
}

function stableSerializeRecord(record: Record<string, unknown>): string {
	const sortedEntries = Object.entries(record).sort(([left], [right]) =>
		left.localeCompare(right),
	);

	return JSON.stringify(Object.fromEntries(sortedEntries), (_key, value) =>
		typeof value === "bigint" ? value.toString() : value,
	);
}
