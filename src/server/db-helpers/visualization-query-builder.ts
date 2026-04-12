import type { DbDriver } from "#/lib/db/connection";
import {
	isVisualizationAggregation,
	isVisualizationChartType,
	isVisualizationMode,
	isVisualizationTimeGrain,
	VISUALIZATION_LIMITS,
	type VisualizationAggregation,
	type VisualizationChartType,
	type VisualizationMode,
	type VisualizationTimeGrain,
} from "#/lib/visualization";
import { quoteIdentifier } from "./sql-utils";

export type VisualizationColumnSchema = {
	name: string;
	dataType: string;
	kind: "numeric" | "temporal" | "boolean" | "categorical" | "unknown";
};

export type VisualizationTableSchema = {
	tableName: string;
	columns: VisualizationColumnSchema[];
};

export type VisualizationQueryConfigInput = {
	tableName: string;
	chartType: VisualizationChartType;
	mode: VisualizationMode;
	aggregation: VisualizationAggregation;
	metricColumn?: string | null;
	dimensionColumn?: string | null;
	timeColumn?: string | null;
	timeGrain?: VisualizationTimeGrain | null;
	limit?: number | null;
};

export type VisualizationQueryConfigResolved = {
	tableName: string;
	chartType: VisualizationChartType;
	mode: VisualizationMode;
	aggregation: VisualizationAggregation;
	metricColumn: string | null;
	dimensionColumn: string | null;
	timeColumn: string | null;
	timeGrain: VisualizationTimeGrain | null;
	limit: number;
};

export type VisualizationPoint = {
	x: string;
	y: number;
};

type SqlBuildInput = {
	driver: DbDriver;
	config: VisualizationQueryConfigResolved;
};

const normalizePointLimit = (value: number | null | undefined): number => {
	if (
		typeof value !== "number" ||
		Number.isNaN(value) ||
		!Number.isFinite(value)
	) {
		return VISUALIZATION_LIMITS.defaultPointLimit;
	}

	const normalized = Math.trunc(value);

	if (normalized < 1) {
		return 1;
	}

	return Math.min(normalized, VISUALIZATION_LIMITS.maxPointLimit);
};

const getColumnByName = (
	table: VisualizationTableSchema,
	columnName: string | null,
): VisualizationColumnSchema | null => {
	if (!columnName) {
		return null;
	}

	return table.columns.find((column) => column.name === columnName) ?? null;
};

const getMetricExpression = (
	driver: DbDriver,
	aggregation: VisualizationAggregation,
	metricColumn: string | null,
): string => {
	if (aggregation === "count") {
		if (!metricColumn) {
			return "COUNT(*)";
		}
		return `COUNT(${quoteIdentifier(metricColumn, driver)})`;
	}

	if (!metricColumn) {
		throw new Error(`Aggregation "${aggregation}" requires a metric column.`);
	}

	const quotedMetric = quoteIdentifier(metricColumn, driver);

	switch (aggregation) {
		case "sum":
			return `SUM(${quotedMetric})`;
		case "avg":
			return `AVG(${quotedMetric})`;
		case "min":
			return `MIN(${quotedMetric})`;
		case "max":
			return `MAX(${quotedMetric})`;
		default:
			throw new Error(`Unsupported aggregation: ${aggregation}`);
	}
};

const getTimeBucketExpression = (
	driver: DbDriver,
	columnName: string,
	timeGrain: VisualizationTimeGrain,
): string => {
	const quotedColumn = quoteIdentifier(columnName, driver);

	if (driver === "postgres") {
		return `DATE_TRUNC('${timeGrain}', ${quotedColumn})`;
	}

	if (driver === "mysql") {
		if (timeGrain === "hour") {
			return `DATE_FORMAT(${quotedColumn}, '%Y-%m-%d %H:00:00')`;
		}
		if (timeGrain === "day") {
			return `DATE(${quotedColumn})`;
		}
		return `DATE_FORMAT(${quotedColumn}, '%Y-%m-01')`;
	}

	if (timeGrain === "hour") {
		return `strftime('%Y-%m-%d %H:00:00', ${quotedColumn})`;
	}
	if (timeGrain === "day") {
		return `date(${quotedColumn})`;
	}
	return `strftime('%Y-%m-01', ${quotedColumn})`;
};

export const resolveVisualizationQueryConfig = (
	query: VisualizationQueryConfigInput,
	table: VisualizationTableSchema,
): VisualizationQueryConfigResolved => {
	if (typeof query.tableName !== "string" || query.tableName.trim() === "") {
		throw new Error("tableName is required.");
	}

	if (query.tableName !== table.tableName) {
		throw new Error("Invalid tableName for visualization query.");
	}

	if (!isVisualizationChartType(query.chartType)) {
		throw new Error("Unsupported chartType.");
	}

	if (!isVisualizationMode(query.mode)) {
		throw new Error("Unsupported visualization mode.");
	}

	if (!isVisualizationAggregation(query.aggregation)) {
		throw new Error("Unsupported aggregation.");
	}

	const metricColumnName =
		typeof query.metricColumn === "string" && query.metricColumn.trim() !== ""
			? query.metricColumn
			: null;
	const metricColumn = getColumnByName(table, metricColumnName);

	if (
		query.aggregation !== "count" &&
		(!metricColumn || metricColumn.kind !== "numeric")
	) {
		throw new Error(
			`Aggregation "${query.aggregation}" requires a numeric metric column.`,
		);
	}

	if (metricColumnName && !metricColumn) {
		throw new Error(`Unknown metric column: ${metricColumnName}`);
	}

	if (query.mode === "dimension") {
		const dimensionColumnName =
			typeof query.dimensionColumn === "string" &&
			query.dimensionColumn.trim() !== ""
				? query.dimensionColumn
				: null;
		const dimensionColumn = getColumnByName(table, dimensionColumnName);

		if (!dimensionColumnName || !dimensionColumn) {
			throw new Error(
				"A valid dimension column is required in dimension mode.",
			);
		}

		return {
			tableName: query.tableName,
			chartType: query.chartType,
			mode: "dimension",
			aggregation: query.aggregation,
			metricColumn: metricColumnName,
			dimensionColumn: dimensionColumnName,
			timeColumn: null,
			timeGrain: null,
			limit: normalizePointLimit(query.limit),
		};
	}

	const timeColumnName =
		typeof query.timeColumn === "string" && query.timeColumn.trim() !== ""
			? query.timeColumn
			: null;
	const timeColumn = getColumnByName(table, timeColumnName);

	if (!timeColumnName || !timeColumn) {
		throw new Error("A valid time column is required in time mode.");
	}

	if (timeColumn.kind !== "temporal") {
		throw new Error("timeColumn must be a temporal column.");
	}

	const resolvedTimeGrain = isVisualizationTimeGrain(query.timeGrain)
		? query.timeGrain
		: "day";

	return {
		tableName: query.tableName,
		chartType: query.chartType,
		mode: "time",
		aggregation: query.aggregation,
		metricColumn: metricColumnName,
		dimensionColumn: null,
		timeColumn: timeColumnName,
		timeGrain: resolvedTimeGrain,
		limit: normalizePointLimit(query.limit),
	};
};

export const buildVisualizationQuerySql = ({
	driver,
	config,
}: SqlBuildInput): string => {
	const quotedTable = quoteIdentifier(config.tableName, driver);
	const metricExpression = getMetricExpression(
		driver,
		config.aggregation,
		config.metricColumn,
	);

	if (config.mode === "dimension") {
		if (!config.dimensionColumn) {
			throw new Error("Dimension mode requires dimensionColumn.");
		}

		const bucketExpression = quoteIdentifier(config.dimensionColumn, driver);
		const queryLimit = config.limit + 1;

		return `
			SELECT
				${bucketExpression} AS bucket,
				${metricExpression} AS value
			FROM ${quotedTable}
			GROUP BY 1
			ORDER BY value DESC, bucket ASC
			LIMIT ${queryLimit}
		`;
	}

	if (!config.timeColumn || !config.timeGrain) {
		throw new Error("Time mode requires both timeColumn and timeGrain.");
	}

	const bucketExpression = getTimeBucketExpression(
		driver,
		config.timeColumn,
		config.timeGrain,
	);
	const queryLimit = config.limit + 1;

	return `
		SELECT
			${bucketExpression} AS bucket,
			${metricExpression} AS value
		FROM ${quotedTable}
		GROUP BY 1
		ORDER BY bucket ASC
		LIMIT ${queryLimit}
	`;
};

const normalizeMetricValue = (value: unknown): number | null => {
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : null;
	}

	if (typeof value === "bigint") {
		const casted = Number(value);
		return Number.isFinite(casted) ? casted : null;
	}

	if (typeof value === "string") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}

	return null;
};

export const mapRowsToVisualizationPoints = (
	rows: Array<Record<string, unknown>>,
	limit: number,
): {
	points: VisualizationPoint[];
	truncated: boolean;
} => {
	const points: VisualizationPoint[] = [];
	let truncated = false;

	for (const row of rows) {
		if (points.length >= limit) {
			truncated = true;
			break;
		}

		const metricValue = normalizeMetricValue(row.value);

		if (metricValue === null) {
			continue;
		}

		const rawBucket = row.bucket;
		const normalizedBucket =
			rawBucket === null || rawBucket === undefined
				? "(null)"
				: String(rawBucket);
		const bucket =
			normalizedBucket.length > VISUALIZATION_LIMITS.maxLabelLength
				? `${normalizedBucket.slice(0, VISUALIZATION_LIMITS.maxLabelLength - 3)}...`
				: normalizedBucket;

		points.push({
			x: bucket,
			y: metricValue,
		});
	}

	if (rows.length > limit) {
		truncated = true;
	}

	return {
		points,
		truncated,
	};
};
