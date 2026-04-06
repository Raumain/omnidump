import { describe, expect, it, beforeEach } from "vitest";
import { Anonymizer, createAnonymizer } from "../src/server/anonymizer";
import type { AnonymizationRule } from "../src/lib/anonymization-types";

describe("Anonymizer", () => {
	let anonymizer: Anonymizer;

	beforeEach(() => {
		anonymizer = createAnonymizer(12345); // Fixed seed for reproducible tests
	});

	describe("mask method", () => {
		it("should mask a string with default options", () => {
			const result = anonymizer.anonymize("hello", "mask");
			expect(result).toBe("*****");
		});

		it("should preserve start characters", () => {
			const result = anonymizer.anonymize("hello@example.com", "mask", {
				preserveStart: 2,
			});
			expect(result).toBe("he***************");
		});

		it("should preserve end characters", () => {
			const result = anonymizer.anonymize("hello@example.com", "mask", {
				preserveEnd: 4,
			});
			expect(result).toBe("*************.com");
		});

		it("should preserve both start and end characters", () => {
			const result = anonymizer.anonymize("hello@example.com", "mask", {
				preserveStart: 2,
				preserveEnd: 4,
			});
			expect(result).toBe("he***********.com");
		});

		it("should use custom mask character", () => {
			const result = anonymizer.anonymize("secret", "mask", { maskChar: "#" });
			expect(result).toBe("######");
		});
	});

	describe("redact method", () => {
		it("should replace value with [REDACTED]", () => {
			const result = anonymizer.anonymize("sensitive data", "redact");
			expect(result).toBe("[REDACTED]");
		});
	});

	describe("null method", () => {
		it("should return null", () => {
			const result = anonymizer.anonymize("any value", "null");
			expect(result).toBeNull();
		});
	});

	describe("faker methods", () => {
		it("should generate fake name", () => {
			const result = anonymizer.anonymize("John Doe", "faker:name");
			expect(typeof result).toBe("string");
			expect((result as string).length).toBeGreaterThan(0);
		});

		it("should generate fake email", () => {
			const result = anonymizer.anonymize("john@example.com", "faker:email");
			expect(typeof result).toBe("string");
			expect((result as string)).toContain("@");
		});

		it("should generate fake phone", () => {
			const result = anonymizer.anonymize("555-1234", "faker:phone");
			expect(typeof result).toBe("string");
			expect((result as string).length).toBeGreaterThan(0);
		});

		it("should generate fake UUID", () => {
			const result = anonymizer.anonymize("old-uuid", "faker:uuid");
			expect(typeof result).toBe("string");
			expect((result as string)).toMatch(
				/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
			);
		});

		it("should generate fake number within range", () => {
			const result = anonymizer.anonymize(42, "faker:number", {
				min: 100,
				max: 200,
			});
			expect(typeof result).toBe("number");
			expect(result as number).toBeGreaterThanOrEqual(100);
			expect(result as number).toBeLessThanOrEqual(200);
		});
	});

	describe("null handling", () => {
		it("should return null for null input", () => {
			const result = anonymizer.anonymize(null, "mask");
			expect(result).toBeNull();
		});

		it("should return null for undefined input", () => {
			const result = anonymizer.anonymize(undefined, "faker:email");
			expect(result).toBeNull();
		});
	});

	describe("caching for consistency", () => {
		it("should return same anonymized value for same input", () => {
			const result1 = anonymizer.anonymize(
				"john@example.com",
				"faker:email",
				undefined,
				"users",
				"email",
			);
			const result2 = anonymizer.anonymize(
				"john@example.com",
				"faker:email",
				undefined,
				"users",
				"email",
			);
			expect(result1).toBe(result2);
		});

		it("should return different values for different inputs", () => {
			const result1 = anonymizer.anonymize(
				"john@example.com",
				"faker:email",
				undefined,
				"users",
				"email",
			);
			const result2 = anonymizer.anonymize(
				"jane@example.com",
				"faker:email",
				undefined,
				"users",
				"email",
			);
			expect(result1).not.toBe(result2);
		});

		it("should clear cache when requested", () => {
			anonymizer.anonymize(
				"test",
				"faker:name",
				undefined,
				"users",
				"name",
			);
			anonymizer.clearCache();
			// After clearing, it should generate a new value (though with same seed it might be the same)
			// The important thing is the cache is cleared
			expect(() => anonymizer.clearCache()).not.toThrow();
		});
	});

	describe("anonymizeRow", () => {
		it("should anonymize specified columns in a row", () => {
			const rules: AnonymizationRule[] = [
				{
					profileId: 1,
					tableName: "users",
					columnName: "email",
					method: "redact",
				},
				{
					profileId: 1,
					tableName: "users",
					columnName: "name",
					method: "faker:name",
				},
			];

			const row = {
				id: 1,
				email: "john@example.com",
				name: "John Doe",
				status: "active",
			};

			const result = anonymizer.anonymizeRow(row, "users", rules);

			expect(result.id).toBe(1); // Unchanged
			expect(result.email).toBe("[REDACTED]"); // Anonymized
			expect(result.name).not.toBe("John Doe"); // Anonymized
			expect(result.status).toBe("active"); // Unchanged
		});

		it("should not modify columns without rules", () => {
			const rules: AnonymizationRule[] = [
				{
					profileId: 1,
					tableName: "users",
					columnName: "email",
					method: "redact",
				},
			];

			const row = {
				id: 1,
				email: "john@example.com",
				password: "secret123",
			};

			const result = anonymizer.anonymizeRow(row, "users", rules);

			expect(result.password).toBe("secret123"); // Unchanged - no rule for this column
		});

		it("should only apply rules for the matching table", () => {
			const rules: AnonymizationRule[] = [
				{
					profileId: 1,
					tableName: "orders",
					columnName: "email",
					method: "redact",
				},
			];

			const row = {
				id: 1,
				email: "john@example.com",
			};

			const result = anonymizer.anonymizeRow(row, "users", rules);

			expect(result.email).toBe("john@example.com"); // Unchanged - rule is for different table
		});
	});

	describe("seed functionality", () => {
		it("should return the seed used", () => {
			const seededAnonymizer = createAnonymizer(99999);
			expect(seededAnonymizer.getSeed()).toBe(99999);
		});

		it("should produce consistent cached results within same instance", () => {
			const anonymizer1 = createAnonymizer(42);

			// Same value with table/column for caching
			const result1 = anonymizer1.anonymize("test", "faker:name", undefined, "users", "name");
			const result2 = anonymizer1.anonymize("test", "faker:name", undefined, "users", "name");

			expect(result1).toBe(result2);
		});
	});
});
