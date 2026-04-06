import type { DbDriver } from "#/lib/db/connection";

/**
 * Quotes a SQL identifier (table name, column name) appropriately for the database driver.
 * MySQL uses backticks, PostgreSQL and SQLite use double quotes.
 */
export function quoteIdentifier(name: string, driver: DbDriver): string {
	if (driver === "mysql") {
		return `\`${name.replace(/`/g, "``")}\``;
	}
	// PostgreSQL and SQLite use double quotes
	return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Escapes a value for safe inclusion in a SQL statement.
 * Handles null, numbers, booleans, dates, objects (JSON), and strings.
 */
export function escapeValue(value: unknown, driver: DbDriver): string {
	if (value === null || value === undefined) {
		return "NULL";
	}

	if (typeof value === "number") {
		if (Number.isNaN(value) || !Number.isFinite(value)) {
			return "NULL";
		}
		return String(value);
	}

	if (typeof value === "boolean") {
		if (driver === "mysql") {
			return value ? "1" : "0";
		}
		return value ? "TRUE" : "FALSE";
	}

	if (value instanceof Date) {
		return `'${value.toISOString()}'`;
	}

	if (typeof value === "object") {
		// JSON objects/arrays
		const jsonStr = JSON.stringify(value).replace(/'/g, "''");
		return `'${jsonStr}'`;
	}

	// String escaping
	const str = String(value).replace(/'/g, "''");
	return `'${str}'`;
}
