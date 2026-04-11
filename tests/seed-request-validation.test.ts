import { describe, expect, it } from "vitest";

import {
	extractSqliteEnumValuesFromCreateStatement,
	getColumnSeedValue,
	parseMysqlEnumColumnType,
	parseSeedRequestBody,
	parseSqlStringLiteralList,
} from "../src/routes/api/seed";

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

	it("uses enum values when no foreign key value pool exists", () => {
		const value = getColumnSeedValue(
			{ name: "status", dataType: "enum" },
			new Map(),
			new Map([["status", ["published"]]]),
		);

		expect(value).toBe("published");
	});

	it("prioritizes foreign key values over enum values", () => {
		const value = getColumnSeedValue(
			{ name: "status_id", dataType: "integer" },
			new Map([["status_id", [99]]]),
			new Map([["status_id", ["draft", "published"]]]),
		);

		expect(value).toBe(99);
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

	it("throws when an enum pool exists but is empty", () => {
		expect(() =>
			getColumnSeedValue(
				{ name: "status", dataType: "enum" },
				new Map(),
				new Map([["status", []]]),
			),
		).toThrow(
			"Cannot seed status: enum value list is empty for enum column.",
		);
	});
});

describe("parseSqlStringLiteralList", () => {
	it("parses simple quoted values", () => {
		expect(parseSqlStringLiteralList("'draft', 'published'")).toEqual([
			"draft",
			"published",
		]);
	});

	it("parses escaped quotes from SQL and backslash forms", () => {
		expect(parseSqlStringLiteralList("'it''s ok', 'beta\\'test'")).toEqual([
			"it's ok",
			"beta'test",
		]);
	});
});

describe("parseMysqlEnumColumnType", () => {
	it("parses mysql enum column metadata", () => {
		expect(parseMysqlEnumColumnType("enum('small','medium','large')")).toEqual([
			"small",
			"medium",
			"large",
		]);
	});

	it("returns empty list for non enum column types", () => {
		expect(parseMysqlEnumColumnType("varchar(255)")).toEqual([]);
	});
});

describe("extractSqliteEnumValuesFromCreateStatement", () => {
	it("extracts enum-like values from sqlite CHECK constraints", () => {
		const enumValuesByColumn = extractSqliteEnumValuesFromCreateStatement(`
			CREATE TABLE users (
				status TEXT CHECK(status IN ('draft', 'published')),
				kind TEXT CHECK("kind" IN ('admin', 'member'))
			)
		`);

		expect(enumValuesByColumn.get("status")).toEqual(["draft", "published"]);
		expect(enumValuesByColumn.get("kind")).toEqual(["admin", "member"]);
	});

	it("ignores CHECK constraints that are not enum-like string lists", () => {
		const enumValuesByColumn = extractSqliteEnumValuesFromCreateStatement(`
			CREATE TABLE users (
				age INTEGER CHECK(age > 0)
			)
		`);

		expect(enumValuesByColumn.size).toBe(0);
	});
});
