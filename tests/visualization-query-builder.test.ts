import { describe, expect, it } from "vitest";

import {
	buildVisualizationQuerySql,
	mapRowsToVisualizationPoints,
	resolveVisualizationQueryConfig,
} from "../src/server/db-helpers/visualization-query-builder";

const sampleTable = {
	tableName: "orders",
	columns: [
		{ name: "id", dataType: "integer", kind: "numeric" as const },
		{ name: "total", dataType: "numeric", kind: "numeric" as const },
		{ name: "status", dataType: "varchar", kind: "categorical" as const },
		{ name: "created_at", dataType: "timestamp", kind: "temporal" as const },
	],
};

describe("resolveVisualizationQueryConfig", () => {
	it("normalizes and clamps point limit", () => {
		const resolved = resolveVisualizationQueryConfig(
			{
				tableName: "orders",
				chartType: "bar",
				mode: "dimension",
				aggregation: "count",
				dimensionColumn: "status",
				limit: 99999,
			},
			sampleTable,
		);

		expect(resolved.limit).toBe(500);
	});

	it("throws when non-count aggregation has no numeric metric", () => {
		expect(() =>
			resolveVisualizationQueryConfig(
				{
					tableName: "orders",
					chartType: "bar",
					mode: "dimension",
					aggregation: "sum",
					dimensionColumn: "status",
				},
				sampleTable,
			),
		).toThrow('Aggregation "sum" requires a numeric metric column.');
	});

	it("throws when time mode receives a non-temporal time column", () => {
		expect(() =>
			resolveVisualizationQueryConfig(
				{
					tableName: "orders",
					chartType: "line",
					mode: "time",
					aggregation: "count",
					timeColumn: "status",
					timeGrain: "day",
				},
				sampleTable,
			),
		).toThrow("timeColumn must be a temporal column.");
	});
});

describe("buildVisualizationQuerySql", () => {
	it("builds a deterministic postgres time-series query", () => {
		const resolved = resolveVisualizationQueryConfig(
			{
				tableName: "orders",
				chartType: "line",
				mode: "time",
				aggregation: "sum",
				metricColumn: "total",
				timeColumn: "created_at",
				timeGrain: "day",
				limit: 25,
			},
			sampleTable,
		);

		const query = buildVisualizationQuerySql({
			driver: "postgres",
			config: resolved,
		});

		expect(query).toContain(`DATE_TRUNC('day', "created_at")`);
		expect(query).toContain('SUM("total") AS value');
		expect(query).toContain("GROUP BY 1");
		expect(query).toContain("ORDER BY bucket ASC");
		expect(query).toContain("LIMIT 26");
	});
});

describe("mapRowsToVisualizationPoints", () => {
	it("returns capped points and reports truncation", () => {
		const { points, truncated } = mapRowsToVisualizationPoints(
			[
				{ bucket: "A", value: "10" },
				{ bucket: "B", value: "20" },
				{ bucket: "C", value: "30" },
			],
			2,
		);

		expect(points).toEqual([
			{ x: "A", y: 10 },
			{ x: "B", y: 20 },
		]);
		expect(truncated).toBe(true);
	});

	it("ignores rows with invalid metrics", () => {
		const { points, truncated } = mapRowsToVisualizationPoints(
			[
				{ bucket: "A", value: "oops" },
				{ bucket: "B", value: "42" },
			],
			10,
		);

		expect(points).toEqual([{ x: "B", y: 42 }]);
		expect(truncated).toBe(false);
	});
});
