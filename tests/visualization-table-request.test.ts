import { describe, expect, it } from "vitest";

import { normalizeVisualizationTableDataRequest } from "../src/server/visualization-fns";

const tableSchema = {
	tableName: "users",
	columns: [
		{ name: "id", dataType: "integer", kind: "numeric" as const },
		{ name: "email", dataType: "varchar", kind: "categorical" as const },
		{ name: "is_active", dataType: "boolean", kind: "boolean" as const },
	],
};

describe("normalizeVisualizationTableDataRequest", () => {
	it("normalizes defaults and clamps page size", () => {
		const result = normalizeVisualizationTableDataRequest(
			{
				tableName: "users",
				pageIndex: -4,
				pageSize: 9999,
			},
			tableSchema,
		);

		expect(result.pageIndex).toBe(0);
		expect(result.pageSize).toBe(200);
		expect(result.sorting).toEqual([]);
		expect(result.filters).toEqual([]);
	});

	it("drops unknown sort/filter columns", () => {
		const result = normalizeVisualizationTableDataRequest(
			{
				tableName: "users",
				sorting: [
					{ id: "email", desc: false },
					{ id: "unknown_col", desc: true },
				],
				filters: [
					{ id: "email", value: "admin@" },
					{ id: "unknown_col", value: "x" },
				],
			},
			tableSchema,
		);

		expect(result.sorting).toEqual([{ id: "email", desc: false }]);
		expect(result.filters).toEqual([{ id: "email", value: "admin@" }]);
	});

	it("throws when tableName does not match schema", () => {
		expect(() =>
			normalizeVisualizationTableDataRequest(
				{
					tableName: "orders",
				},
				tableSchema,
			),
		).toThrow("Invalid tableName for data visualization request.");
	});
});
