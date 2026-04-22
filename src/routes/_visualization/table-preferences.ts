export type VisualizationTableDensity = "compact" | "comfortable";

type VisualizationStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type VisualizationTablePreferences = {
	density: VisualizationTableDensity;
	isControlsCollapsed: boolean;
	isFocusMode: boolean;
	columnSizing: Record<string, number>;
	columnVisibility: Record<string, boolean>;
	columnPinning: {
		left: string[];
		right: string[];
	};
};

const DEFAULT_PREFERENCES: VisualizationTablePreferences = {
	density: "comfortable",
	isControlsCollapsed: false,
	isFocusMode: false,
	columnSizing: {},
	columnVisibility: {},
	columnPinning: {
		left: [],
		right: [],
	},
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const sanitizeBooleanRecord = (
	value: unknown,
	allowedColumns: Set<string>,
): Record<string, boolean> => {
	if (!isObjectRecord(value)) {
		return {};
	}

	const next: Record<string, boolean> = {};

	for (const [key, item] of Object.entries(value)) {
		if (!allowedColumns.has(key) || typeof item !== "boolean") {
			continue;
		}

		next[key] = item;
	}

	return next;
};

const sanitizeNumberRecord = (
	value: unknown,
	allowedColumns: Set<string>,
): Record<string, number> => {
	if (!isObjectRecord(value)) {
		return {};
	}

	const next: Record<string, number> = {};

	for (const [key, item] of Object.entries(value)) {
		if (
			!allowedColumns.has(key) ||
			typeof item !== "number" ||
			!Number.isFinite(item)
		) {
			continue;
		}

		next[key] = item;
	}

	return next;
};

const sanitizeColumnArray = (
	value: unknown,
	allowedColumns: Set<string>,
): string[] => {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.filter(
		(column): column is string =>
			typeof column === "string" && allowedColumns.has(column),
	);
};

const sanitizePreferences = ({
	raw,
	columnNames,
}: {
	raw: unknown;
	columnNames: string[];
}): VisualizationTablePreferences => {
	if (!isObjectRecord(raw)) {
		return DEFAULT_PREFERENCES;
	}

	const allowedColumns = new Set(columnNames);
	const density =
		raw.density === "compact" || raw.density === "comfortable"
			? raw.density
			: "comfortable";
	const isControlsCollapsed = raw.isControlsCollapsed === true;
	const isFocusMode = raw.isFocusMode === true;
	const columnSizing = sanitizeNumberRecord(raw.columnSizing, allowedColumns);
	const columnVisibility = sanitizeBooleanRecord(
		raw.columnVisibility,
		allowedColumns,
	);
	const rawPinning = isObjectRecord(raw.columnPinning) ? raw.columnPinning : {};
	const left = sanitizeColumnArray(rawPinning.left, allowedColumns);
	const right = sanitizeColumnArray(rawPinning.right, allowedColumns);
	const rightWithoutLeft = right.filter((column) => !left.includes(column));

	return {
		density,
		isControlsCollapsed,
		isFocusMode,
		columnSizing,
		columnVisibility,
		columnPinning: {
			left,
			right: rightWithoutLeft,
		},
	};
};

export const createVisualizationPreferencesStorageKey = ({
	connectionId,
	tableName,
}: {
	connectionId: string;
	tableName: string;
}): string => `omnidump:visualization:table:${connectionId}:${tableName}`;

export const loadVisualizationTablePreferences = ({
	storage,
	key,
	columnNames,
}: {
	storage: VisualizationStorage;
	key: string;
	columnNames: string[];
}): VisualizationTablePreferences => {
	const stored = storage.getItem(key);
	if (!stored) {
		return DEFAULT_PREFERENCES;
	}

	try {
		const parsed: unknown = JSON.parse(stored);
		return sanitizePreferences({ raw: parsed, columnNames });
	} catch {
		return DEFAULT_PREFERENCES;
	}
};

export const saveVisualizationTablePreferences = ({
	storage,
	key,
	preferences,
}: {
	storage: VisualizationStorage;
	key: string;
	preferences: VisualizationTablePreferences;
}): void => {
	storage.setItem(key, JSON.stringify(preferences));
};
