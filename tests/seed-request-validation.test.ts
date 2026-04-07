import { describe, expect, it } from "vitest";

import { getColumnSeedValue, parseSeedRequestBody } from "../src/routes/api/seed";

describe("parseSeedRequestBody", () => {
	it("parses a valid body and uses default count", () => {
		expect(
			parseSeedRequestBody({
				connectionId: 42,
				tableName: "users",
			}),
		).toEqual({
			connectionId: 42,
			tableName: "users",
			count: 10,
		});
	});

	it("caps count to max seed count", () => {
		expect(
			parseSeedRequestBody({
				connectionId: 42,
				tableName: "users",
				count: 99999,
			}),
		).toEqual({
			connectionId: 42,
			tableName: "users",
			count: 1000,
		});
	});

	it("throws for invalid connectionId", () => {
		expect(() =>
			parseSeedRequestBody({
				connectionId: null,
				tableName: "users",
			}),
		).toThrow("Invalid connectionId in body.");
	});

	it("throws for invalid tableName", () => {
		expect(() =>
			parseSeedRequestBody({
				connectionId: 42,
				tableName: " ",
			}),
		).toThrow("Invalid tableName in body.");
	});

	it("throws for invalid count", () => {
		expect(() =>
			parseSeedRequestBody({
				connectionId: 42,
				tableName: "users",
				count: 0,
			}),
		).toThrow("Invalid count in body. Must be an integer greater than 0.");
	});
});

describe("getColumnSeedValue", () => {
	it("uses a random existing foreign key value when pool is available", () => {
		const value = getColumnSeedValue(
			{ name: "author_id", dataType: "integer" },
			new Map([["author_id", [101]]]),
		);

		expect(value).toBe(101);
	});

	it("throws when a foreign key pool exists but is empty", () => {
		expect(() =>
			getColumnSeedValue(
				{ name: "author_id", dataType: "integer" },
				new Map([["author_id", []]]),
			),
		).toThrow(
			"Cannot seed author_id: referenced key list is empty for foreign key column.",
		);
	});
});
