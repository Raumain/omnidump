import type { Kysely } from "kysely";

import type { DbCredentials } from "../../../lib/db/connection";

import { getColumnSeedValue, shouldSkipColumn } from "./column-value-strategy";
import { getEnumValuesForTable } from "./enum-values";
import { buildForeignKeyValuePools } from "./foreign-key-values";
import type { SeedableColumn } from "./types";

const getSeedableTable = async (
	// biome-ignore lint/suspicious/noExplicitAny: Kysely generic for runtime introspection
	db: Kysely<any>,
	tableName: string,
): Promise<{ columns: SeedableColumn[] }> => {
	const tables = await db.introspection.getTables();
	const table = tables.find((item) => item.name === tableName);

	if (!table) {
		throw new Error(`Table not found: ${tableName}`);
	}

	return {
		columns: table.columns as SeedableColumn[],
	};
};

const generateSeedRows = (
	columns: SeedableColumn[],
	count: number,
	foreignKeyValuePools: ReadonlyMap<string, unknown[]>,
	enumValuePools: ReadonlyMap<string, string[]>,
): Array<Record<string, unknown>> => {
	const generatedRows: Array<Record<string, unknown>> = [];

	for (let index = 0; index < count; index += 1) {
		const row: Record<string, unknown> = {};

		for (const column of columns) {
			if (shouldSkipColumn(column)) {
				continue;
			}

			row[column.name] = getColumnSeedValue(
				column,
				foreignKeyValuePools,
				enumValuePools,
			);
		}

		generatedRows.push(row);
	}

	return generatedRows;
};

export const seedTableRows = async (
	// biome-ignore lint/suspicious/noExplicitAny: Kysely generic for runtime introspection
	db: Kysely<any>,
	driver: DbCredentials["driver"],
	tableName: string,
	count: number,
): Promise<number> => {
	const { columns } = await getSeedableTable(db, tableName);
	const foreignKeyValuePools = await buildForeignKeyValuePools(
		db,
		driver,
		tableName,
	);
	const enumValuePools = await getEnumValuesForTable(
		db,
		driver,
		tableName,
		columns,
	);
	const generatedRows = generateSeedRows(
		columns,
		count,
		foreignKeyValuePools,
		enumValuePools,
	);

	if (generatedRows.length > 0) {
		await db
			.insertInto(tableName as never)
			.values(generatedRows as never)
			.execute();
	}

	return generatedRows.length;
};
