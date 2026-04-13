import { type Kysely, sql } from "kysely";
import type { DbDriver } from "#/lib/db/connection";
import type { VisualizationTableSchema } from "./visualization-query-builder";
import type { VisualizationTableDataRequestResolved } from "./visualization-table-request";

const parseBooleanFilterValue = (value: string): boolean | null => {
	const normalizedValue = value.toLowerCase();

	if (
		normalizedValue === "true" ||
		normalizedValue === "1" ||
		normalizedValue === "yes"
	) {
		return true;
	}

	if (
		normalizedValue === "false" ||
		normalizedValue === "0" ||
		normalizedValue === "no"
	) {
		return false;
	}

	return null;
};

const buildTextFilterExpression = (
	driver: DbDriver,
	columnRef: ReturnType<Kysely<unknown>["dynamic"]["ref"]>,
	value: string,
) => {
	const likeValue = `%${value.toLowerCase()}%`;

	if (driver === "mysql") {
		return sql<boolean>`LOWER(CAST(${columnRef} AS CHAR)) LIKE ${likeValue}`;
	}

	return sql<boolean>`LOWER(CAST(${columnRef} AS TEXT)) LIKE ${likeValue}`;
};

type BuildVisualizationTableDataQueriesInput = {
	db: Kysely<unknown>;
	driver: DbDriver;
	request: VisualizationTableDataRequestResolved;
	tableSchema: VisualizationTableSchema;
};

export const buildVisualizationTableDataQueries = ({
	db,
	driver,
	request,
	tableSchema,
}: BuildVisualizationTableDataQueriesInput) => {
	const columnByName = new Map(
		tableSchema.columns.map((column) => [column.name, column]),
	);
	let dataQuery = db.selectFrom(request.tableName as never).selectAll();
	let countQuery = db
		.selectFrom(request.tableName as never)
		.select(sql<number>`COUNT(*)`.as("total"));

	for (const filter of request.filters) {
		const column = columnByName.get(filter.id);

		if (!column) {
			continue;
		}

		const columnRef = db.dynamic.ref(column.name);

		if (column.kind === "numeric") {
			const parsedNumeric = Number(filter.value);

			if (!Number.isFinite(parsedNumeric)) {
				throw new Error(`Filter value for ${column.name} must be numeric.`);
			}

			dataQuery = dataQuery.where(
				columnRef as never,
				"=",
				parsedNumeric as never,
			);
			countQuery = countQuery.where(
				columnRef as never,
				"=",
				parsedNumeric as never,
			);
			continue;
		}

		if (column.kind === "boolean") {
			const parsedBoolean = parseBooleanFilterValue(filter.value);

			if (parsedBoolean === null) {
				throw new Error(`Filter value for ${column.name} must be a boolean.`);
			}

			dataQuery = dataQuery.where(
				columnRef as never,
				"=",
				parsedBoolean as never,
			);
			countQuery = countQuery.where(
				columnRef as never,
				"=",
				parsedBoolean as never,
			);
			continue;
		}

		const textExpression = buildTextFilterExpression(
			driver,
			columnRef,
			filter.value,
		);
		dataQuery = dataQuery.where(textExpression);
		countQuery = countQuery.where(textExpression);
	}

	if (request.sorting.length > 0) {
		for (const sort of request.sorting) {
			dataQuery = dataQuery.orderBy(
				db.dynamic.ref(sort.id) as never,
				sort.desc ? "desc" : "asc",
			);
		}
	} else {
		const fallbackColumn = tableSchema.columns[0]?.name;
		if (fallbackColumn) {
			dataQuery = dataQuery.orderBy(
				db.dynamic.ref(fallbackColumn) as never,
				"asc",
			);
		}
	}

	return {
		dataQuery: dataQuery
			.limit(request.pageSize)
			.offset(request.pageIndex * request.pageSize),
		countQuery,
	};
};
