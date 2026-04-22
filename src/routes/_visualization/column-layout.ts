import type { VisualizationColumnKind } from "#/lib/visualization";

const MIN_COLUMN_WIDTH = 80;
const MAX_COLUMN_WIDTH = 560;

const SHORT_NAME_HINTS = ["id", "uuid", "code", "count", "total", "amount"];
const LARGE_VALUE_HINTS = [
	"description",
	"content",
	"message",
	"payload",
	"json",
	"metadata",
];

export type VisualizationColumnLayoutInput = {
	name: string;
	dataType: string;
	kind: VisualizationColumnKind;
};

export const clampVisualizationColumnWidth = (value: number): number => {
	if (!Number.isFinite(value)) {
		return MIN_COLUMN_WIDTH;
	}

	return Math.min(
		MAX_COLUMN_WIDTH,
		Math.max(MIN_COLUMN_WIDTH, Math.round(value)),
	);
};

export const getPreferredColumnWidth = (
	column: VisualizationColumnLayoutInput,
): number => {
	const normalizedName = column.name.toLowerCase();
	const normalizedType = column.dataType.toLowerCase();

	if (
		LARGE_VALUE_HINTS.some((hint) => normalizedName.includes(hint)) ||
		normalizedType.includes("json") ||
		normalizedType.includes("text")
	) {
		return 300;
	}

	if (column.kind === "numeric") {
		return 120;
	}

	if (column.kind === "boolean") {
		return 110;
	}

	if (column.kind === "temporal") {
		return 180;
	}

	if (SHORT_NAME_HINTS.some((hint) => normalizedName === hint)) {
		return 120;
	}

	return 220;
};

export const buildDefaultColumnSizing = (
	columns: VisualizationColumnLayoutInput[],
): Record<string, number> => {
	const sizing: Record<string, number> = {};

	for (const column of columns) {
		sizing[column.name] = clampVisualizationColumnWidth(
			getPreferredColumnWidth(column),
		);
	}

	return sizing;
};
