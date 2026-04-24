import { describe, expect, it } from "vitest";

import {
	buildDefaultColumnSizing,
	clampVisualizationColumnWidth,
	getPreferredColumnWidth,
} from "../src/routes/_visualization/column-layout";

describe("visualization column layout helpers", () => {
	it("clamps column widths to safe bounds", () => {
		expect(clampVisualizationColumnWidth(20)).toBe(80);
		expect(clampVisualizationColumnWidth(140)).toBe(140);
		expect(clampVisualizationColumnWidth(2000)).toBe(560);
	});

	it("prefers narrower widths for numeric and boolean columns", () => {
		expect(
			getPreferredColumnWidth({
				name: "amount",
				dataType: "numeric",
				kind: "numeric",
			}),
		).toBe(120);
		expect(
			getPreferredColumnWidth({
				name: "is_active",
				dataType: "boolean",
				kind: "boolean",
			}),
		).toBe(110);
	});

	it("prefers wider widths for long text payload columns", () => {
		expect(
			getPreferredColumnWidth({
				name: "payload_json",
				dataType: "jsonb",
				kind: "categorical",
			}),
		).toBe(300);
		expect(
			getPreferredColumnWidth({
				name: "description",
				dataType: "text",
				kind: "categorical",
			}),
		).toBe(300);
	});

	it("builds deterministic sizing entries by column name", () => {
		const sizing = buildDefaultColumnSizing([
			{ name: "id", dataType: "bigint", kind: "numeric" },
			{ name: "email", dataType: "varchar", kind: "categorical" },
		]);

		expect(sizing).toEqual({
			id: 120,
			email: 220,
		});
	});
});
