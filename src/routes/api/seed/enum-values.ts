import { type Kysely, sql } from "kysely";

import type { DbCredentials } from "../../../lib/db/connection";

import type { SeedableColumn } from "./types";

export const parseSqlStringLiteralList = (valueList: string): string[] => {
	const values: string[] = [];
	let index = 0;

	while (index < valueList.length) {
		while (
			index < valueList.length &&
			(valueList[index] === "," || /\s/.test(valueList[index]))
		) {
			index += 1;
		}

		if (index >= valueList.length) {
			break;
		}

		if (valueList[index] !== "'") {
			throw new Error(`Unsupported enum value format: ${valueList}`);
		}

		index += 1;
		let parsedValue = "";
		let hasClosingQuote = false;

		while (index < valueList.length) {
			const char = valueList[index];
			const nextChar = valueList[index + 1];

			if (char === "\\") {
				if (nextChar === undefined) {
					throw new Error(`Invalid enum escaping in value list: ${valueList}`);
				}

				parsedValue += nextChar;
				index += 2;
				continue;
			}

			if (char === "'" && nextChar === "'") {
				parsedValue += "'";
				index += 2;
				continue;
			}

			if (char === "'") {
				hasClosingQuote = true;
				index += 1;
				break;
			}

			parsedValue += char;
			index += 1;
		}

		if (!hasClosingQuote) {
			throw new Error(`Unterminated enum value in list: ${valueList}`);
		}

		values.push(parsedValue);

		while (index < valueList.length && /\s/.test(valueList[index])) {
			index += 1;
		}

		if (index < valueList.length) {
			if (valueList[index] !== ",") {
				throw new Error(`Invalid enum delimiter in list: ${valueList}`);
			}

			index += 1;
		}
	}

	return values;
};

export const parseMysqlEnumColumnType = (columnType: string): string[] => {
	const match = /^enum\s*\(([\s\S]*)\)$/i.exec(columnType.trim());

	if (!match) {
		return [];
	}

	return parseSqlStringLiteralList(match[1]);
};

export const extractSqliteEnumValuesFromCreateStatement = (
	createStatement: string,
): Map<string, string[]> => {
	const enumValuesByColumn = new Map<string, string[]>();
	const checkInPattern =
		/CHECK\s*\(\s*\(?\s*(?:"([^"]+)"|`([^`]+)`|\[([^\]]+)\]|([A-Za-z_][A-Za-z0-9_]*))\s*\)?\s+IN\s*\(([^)]*)\)\s*\)/gi;

	let match = checkInPattern.exec(createStatement);

	while (match) {
		const columnName = match[1] ?? match[2] ?? match[3] ?? match[4];
		const enumValueList = match[5];

		if (columnName && enumValueList) {
			try {
				const parsedValues = parseSqlStringLiteralList(enumValueList);

				if (parsedValues.length > 0) {
					enumValuesByColumn.set(columnName, parsedValues);
				}
			} catch {
				// Ignore non-enum CHECK constraints that don't map to literal lists.
			}
		}

		match = checkInPattern.exec(createStatement);
	}

	return enumValuesByColumn;
};

const getPostgresEnumValuesForTable = async (
	// biome-ignore lint/suspicious/noExplicitAny: Kysely generic for runtime introspection
	db: Kysely<any>,
	tableName: string,
): Promise<Map<string, string[]>> => {
	const result = await sql<{
		column_name: string;
		enum_value: string;
	}>`
		SELECT
			a.attname AS column_name,
			e.enumlabel AS enum_value
		FROM pg_class c
		JOIN pg_namespace n ON n.oid = c.relnamespace
		JOIN pg_attribute a ON a.attrelid = c.oid
		JOIN pg_type t ON t.oid = a.atttypid
		JOIN pg_enum e ON e.enumtypid = t.oid
		WHERE c.relname = ${tableName}
			AND n.nspname = current_schema()
			AND a.attnum > 0
			AND NOT a.attisdropped
		ORDER BY a.attname, e.enumsortorder
	`.execute(db);
	const enumValuesByColumn = new Map<string, string[]>();

	for (const row of result.rows) {
		const existingValues = enumValuesByColumn.get(row.column_name) ?? [];
		existingValues.push(row.enum_value);
		enumValuesByColumn.set(row.column_name, existingValues);
	}

	return enumValuesByColumn;
};

const getMysqlEnumValuesForTable = async (
	// biome-ignore lint/suspicious/noExplicitAny: Kysely generic for runtime introspection
	db: Kysely<any>,
	tableName: string,
): Promise<Map<string, string[]>> => {
	const result = await sql<{
		column_name: string;
		column_type: string;
	}>`
		SELECT
			COLUMN_NAME AS column_name,
			COLUMN_TYPE AS column_type
		FROM information_schema.COLUMNS
		WHERE TABLE_SCHEMA = DATABASE()
			AND TABLE_NAME = ${tableName}
			AND DATA_TYPE = 'enum'
	`.execute(db);
	const enumValuesByColumn = new Map<string, string[]>();

	for (const row of result.rows) {
		const enumValues = parseMysqlEnumColumnType(row.column_type);

		if (enumValues.length === 0) {
			throw new Error(
				`Unable to parse enum definition for ${tableName}.${row.column_name}.`,
			);
		}

		enumValuesByColumn.set(row.column_name, enumValues);
	}

	return enumValuesByColumn;
};

const getSqliteEnumValuesForTable = async (
	// biome-ignore lint/suspicious/noExplicitAny: Kysely generic for runtime introspection
	db: Kysely<any>,
	tableName: string,
	columns: SeedableColumn[],
): Promise<Map<string, string[]>> => {
	const result = await sql<{
		sql: string | null;
	}>`
		SELECT sql
		FROM sqlite_master
		WHERE type = 'table' AND name = ${tableName}
	`.execute(db);
	const createStatement = result.rows[0]?.sql;

	if (typeof createStatement !== "string" || createStatement.length === 0) {
		return new Map();
	}

	const sqliteEnumValues =
		extractSqliteEnumValuesFromCreateStatement(createStatement);
	const canonicalColumnNames = new Map(
		columns.map((column) => [column.name.toLowerCase(), column.name]),
	);
	const enumValuesByColumn = new Map<string, string[]>();

	for (const [columnName, enumValues] of sqliteEnumValues.entries()) {
		const canonicalColumnName = canonicalColumnNames.get(
			columnName.toLowerCase(),
		);

		if (!canonicalColumnName) {
			continue;
		}

		enumValuesByColumn.set(canonicalColumnName, enumValues);
	}

	return enumValuesByColumn;
};

export const getEnumValuesForTable = async (
	// biome-ignore lint/suspicious/noExplicitAny: Kysely generic for runtime introspection
	db: Kysely<any>,
	driver: DbCredentials["driver"],
	tableName: string,
	columns: SeedableColumn[],
): Promise<Map<string, string[]>> => {
	if (driver === "postgres") {
		return getPostgresEnumValuesForTable(db, tableName);
	}

	if (driver === "mysql") {
		return getMysqlEnumValuesForTable(db, tableName);
	}

	return getSqliteEnumValuesForTable(db, tableName, columns);
};
