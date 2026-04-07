import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
	buildCsv,
	buildCsvArchiveFileName,
	buildCsvZip,
	buildUniqueCsvFileName,
	parseCsvExportQuery,
	sanitizeFileNamePart,
} from "../src/server/csv-export";

describe("parseCsvExportQuery", () => {
	it("defaults to table scope when scope is omitted", () => {
		const parsed = parseCsvExportQuery(
			new URL("http://localhost/api/export-csv?connectionId=7&tableName=users"),
		);

		expect(parsed).toEqual({
			connectionId: 7,
			scope: "table",
			tableName: "users",
		});
	});

	it("parses database scope", () => {
		const parsed = parseCsvExportQuery(
			new URL("http://localhost/api/export-csv?connectionId=7&scope=database"),
		);

		expect(parsed).toEqual({
			connectionId: 7,
			scope: "database",
		});
	});

	it("throws on invalid scope", () => {
		expect(() =>
			parseCsvExportQuery(
				new URL("http://localhost/api/export-csv?connectionId=7&scope=all"),
			),
		).toThrow("Invalid scope query parameter. Use table or database.");
	});

	it("throws when table scope has no tableName", () => {
		expect(() =>
			parseCsvExportQuery(
				new URL("http://localhost/api/export-csv?connectionId=7&scope=table"),
			),
		).toThrow("Invalid tableName query parameter.");
	});
});

describe("buildCsv", () => {
	it("builds CSV with escaped values", () => {
		const csv = buildCsv(
			["id", "name", "notes"],
			[
				{ id: 1, name: 'Jane "JJ"', notes: "hello,world" },
				{ id: 2, name: null, notes: "line1\nline2" },
			],
		);

		expect(csv).toBe(
			'"id","name","notes"\n"1","Jane ""JJ""","hello,world"\n"2","","line1\nline2"',
		);
	});

	it("returns header-only CSV for empty table rows", () => {
		const csv = buildCsv(["id", "email"], []);
		expect(csv).toBe('"id","email"');
	});
});

describe("CSV export file naming", () => {
	it("sanitizes file name components", () => {
		expect(sanitizeFileNamePart(" sales/orders ")).toBe("sales_orders");
		expect(sanitizeFileNamePart("...")).toBe("database");
	});

	it("generates unique CSV filenames for duplicate table names", () => {
		const used = new Set<string>();

		expect(buildUniqueCsvFileName("users", used)).toBe("users.csv");
		expect(buildUniqueCsvFileName("users", used)).toBe("users_2.csv");
		expect(buildUniqueCsvFileName("users", used)).toBe("users_3.csv");
	});

	it("builds archive file name", () => {
		expect(buildCsvArchiveFileName("Main DB")).toBe("Main_DB_csv_export.zip");
	});
});

describe("buildCsvZip", () => {
	it("creates a ZIP with all CSV files", () => {
		const zipData = buildCsvZip(
			new Map([
				["users.csv", '"id","name"\n"1","Ada"'],
				["orders.csv", '"id","total"\n"10","99.95"'],
			]),
		);

		const files = unzipSync(zipData);

		expect(Object.keys(files).sort()).toEqual(["orders.csv", "users.csv"]);
		expect(strFromU8(files["users.csv"] ?? new Uint8Array())).toBe(
			'"id","name"\n"1","Ada"',
		);
		expect(strFromU8(files["orders.csv"] ?? new Uint8Array())).toBe(
			'"id","total"\n"10","99.95"',
		);
	});
});
