import {
	classifyVisualizationColumnKind,
	VISUALIZATION_LIMITS,
} from "#/lib/visualization";
import type {
	VisualizationColumnSchema,
	VisualizationTableSchema,
} from "./visualization-query-builder";

export type TableSortInput = {
	id: string;
	desc: boolean;
};

export type TableFilterInput = {
	id: string;
	value: string;
};

export type VisualizationTableDataRequestInput = {
	tableName: string;
	pageIndex?: number | null;
	pageSize?: number | null;
	sorting?: TableSortInput[] | null;
	filters?: TableFilterInput[] | null;
};

export type VisualizationTableDataRequestResolved = {
	tableName: string;
	pageIndex: number;
	pageSize: number;
	sorting: TableSortInput[];
	filters: TableFilterInput[];
};

export const toVisualizationTableSchema = (table: {
	name: string;
	columns: Array<{ name: string; dataType: string }>;
}): VisualizationTableSchema => ({
	tableName: table.name,
	columns: table.columns.map(
		(column): VisualizationColumnSchema => ({
			name: column.name,
			dataType: column.dataType,
			kind: classifyVisualizationColumnKind(column.dataType),
		}),
	),
});

const normalizePageIndex = (value: number | null | undefined): number => {
	if (
		typeof value !== "number" ||
		Number.isNaN(value) ||
		!Number.isFinite(value)
	) {
		return 0;
	}

	return Math.max(0, Math.trunc(value));
};

const normalizePageSize = (value: number | null | undefined): number => {
	if (
		typeof value !== "number" ||
		Number.isNaN(value) ||
		!Number.isFinite(value)
	) {
		return VISUALIZATION_LIMITS.defaultTablePageSize;
	}

	const normalized = Math.trunc(value);

	if (normalized < 1) {
		return 1;
	}

	return Math.min(normalized, VISUALIZATION_LIMITS.maxTablePageSize);
};

export const normalizeVisualizationTableDataRequest = (
	request: VisualizationTableDataRequestInput,
	tableSchema: VisualizationTableSchema,
): VisualizationTableDataRequestResolved => {
	if (
		typeof request.tableName !== "string" ||
		request.tableName.trim() === ""
	) {
		throw new Error("tableName is required.");
	}

	if (request.tableName !== tableSchema.tableName) {
		throw new Error("Invalid tableName for data visualization request.");
	}

	const columnNames = new Set(tableSchema.columns.map((column) => column.name));
	const pageIndex = normalizePageIndex(request.pageIndex);
	const pageSize = normalizePageSize(request.pageSize);
	const rawSorting = Array.isArray(request.sorting) ? request.sorting : [];
	const rawFilters = Array.isArray(request.filters) ? request.filters : [];
	const sorting = rawSorting
		.slice(0, VISUALIZATION_LIMITS.maxSortColumns)
		.filter(
			(sort): sort is TableSortInput =>
				typeof sort?.id === "string" &&
				columnNames.has(sort.id) &&
				typeof sort.desc === "boolean",
		);
	const filters = rawFilters
		.slice(0, VISUALIZATION_LIMITS.maxFilterColumns)
		.map((filter) => ({
			id: filter?.id,
			value: typeof filter?.value === "string" ? filter.value.trim() : "",
		}))
		.filter(
			(filter): filter is TableFilterInput =>
				typeof filter.id === "string" &&
				columnNames.has(filter.id) &&
				filter.value.length > 0,
		);

	return {
		tableName: request.tableName,
		pageIndex,
		pageSize,
		sorting,
		filters,
	};
};
