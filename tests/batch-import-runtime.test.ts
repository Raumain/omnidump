import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
	formatImportErrorMessage,
	getColumnsForAdvancedCreatedTable,
	mergeRuntimePolicy,
	normalizeImportError,
	parseBatchImportConfig,
	type RuntimeTableConfig,
} from "../src/server/batch-import-runtime";

describe("batch import runtime helpers", () => {
	it("rejects upsert policies without conflict columns", () => {
		const payload = {
			files: [
				{
					fileName: "input.csv",
					columns: [],
					importMode: "advanced",
					advancedConfig: {
						columnTargets: {},
						tablePolicies: [
							{
								tableName: "users",
								tableMode: "map",
								writeMode: "upsert",
								conflictColumns: [],
								primaryKeyColumn: null,
							},
						],
						rowLinkStrategy: {
							mode: "explicit_fk",
							links: [],
						},
					},
				},
			],
			relationships: [],
		};

		expect(() => parseBatchImportConfig(JSON.stringify(payload))).toThrow(
			/upsert without conflict columns/i,
		);
	});

	it("parses a valid advanced payload", () => {
		const payload = {
			files: [
				{
					fileName: "input.csv",
					columns: [
						{
							name: "email",
							inferredType: "TEXT",
							userType: null,
							nullable: false,
							sampleValues: ["test@example.com"],
						},
					],
					importMode: "advanced",
					advancedConfig: {
						columnTargets: {
							email: {
								tableName: "users",
								columnName: "email",
							},
						},
						tablePolicies: [
							{
								tableName: "users",
								tableMode: "map",
								writeMode: "upsert",
								conflictColumns: ["email"],
								primaryKeyColumn: "id",
							},
						],
						rowLinkStrategy: {
							mode: "generated_id",
							links: [
								{
									id: "link-1",
									parentTable: "users",
									parentKeyColumn: "id",
									childTable: "orders",
									childForeignKeyColumn: "user_id",
								},
							],
						},
					},
				},
			],
			relationships: [],
		};

		const parsed = parseBatchImportConfig(JSON.stringify(payload));
		expect(parsed.files).toHaveLength(1);
		expect(parsed.files[0]?.importMode).toBe("advanced");
	});

	it("detects conflicting runtime table policies", () => {
		const policyByTable = new Map<string, RuntimeTableConfig>();
		mergeRuntimePolicy(policyByTable, {
			tableName: "users",
			tableMode: "map",
			writeMode: "insert",
			conflictColumns: [],
			primaryKeyColumn: null,
		});

		expect(() =>
			mergeRuntimePolicy(policyByTable, {
				tableName: "users",
				tableMode: "map",
				writeMode: "upsert",
				conflictColumns: ["email"],
				primaryKeyColumn: "id",
			}),
		).toThrow(/conflicting write policy/i);
	});

	it("builds deduplicated columns for advanced created tables", () => {
		const columns = getColumnsForAdvancedCreatedTable(
			{
				fileName: "input.csv",
				columns: [
					{
						name: "email",
						inferredType: "TEXT",
						userType: null,
						nullable: false,
						sampleValues: [],
					},
					{
						name: "name",
						inferredType: "TEXT",
						userType: null,
						nullable: true,
						sampleValues: [],
					},
				],
				importMode: "advanced",
				advancedConfig: {
					columnTargets: {
						email: { tableName: "users", columnName: "email" },
						name: { tableName: "users", columnName: "name" },
					},
					tablePolicies: [],
					rowLinkStrategy: {
						mode: "explicit_fk",
						links: [],
					},
				},
			},
			"users",
		);

		expect(columns.map((column) => column.name)).toEqual(["email", "name"]);
	});

	it("normalizes zod and sql-like errors into import errors", () => {
		const zodError = new z.ZodError([
			{
				code: z.ZodIssueCode.custom,
				message: "bad row",
				path: ["field"],
			},
		]);
		const normalizedValidation = normalizeImportError(zodError);
		expect(normalizedValidation.stage).toBe("validation");
		expect(formatImportErrorMessage(normalizedValidation)).toMatch(/VALIDATION/);

		const sqlError = Object.assign(new Error("constraint failed"), {
			code: "SQLITE_CONSTRAINT",
		});
		const normalizedSql = normalizeImportError(sqlError);
		expect(normalizedSql.stage).toBe("constraint");
		expect(formatImportErrorMessage(normalizedSql)).toMatch(/\[SQLITE_CONSTRAINT\]/);
	});
});

