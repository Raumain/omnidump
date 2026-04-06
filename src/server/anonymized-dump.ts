import "@tanstack/react-start/server-only";
import { sql } from "kysely";

import type { AnonymizationRule } from "../lib/anonymization-types";
import type { DbCredentials } from "../lib/db/connection";
import { getKyselyInstance } from "../lib/db/connection";
import { createAnonymizer } from "./anonymizer";
import { withTunnel } from "./ssh-tunnel";

type TableSchema = {
	name: string;
	columns: Array<{
		name: string;
		dataType: string;
	}>;
};

type AnonymizedDumpOptions = {
	credentials: DbCredentials;
	tables?: string[];
	rules: AnonymizationRule[];
	includeSchema: boolean;
};

/**
 * Escape a string value for SQL
 */
function escapeValue(value: unknown, driver: DbCredentials["driver"]): string {
	if (value === null || value === undefined) {
		return "NULL";
	}

	if (typeof value === "number") {
		if (Number.isNaN(value) || !Number.isFinite(value)) {
			return "NULL";
		}
		return String(value);
	}

	if (typeof value === "boolean") {
		if (driver === "mysql") {
			return value ? "1" : "0";
		}
		return value ? "TRUE" : "FALSE";
	}

	if (value instanceof Date) {
		return `'${value.toISOString()}'`;
	}

	if (typeof value === "object") {
		// JSON objects/arrays
		const jsonStr = JSON.stringify(value).replace(/'/g, "''");
		return `'${jsonStr}'`;
	}

	// String escaping
	const str = String(value).replace(/'/g, "''");
	return `'${str}'`;
}

/**
 * Quote an identifier (table/column name) based on driver
 */
function quoteIdentifier(
	name: string,
	driver: DbCredentials["driver"],
): string {
	if (driver === "mysql") {
		return `\`${name.replace(/`/g, "``")}\``;
	}
	// PostgreSQL and SQLite use double quotes
	return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Generate CREATE TABLE statement from schema
 */
async function generateCreateTable(
	tableName: string,
	credentials: DbCredentials,
	// biome-ignore lint/suspicious/noExplicitAny: Kysely generic
	db: any,
): Promise<string> {
	const { driver } = credentials;

	if (driver === "postgres") {
		const result = await sql<{ create_statement: string }>`
			SELECT 
				'CREATE TABLE ' || quote_ident(${tableName}) || ' (' ||
				string_agg(
					quote_ident(column_name) || ' ' || 
					CASE 
						WHEN data_type = 'character varying' THEN 'VARCHAR(' || character_maximum_length || ')'
						WHEN data_type = 'numeric' THEN 'NUMERIC(' || COALESCE(numeric_precision::text, '10') || ',' || COALESCE(numeric_scale::text, '0') || ')'
						ELSE UPPER(data_type)
					END ||
					CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END,
					', '
				) || ');' as create_statement
			FROM information_schema.columns
			WHERE table_name = ${tableName}
			AND table_schema = 'public'
			GROUP BY table_name
		`.execute(db);

		return `${result.rows[0]?.create_statement ?? ""}\n`;
	}

	if (driver === "mysql") {
		const result = await sql<{
			"Create Table": string;
		}>`SHOW CREATE TABLE ${sql.raw(quoteIdentifier(tableName, driver))}`.execute(
			db,
		);
		const createStmt = result.rows[0]?.["Create Table"] ?? "";
		return `${createStmt};\n`;
	}

	// SQLite
	const result = await sql<{
		sql: string;
	}>`SELECT sql FROM sqlite_master WHERE type='table' AND name=${tableName}`.execute(
		db,
	);
	return `${result.rows[0]?.sql ?? ""};\n`;
}

/**
 * Generate INSERT statements for a table with anonymized data
 */
async function generateInserts(
	tableName: string,
	columns: string[],
	credentials: DbCredentials,
	rules: AnonymizationRule[],
	anonymizer: ReturnType<typeof createAnonymizer>,
	// biome-ignore lint/suspicious/noExplicitAny: Kysely generic
	db: any,
): Promise<string> {
	const { driver } = credentials;
	const tableRules = rules.filter((r) => r.tableName === tableName);

	// Query all data from the table
	const quotedTable = quoteIdentifier(tableName, driver);
	const result = await sql.raw(`SELECT * FROM ${quotedTable}`).execute(db);

	if (result.rows.length === 0) {
		return "";
	}

	const lines: string[] = [];
	const quotedColumns = columns
		.map((c) => quoteIdentifier(c, driver))
		.join(", ");

	for (const row of result.rows as Record<string, unknown>[]) {
		// Apply anonymization
		const anonymizedRow = anonymizer.anonymizeRow(row, tableName, tableRules);

		// Generate values
		const values = columns
			.map((col) => escapeValue(anonymizedRow[col], driver))
			.join(", ");

		lines.push(
			`INSERT INTO ${quotedTable} (${quotedColumns}) VALUES (${values});`,
		);
	}

	return `${lines.join("\n")}\n`;
}

/**
 * Generate a full anonymized SQL dump
 */
export async function generateAnonymizedDump(
	options: AnonymizedDumpOptions,
): Promise<string> {
	const {
		credentials,
		tables: requestedTables,
		rules,
		includeSchema,
	} = options;
	const anonymizer = createAnonymizer();

	return withTunnel(credentials, async (tunneledCreds) => {
		const db = getKyselyInstance(tunneledCreds);

		try {
			// Get all tables
			const allTables = await db.introspection.getTables();
			const tableSchemas: TableSchema[] = allTables
				.filter((t) => !requestedTables || requestedTables.includes(t.name))
				.map((t) => ({
					name: t.name,
					columns: t.columns.map((c) => ({
						name: c.name,
						dataType: c.dataType,
					})),
				}));

			const lines: string[] = [];

			// Header
			lines.push("-- Anonymized dump generated by OmniDump");
			lines.push(`-- Generated at: ${new Date().toISOString()}`);
			lines.push(`-- Anonymization seed: ${anonymizer.getSeed()}`);
			lines.push(`-- Tables: ${tableSchemas.length}`);
			lines.push(`-- Anonymization rules: ${rules.length}`);
			lines.push("");

			// Disable foreign key checks for import
			if (credentials.driver === "postgres") {
				lines.push("SET session_replication_role = 'replica';");
			} else if (credentials.driver === "mysql") {
				lines.push("SET FOREIGN_KEY_CHECKS = 0;");
			} else {
				lines.push("PRAGMA foreign_keys = OFF;");
			}
			lines.push("");

			// Generate schema if requested
			if (includeSchema) {
				lines.push("-- SCHEMA");
				lines.push("");

				for (const table of tableSchemas) {
					const createStmt = await generateCreateTable(
						table.name,
						tunneledCreds,
						db,
					);
					lines.push(`-- Table: ${table.name}`);
					lines.push(createStmt);
				}
			}

			// Generate data
			lines.push("-- DATA");
			lines.push("");

			for (const table of tableSchemas) {
				lines.push(`-- Table: ${table.name}`);
				const columnNames = table.columns.map((c) => c.name);
				const inserts = await generateInserts(
					table.name,
					columnNames,
					tunneledCreds,
					rules,
					anonymizer,
					db,
				);
				if (inserts) {
					lines.push(inserts);
				} else {
					lines.push("-- (no data)");
					lines.push("");
				}
			}

			// Re-enable foreign key checks
			if (credentials.driver === "postgres") {
				lines.push("SET session_replication_role = 'origin';");
			} else if (credentials.driver === "mysql") {
				lines.push("SET FOREIGN_KEY_CHECKS = 1;");
			} else {
				lines.push("PRAGMA foreign_keys = ON;");
			}

			return lines.join("\n");
		} finally {
			await db.destroy();
		}
	});
}
