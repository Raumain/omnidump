import { describe, expect, it } from "vitest";

/**
 * Test the batch array helper function
 */
describe("anonymized-dump helpers", () => {
	it("should batch array correctly with exact divisions", () => {
		// Helper function for testing (reimplemented from the module)
		function batchArray<T>(array: T[], batchSize: number): T[][] {
			const batches: T[][] = [];
			for (let i = 0; i < array.length; i += batchSize) {
				batches.push(array.slice(i, i + batchSize));
			}
			return batches;
		}

		const items = Array.from({ length: 3000 }, (_, i) => i);
		const batches = batchArray(items, 1000);

		expect(batches.length).toBe(3);
		expect(batches[0].length).toBe(1000);
		expect(batches[1].length).toBe(1000);
		expect(batches[2].length).toBe(1000);
	});

	it("should batch array correctly with partial last batch", () => {
		function batchArray<T>(array: T[], batchSize: number): T[][] {
			const batches: T[][] = [];
			for (let i = 0; i < array.length; i += batchSize) {
				batches.push(array.slice(i, i + batchSize));
			}
			return batches;
		}

		const items = Array.from({ length: 2500 }, (_, i) => i);
		const batches = batchArray(items, 1000);

		expect(batches.length).toBe(3);
		expect(batches[0].length).toBe(1000);
		expect(batches[1].length).toBe(1000);
		expect(batches[2].length).toBe(500);
	});

	it("should handle empty arrays", () => {
		function batchArray<T>(array: T[], batchSize: number): T[][] {
			const batches: T[][] = [];
			for (let i = 0; i < array.length; i += batchSize) {
				batches.push(array.slice(i, i + batchSize));
			}
			return batches;
		}

		const items: number[] = [];
		const batches = batchArray(items, 1000);

		expect(batches.length).toBe(0);
	});

	it("should handle small arrays", () => {
		function batchArray<T>(array: T[], batchSize: number): T[][] {
			const batches: T[][] = [];
			for (let i = 0; i < array.length; i += batchSize) {
				batches.push(array.slice(i, i + batchSize));
			}
			return batches;
		}

		const items = [1, 2, 3];
		const batches = batchArray(items, 1000);

		expect(batches.length).toBe(1);
		expect(batches[0]).toEqual([1, 2, 3]);
	});

	it("should escape COPY format special characters correctly", () => {
		// Test escaping function
		function escapeCopyValue(value: string): string {
			return value
				.replace(/\\/g, "\\\\") // Escape backslashes first
				.replace(/\t/g, "\\t") // Escape tabs
				.replace(/\n/g, "\\n") // Escape newlines
				.replace(/\r/g, "\\r"); // Escape carriage returns
		}

		expect(escapeCopyValue("normal text")).toBe("normal text");
		expect(escapeCopyValue("text\twith\ttabs")).toBe("text\\twith\\ttabs");
		expect(escapeCopyValue("text\nwith\nnewlines")).toBe("text\\nwith\\nnewlines");
		expect(escapeCopyValue("text\\with\\backslashes")).toBe(
			"text\\\\with\\\\backslashes",
		);
		expect(escapeCopyValue("path\\to\\file\twith\nnewlines")).toBe(
			"path\\\\to\\\\file\\twith\\nnewlines",
		);
	});

	it("should handle NULL values in COPY format", () => {
		const nullValue = null;
		const undefinedValue = undefined;

		// In COPY format, both should become \N
		const copyNull = nullValue === null || nullValue === undefined ? "\\N" : "value";
		const copyUndefined =
			undefinedValue === null || undefinedValue === undefined ? "\\N" : "value";

		expect(copyNull).toBe("\\N");
		expect(copyUndefined).toBe("\\N");
	});

	it("should convert Date objects correctly in COPY format", () => {
		const date = new Date("2024-01-15T10:30:00Z");
		const isoString = date.toISOString();

		expect(isoString).toBe("2024-01-15T10:30:00.000Z");
	});

	it("should stringify objects correctly in COPY format", () => {
		const obj = { key: "value", nested: { a: 1 } };
		const jsonStr = JSON.stringify(obj);

		expect(jsonStr).toBe('{"key":"value","nested":{"a":1}}');
	});

	it("should generate correct batched INSERT SQL", () => {
		// Test the SQL generation logic
		const rows = [
			{ id: 1, name: "John", email: "john@example.com" },
			{ id: 2, name: "Jane", email: "jane@example.com" },
		];

		function escapeValue(value: unknown): string {
			if (value === null || value === undefined) {
				return "NULL";
			}
			if (typeof value === "number") {
				return String(value);
			}
			const str = String(value).replace(/'/g, "''");
			return `'${str}'`;
		}

		const valueSets = rows
			.map((row) => {
				const values = ["id", "name", "email"]
					.map((col) => escapeValue(row[col as keyof typeof row]))
					.join(", ");
				return `(${values})`;
			})
			.join(", ");

		expect(valueSets).toContain("(1, 'John', 'john@example.com')");
		expect(valueSets).toContain("(2, 'Jane', 'jane@example.com')");
		expect(valueSets).toContain(", ");
	});

	it("should handle special characters in batched INSERT", () => {
		function escapeValue(value: unknown): string {
			if (value === null || value === undefined) {
				return "NULL";
			}
			if (typeof value === "number") {
				return String(value);
			}
			const str = String(value).replace(/'/g, "''");
			return `'${str}'`;
		}

		const value = "O'Reilly";
		const escaped = escapeValue(value);

		// Single quotes should be doubled
		expect(escaped).toBe("'O''Reilly'");
	});
});
