export const VISUALIZATION_CHART_TYPES = ["bar", "line"] as const;
export type VisualizationChartType = (typeof VISUALIZATION_CHART_TYPES)[number];

export const VISUALIZATION_MODES = ["dimension", "time"] as const;
export type VisualizationMode = (typeof VISUALIZATION_MODES)[number];

export const VISUALIZATION_AGGREGATIONS = [
	"count",
	"sum",
	"avg",
	"min",
	"max",
] as const;
export type VisualizationAggregation =
	(typeof VISUALIZATION_AGGREGATIONS)[number];

export const VISUALIZATION_TIME_GRAINS = ["hour", "day", "month"] as const;
export type VisualizationTimeGrain = (typeof VISUALIZATION_TIME_GRAINS)[number];

export const VISUALIZATION_COLUMN_KINDS = [
	"numeric",
	"temporal",
	"boolean",
	"categorical",
	"unknown",
] as const;
export type VisualizationColumnKind =
	(typeof VISUALIZATION_COLUMN_KINDS)[number];

export const VISUALIZATION_LIMITS = {
	defaultPointLimit: 120,
	maxPointLimit: 500,
	maxLabelLength: 80,
	queryTimeoutMs: 15000,
	maxTablesForRowEstimate: 10,
	defaultTablePageSize: 25,
	maxTablePageSize: 200,
	maxSortColumns: 3,
	maxFilterColumns: 8,
} as const;

export const isVisualizationChartType = (
	value: unknown,
): value is VisualizationChartType =>
	typeof value === "string" &&
	(VISUALIZATION_CHART_TYPES as readonly string[]).includes(value);

export const isVisualizationMode = (
	value: unknown,
): value is VisualizationMode =>
	typeof value === "string" &&
	(VISUALIZATION_MODES as readonly string[]).includes(value);

export const isVisualizationAggregation = (
	value: unknown,
): value is VisualizationAggregation =>
	typeof value === "string" &&
	(VISUALIZATION_AGGREGATIONS as readonly string[]).includes(value);

export const isVisualizationTimeGrain = (
	value: unknown,
): value is VisualizationTimeGrain =>
	typeof value === "string" &&
	(VISUALIZATION_TIME_GRAINS as readonly string[]).includes(value);

export const isNumericColumnType = (dataType: string): boolean => {
	const normalized = dataType.toLowerCase();

	return (
		normalized.includes("int") ||
		normalized.includes("numeric") ||
		normalized.includes("decimal") ||
		normalized.includes("real") ||
		normalized.includes("double") ||
		normalized.includes("float") ||
		normalized.includes("serial")
	);
};

export const isTemporalColumnType = (dataType: string): boolean => {
	const normalized = dataType.toLowerCase();

	return (
		normalized.includes("date") ||
		normalized.includes("time") ||
		normalized.includes("timestamp") ||
		normalized.includes("datetime")
	);
};

export const isBooleanColumnType = (dataType: string): boolean => {
	const normalized = dataType.toLowerCase();

	return (
		normalized.includes("bool") ||
		normalized === "tinyint(1)" ||
		normalized === "bit"
	);
};

export const classifyVisualizationColumnKind = (
	dataType: string,
): VisualizationColumnKind => {
	if (isNumericColumnType(dataType)) {
		return "numeric";
	}

	if (isTemporalColumnType(dataType)) {
		return "temporal";
	}

	if (isBooleanColumnType(dataType)) {
		return "boolean";
	}

	if (dataType.trim().length > 0) {
		return "categorical";
	}

	return "unknown";
};
