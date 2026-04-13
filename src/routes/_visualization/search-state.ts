import type { ColumnFiltersState, SortingState } from "@tanstack/react-table";

import { VISUALIZATION_LIMITS } from "#/lib/visualization";

export type VisualizationSearch = {
	t?: string;
	p?: number;
	ps?: number;
	s?: string;
	f?: string;
};

const parseSearchInteger = (
	value: unknown,
	{
		min,
		max,
	}: {
		min: number;
		max: number;
	},
) => {
	const parsed =
		typeof value === "number"
			? value
			: typeof value === "string"
				? Number(value)
				: Number.NaN;

	if (!Number.isFinite(parsed)) {
		return undefined;
	}

	const normalized = Math.trunc(parsed);

	if (normalized < min) {
		return min;
	}

	return Math.min(normalized, max);
};

const parseOptionalSearchString = (value: unknown): string | undefined => {
	if (typeof value !== "string") {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
};

export const validateVisualizationSearch = (
	search: Record<string, unknown>,
): VisualizationSearch => ({
	t: parseOptionalSearchString(search.t),
	p: parseSearchInteger(search.p, {
		min: 0,
		max: Number.MAX_SAFE_INTEGER,
	}),
	ps: parseSearchInteger(search.ps, {
		min: 1,
		max: VISUALIZATION_LIMITS.maxTablePageSize,
	}),
	s: parseOptionalSearchString(search.s),
	f: parseOptionalSearchString(search.f),
});

export const serializeSorting = (sorting: SortingState): string | undefined => {
	if (sorting.length === 0) {
		return undefined;
	}

	return sorting
		.map(
			(sort) => `${encodeURIComponent(sort.id)}.${sort.desc ? "desc" : "asc"}`,
		)
		.join(",");
};

export const parseSortingFromSearch = (
	serialized: string | undefined,
): SortingState => {
	if (!serialized) {
		return [];
	}

	return serialized
		.split(",")
		.map((token) => token.trim())
		.filter((token) => token.length > 0)
		.map((token) => {
			const [rawId, direction] = token.split(".");
			const id = decodeURIComponent(rawId ?? "");

			if (!id) {
				return null;
			}

			return {
				id,
				desc: direction === "desc",
			};
		})
		.filter((entry): entry is { id: string; desc: boolean } => entry !== null);
};

export const serializeFilters = (
	filters: ColumnFiltersState,
): string | undefined => {
	const sanitized = filters
		.map((filter) => ({
			id: filter.id,
			value:
				typeof filter.value === "string"
					? filter.value.trim()
					: String(filter.value ?? "").trim(),
		}))
		.filter((filter) => filter.value.length > 0);

	if (sanitized.length === 0) {
		return undefined;
	}

	return sanitized
		.map(
			(filter) =>
				`${encodeURIComponent(filter.id)}:${encodeURIComponent(filter.value)}`,
		)
		.join(",");
};

export const parseFiltersFromSearch = (
	serialized: string | undefined,
): ColumnFiltersState => {
	if (!serialized) {
		return [];
	}

	return serialized
		.split(",")
		.map((pair) => pair.trim())
		.filter((pair) => pair.length > 0)
		.map((pair) => {
			const separatorIndex = pair.indexOf(":");
			if (separatorIndex === -1) {
				return null;
			}

			const id = decodeURIComponent(pair.slice(0, separatorIndex));
			const value = decodeURIComponent(pair.slice(separatorIndex + 1));

			if (!id || value.trim().length === 0) {
				return null;
			}

			return {
				id,
				value,
			};
		})
		.filter(
			(filter): filter is { id: string; value: string } => filter !== null,
		);
};

export const normalizeFilters = (
	filters: ColumnFiltersState,
): Array<{ id: string; value: string }> =>
	filters
		.map((filter) => ({
			id: filter.id,
			value:
				typeof filter.value === "string"
					? filter.value.trim()
					: String(filter.value ?? "").trim(),
		}))
		.filter((filter) => filter.value.length > 0);
