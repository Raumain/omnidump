import { type Kysely, sql } from "kysely";
import type { DbDriver } from "#/lib/db/connection";
import { quoteIdentifier } from "./sql-utils";

type IntrospectionForeignKeyRow = {
	column_name: string;
	referenced_table_name: string;
	referenced_column_name: string;
};

type IntrospectionPrimaryKeyRow = {
	column_name: string;
};

export type TableForeignKey = {
	sourceColumn: string;
	targetTable: string;
	targetColumn: string;
};

export const getForeignKeysForTable = async (
	db: Kysely<unknown>,
	driver: DbDriver,
	tableName: string,
): Promise<TableForeignKey[]> => {
	if (driver === "postgres") {
		const result = await sql<IntrospectionForeignKeyRow>`
			SELECT
				kcu.column_name AS column_name,
				ccu.table_name AS referenced_table_name,
				ccu.column_name AS referenced_column_name
			FROM information_schema.table_constraints tc
			JOIN information_schema.key_column_usage kcu
				ON tc.constraint_name = kcu.constraint_name
				AND tc.table_schema = kcu.table_schema
			JOIN information_schema.constraint_column_usage ccu
				ON ccu.constraint_name = tc.constraint_name
				AND ccu.table_schema = tc.table_schema
			WHERE tc.constraint_type = 'FOREIGN KEY'
				AND tc.table_schema = current_schema()
				AND tc.table_name = ${tableName}
		`.execute(db);

		return result.rows.map((row) => ({
			sourceColumn: row.column_name,
			targetTable: row.referenced_table_name,
			targetColumn: row.referenced_column_name,
		}));
	}

	if (driver === "mysql") {
		const result = await sql<IntrospectionForeignKeyRow>`
			SELECT
				COLUMN_NAME AS column_name,
				REFERENCED_TABLE_NAME AS referenced_table_name,
				REFERENCED_COLUMN_NAME AS referenced_column_name
			FROM information_schema.KEY_COLUMN_USAGE
			WHERE TABLE_SCHEMA = DATABASE()
				AND TABLE_NAME = ${tableName}
				AND REFERENCED_TABLE_NAME IS NOT NULL
				AND REFERENCED_COLUMN_NAME IS NOT NULL
		`.execute(db);

		return result.rows.map((row) => ({
			sourceColumn: row.column_name,
			targetTable: row.referenced_table_name,
			targetColumn: row.referenced_column_name,
		}));
	}

	const pragmaStatement = `PRAGMA foreign_key_list(${quoteIdentifier(tableName, "sqlite")});`;
	const result = await sql.raw(pragmaStatement).execute(db);

	return (result.rows as Array<Record<string, unknown>>)
		.map((row) => ({
			sourceColumn: row.from,
			targetTable: row.table,
			targetColumn: row.to,
		}))
		.filter(
			(
				row,
			): row is {
				sourceColumn: string;
				targetTable: string;
				targetColumn: string;
			} =>
				typeof row.sourceColumn === "string" &&
				typeof row.targetTable === "string" &&
				typeof row.targetColumn === "string" &&
				row.targetColumn.trim() !== "",
		);
};

export const getPrimaryKeyColumnsForTable = async (
	db: Kysely<unknown>,
	driver: DbDriver,
	tableName: string,
): Promise<Set<string>> => {
	if (driver === "postgres") {
		const result = await sql<IntrospectionPrimaryKeyRow>`
			SELECT kcu.column_name AS column_name
			FROM information_schema.table_constraints tc
			JOIN information_schema.key_column_usage kcu
				ON tc.constraint_name = kcu.constraint_name
				AND tc.table_schema = kcu.table_schema
			WHERE tc.constraint_type = 'PRIMARY KEY'
				AND tc.table_schema = current_schema()
				AND tc.table_name = ${tableName}
			ORDER BY kcu.ordinal_position
		`.execute(db);

		return new Set(result.rows.map((row) => row.column_name));
	}

	if (driver === "mysql") {
		const result = await sql<IntrospectionPrimaryKeyRow>`
			SELECT COLUMN_NAME AS column_name
			FROM information_schema.KEY_COLUMN_USAGE
			WHERE TABLE_SCHEMA = DATABASE()
				AND TABLE_NAME = ${tableName}
				AND CONSTRAINT_NAME = 'PRIMARY'
			ORDER BY ORDINAL_POSITION
		`.execute(db);

		return new Set(result.rows.map((row) => row.column_name));
	}

	const pragmaStatement = `PRAGMA table_info(${quoteIdentifier(tableName, "sqlite")});`;
	const result = await sql.raw(pragmaStatement).execute(db);

	return new Set(
		(result.rows as Array<Record<string, unknown>>)
			.filter((row) => row.pk === 1 || row.pk === "1")
			.map((row) => row.name)
			.filter((value): value is string => typeof value === "string"),
	);
};
