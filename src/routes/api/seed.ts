import { faker } from "@faker-js/faker";
import { createFileRoute } from "@tanstack/react-router";
import { type Kysely, sql } from "kysely";

import type { DbCredentials } from "../../lib/db/connection";
import { extractErrorMessage } from "../../lib/errors";
import type { SavedConnection } from "../../server/connection-fns";
import { quoteIdentifier } from "../../server/db-helpers/sql-utils";

const DEFAULT_SEED_COUNT = 10;
const MAX_SEED_COUNT = 1000;
const MAX_FOREIGN_KEY_VALUE_POOL_SIZE = 5000;

type SeedRequestBody = {
	connectionId?: unknown;
	tableName?: unknown;
	count?: unknown;
};

type SeedableColumn = {
	name: string;
	dataType: string;
	isAutoIncrementing?: boolean;
};

type ForeignKeyConstraint = {
	columnName: string;
	referencedTableName: string;
	referencedColumnName: string;
};

const toDbCredentials = (connection: SavedConnection): DbCredentials => {
	const normalizedDriver: DbCredentials["driver"] =
		connection.driver === "mysql" ||
		connection.driver === "sqlite" ||
		connection.driver === "postgres"
			? connection.driver
			: "postgres";

	return {
		driver: normalizedDriver,
		host: connection.host ?? undefined,
		port: connection.port ?? undefined,
		user: connection.user ?? undefined,
		password: connection.password ?? undefined,
		database: connection.database_name ?? undefined,
	};
};

const parseConnectionId = (connectionIdParam: unknown): number => {
	const parsed =
		typeof connectionIdParam === "number"
			? connectionIdParam
			: typeof connectionIdParam === "string"
				? Number(connectionIdParam)
				: Number.NaN;

	if (!Number.isInteger(parsed) || parsed < 1) {
		throw new Error("Invalid connectionId in body.");
	}

	return parsed;
};

const parseTableName = (tableNameParam: unknown): string => {
	if (typeof tableNameParam !== "string" || tableNameParam.trim().length === 0) {
		throw new Error("Invalid tableName in body.");
	}

	return tableNameParam.trim();
};

const parseSeedCount = (countParam: unknown): number => {
	if (
		countParam === undefined ||
		countParam === null ||
		(typeof countParam === "string" && countParam.trim() === "")
	) {
		return DEFAULT_SEED_COUNT;
	}

	const parsed =
		typeof countParam === "number"
			? countParam
			: typeof countParam === "string"
				? Number(countParam)
				: Number.NaN;

	if (!Number.isInteger(parsed) || parsed < 1) {
		throw new Error("Invalid count in body. Must be an integer greater than 0.");
	}

	return Math.min(parsed, MAX_SEED_COUNT);
};

export const parseSeedRequestBody = (
	body: SeedRequestBody,
): {
	connectionId: number;
	tableName: string;
	count: number;
} => {
	return {
		connectionId: parseConnectionId(body.connectionId),
		tableName: parseTableName(body.tableName),
		count: parseSeedCount(body.count),
	};
};

const shouldSkipColumn = (column: {
	name: string;
	isAutoIncrementing?: boolean;
}): boolean => {
	return (
		column.name.toLowerCase() === "id" || column.isAutoIncrementing === true
	);
};

const getValueForColumn = (column: {
	name: string;
	dataType: string;
}): unknown => {
	const columnName = column.name.toLowerCase();
	const dataType = column.dataType.toLowerCase();

	if (columnName.endsWith("_id")) {
		if (dataType.includes("uuid")) {
			return faker.string.uuid();
		}

		if (
			dataType.includes("integer") ||
			dataType.includes("int") ||
			dataType.includes("numeric")
		) {
			return faker.number.int({ min: 1, max: 100 });
		}
	}

	if (columnName.includes("first") && columnName.includes("name")) {
		return faker.person.firstName();
	}

	if (columnName.includes("last") && columnName.includes("name")) {
		return faker.person.lastName();
	}

	if (columnName.includes("email")) {
		return faker.internet.email();
	}

	if (columnName.includes("name")) {
		return faker.company.name();
	}

	if (columnName.includes("city")) {
		return faker.location.city();
	}

	if (columnName.includes("country")) {
		return faker.location.country();
	}

	if (columnName.includes("zip") || columnName.includes("postal")) {
		return faker.location.zipCode();
	}

	if (columnName.includes("address") || columnName.includes("street")) {
		return faker.location.streetAddress();
	}

	if (columnName.includes("phone")) {
		return faker.phone.number();
	}

	if (columnName.includes("url") || columnName.includes("website")) {
		return faker.internet.url();
	}

	if (columnName.includes("company")) {
		return faker.company.name();
	}

	if (columnName.includes("description") || columnName.includes("bio")) {
		return faker.lorem.sentences(2);
	}

	if (
		dataType.includes("varchar") ||
		dataType.includes("text") ||
		dataType.includes("string")
	) {
		return faker.lorem.word();
	}

	if (
		dataType.includes("integer") ||
		dataType.includes("int") ||
		dataType.includes("numeric")
	) {
		return faker.number.int({ max: 1000 });
	}

	if (dataType.includes("boolean") || dataType.includes("bool")) {
		return faker.datatype.boolean();
	}

	if (dataType.includes("timestamp") || dataType.includes("date")) {
		return faker.date.recent().toISOString();
	}

	return faker.lorem.word();
};

const getForeignKeyConstraintsForTable = async (
	// biome-ignore lint/suspicious/noExplicitAny: Kysely generic for runtime introspection
	db: Kysely<any>,
	driver: DbCredentials["driver"],
	tableName: string,
): Promise<ForeignKeyConstraint[]> => {
	if (driver === "postgres") {
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
	}

	if (driver === "mysql") {
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
	}

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

		if (typeof referencedColumnName !== "string" || referencedColumnName === "") {
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

const buildForeignKeyValuePools = async (
	// biome-ignore lint/suspicious/noExplicitAny: Kysely generic for runtime introspection
	db: Kysely<any>,
	driver: DbCredentials["driver"],
	tableName: string,
): Promise<Map<string, unknown[]>> => {
	const foreignKeys = await getForeignKeyConstraintsForTable(db, driver, tableName);
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

const pickRandomValue = (values: unknown[]): unknown => {
	const index = faker.number.int({ min: 0, max: values.length - 1 });
	return values[index];
};

export const getColumnSeedValue = (
	column: SeedableColumn,
	foreignKeyValuesByColumn: ReadonlyMap<string, unknown[]>,
): unknown => {
	const foreignKeyValues = foreignKeyValuesByColumn.get(column.name);

	if (foreignKeyValues) {
		if (foreignKeyValues.length === 0) {
			throw new Error(
				`Cannot seed ${column.name}: referenced key list is empty for foreign key column.`,
			);
		}

		return pickRandomValue(foreignKeyValues);
	}

	return getValueForColumn(column);
};

export const Route = createFileRoute("/api/seed" as never)({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const [{ getSavedConnectionById }, { getKyselyInstance }] =
					await Promise.all([
						import("../../server/saved-connections"),
						import("../../lib/db/connection"),
					]);

				const body = (await request
					.json()
					.catch(() => ({}))) as Partial<SeedRequestBody>;
				let connectionId = 0;
				let tableName = "";
				let count = 0;

				try {
					const parsedBody = parseSeedRequestBody(body);
					connectionId = parsedBody.connectionId;
					tableName = parsedBody.tableName;
					count = parsedBody.count;
				} catch (error) {
					const message =
						error instanceof Error
							? error.message
							: "Invalid seed request body.";

					return Response.json(
						{
							success: false,
							error: message,
						},
						{ status: 400 },
					);
				}

				const connection = getSavedConnectionById(connectionId);

				if (!connection) {
					return Response.json(
						{
							success: false,
							error: "Connection not found.",
						},
						{ status: 404 },
					);
				}

				const credentials = toDbCredentials(connection);
				const db = getKyselyInstance(credentials);

				try {
					const tables = await db.introspection.getTables();
					const table = tables.find((item) => item.name === tableName);

					if (!table) {
						throw new Error(`Table not found: ${tableName}`);
					}

					const foreignKeyValuePools = await buildForeignKeyValuePools(
						db,
						credentials.driver,
						tableName,
					);
					const generatedRows: Array<Record<string, unknown>> = [];

					for (let index = 0; index < count; index += 1) {
						const row: Record<string, unknown> = {};

						for (const rawColumn of table.columns as SeedableColumn[]) {
							if (shouldSkipColumn(rawColumn)) {
								continue;
							}

							row[rawColumn.name] = getColumnSeedValue(
								rawColumn,
								foreignKeyValuePools,
							);
						}

						generatedRows.push(row);
					}

					if (generatedRows.length > 0) {
						await db
							.insertInto(tableName as never)
							.values(generatedRows as never)
							.execute();
					}

					return Response.json({
						success: true,
						inserted: generatedRows.length,
					});
				} catch (error) {
					return Response.json(
						{
							success: false,
							error: extractErrorMessage(error),
						},
						{ status: 500 },
					);
				} finally {
					await db.destroy();
				}
			},
		},
	},
});
