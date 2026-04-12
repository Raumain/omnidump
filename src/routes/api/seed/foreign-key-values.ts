import { type Kysely, sql } from "kysely";

import type { DbCredentials } from "../../../lib/db/connection";
import { quoteIdentifier } from "../../../server/db-helpers/sql-utils";

import { MAX_FOREIGN_KEY_VALUE_POOL_SIZE } from "./constants";
import type { ForeignKeyConstraint } from "./types";

const getPostgresForeignKeyConstraintsForTable = async (
	// biome-ignore lint/suspicious/noExplicitAny: Kysely generic for runtime introspection
	db: Kysely<any>,
	tableName: string,
): Promise<ForeignKeyConstraint[]> => {
	const result = await sql<{
		column_name: string;
		referenced_table_name: string;
		referenced_column_name: string;
	}>`
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
		columnName: row.column_name,
		referencedTableName: row.referenced_table_name,
		referencedColumnName: row.referenced_column_name,
	}));
};

const getMysqlForeignKeyConstraintsForTable = async (
	// biome-ignore lint/suspicious/noExplicitAny: Kysely generic for runtime introspection
	db: Kysely<any>,
	tableName: string,
): Promise<ForeignKeyConstraint[]> => {
	const result = await sql<{
		column_name: string;
		referenced_table_name: string;
		referenced_column_name: string;
	}>`
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
		columnName: row.column_name,
		referencedTableName: row.referenced_table_name,
		referencedColumnName: row.referenced_column_name,
	}));
};

const getSqliteForeignKeyConstraintsForTable = async (
	// biome-ignore lint/suspicious/noExplicitAny: Kysely generic for runtime introspection
	db: Kysely<any>,
	tableName: string,
): Promise<ForeignKeyConstraint[]> => {
	const pragmaStatement = `PRAGMA foreign_key_list(${quoteIdentifier(tableName, "sqlite")});`;
	const result = await sql.raw(pragmaStatement).execute(db);
	const constraints: ForeignKeyConstraint[] = [];

	for (const rawRow of result.rows as Array<Record<string, unknown>>) {
		const columnName = rawRow.from;
		const referencedTableName = rawRow.table;
		const referencedColumnName = rawRow.to;

		if (
			typeof columnName !== "string" ||
			typeof referencedTableName !== "string"
		) {
			continue;
		}

		if (
			typeof referencedColumnName !== "string" ||
			referencedColumnName === ""
		) {
			throw new Error(
				`Unsupported foreign key definition on ${tableName}.${columnName}. Referenced column must be explicit.`,
			);
		}

		constraints.push({
			columnName,
			referencedTableName,
			referencedColumnName,
		});
	}

	return constraints;
};

const getForeignKeyConstraintsForTable = async (
	// biome-ignore lint/suspicious/noExplicitAny: Kysely generic for runtime introspection
	db: Kysely<any>,
	driver: DbCredentials["driver"],
	tableName: string,
): Promise<ForeignKeyConstraint[]> => {
	if (driver === "postgres") {
		return getPostgresForeignKeyConstraintsForTable(db, tableName);
	}

	if (driver === "mysql") {
		return getMysqlForeignKeyConstraintsForTable(db, tableName);
	}

	return getSqliteForeignKeyConstraintsForTable(db, tableName);
};

const getForeignKeyValuePool = async (
	// biome-ignore lint/suspicious/noExplicitAny: Kysely generic for runtime introspection
	db: Kysely<any>,
	driver: DbCredentials["driver"],
	foreignKey: ForeignKeyConstraint,
): Promise<unknown[]> => {
	const quotedTable = quoteIdentifier(foreignKey.referencedTableName, driver);
	const quotedColumn = quoteIdentifier(foreignKey.referencedColumnName, driver);
	const statement = `
		SELECT ${quotedColumn} AS value
		FROM ${quotedTable}
		WHERE ${quotedColumn} IS NOT NULL
		LIMIT ${MAX_FOREIGN_KEY_VALUE_POOL_SIZE}
	`;
	const result = await sql.raw(statement).execute(db);

	return (result.rows as Array<{ value: unknown }>).map((row) => row.value);
};

export const buildForeignKeyValuePools = async (
	// biome-ignore lint/suspicious/noExplicitAny: Kysely generic for runtime introspection
	db: Kysely<any>,
	driver: DbCredentials["driver"],
	tableName: string,
): Promise<Map<string, unknown[]>> => {
	const foreignKeys = await getForeignKeyConstraintsForTable(
		db,
		driver,
		tableName,
	);
	const valuePoolsByColumn = new Map<string, unknown[]>();
	const valuePoolCache = new Map<string, unknown[]>();

	for (const foreignKey of foreignKeys) {
		const poolCacheKey = `${foreignKey.referencedTableName}.${foreignKey.referencedColumnName}`;
		let valuePool = valuePoolCache.get(poolCacheKey);

		if (!valuePool) {
			valuePool = await getForeignKeyValuePool(db, driver, foreignKey);
			valuePoolCache.set(poolCacheKey, valuePool);
		}

		if (valuePool.length === 0) {
			throw new Error(
				`Cannot seed ${tableName}.${foreignKey.columnName}: no rows in referenced table ${foreignKey.referencedTableName}.${foreignKey.referencedColumnName}.`,
			);
		}

		valuePoolsByColumn.set(foreignKey.columnName, valuePool);
	}

	return valuePoolsByColumn;
};
