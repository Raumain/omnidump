import "@tanstack/react-start/server-only";
import { sql } from "kysely";

import type { AnonymizationRule } from "../lib/anonymization-types";
import type { DbCredentials } from "../lib/db/connection";
import { getKyselyInstance } from "../lib/db/connection";
import { createAnonymizer } from "./anonymizer";
import {
	canSetReplicationRole,
	getFKDisableStatement,
	getFKEnableStatement,
} from "./db-helpers/foreign-keys";
import { escapeValue, quoteIdentifier } from "./db-helpers/sql-utils";
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
 * Batches an array into chunks of specified size
 */
function batchArray<T>(array: T[], batchSize: number): T[][] {
	const batches: T[][] = [];
	for (let i = 0; i < array.length; i += batchSize) {
		batches.push(array.slice(i, i + batchSize));
	}
	return batches;
}

/**
 * Generates COPY format data for Postgres (most efficient bulk loading)
 */
function generateCopyFormat(
	tableName: string,
	columns: string[],
	anonymizedRows: Record<string, unknown>[],
	driver: DbCredentials["driver"],
): string {
	const lines: string[] = [];
	const quotedTable = quoteIdentifier(tableName, driver);
	const quotedColumns = columns
		.map((c) => quoteIdentifier(c, driver))
		.join(", ");

	lines.push(`COPY ${quotedTable} (${quotedColumns}) FROM stdin;`);

	// COPY format uses tab-separated values with special character escaping
	for (const row of anonymizedRows) {
		const values = columns
			.map((col) => {
				const value = row[col];
				// In COPY format, NULL is represented as \N
				if (value === null || value === undefined) {
					return "\\N";
				}

				let stringValue: string;
				if (value instanceof Date) {
					stringValue = value.toISOString();
				} else if (typeof value === "object") {
					stringValue = JSON.stringify(value);
				} else {
					stringValue = String(value);
				}

				// Escape special characters in COPY format
				return stringValue
					.replace(/\\/g, "\\\\") // Escape backslashes first
					.replace(/\t/g, "\\t") // Escape tabs
					.replace(/\n/g, "\\n") // Escape newlines
					.replace(/\r/g, "\\r"); // Escape carriage returns
			})
			.join("\t");

		lines.push(values);
	}

	lines.push("\\.");

	return `${lines.join("\n")}\n`;
}

/**
 * Generates batched INSERT statements for MySQL and SQLite
 */
function generateBatchedInserts(
	tableName: string,
	columns: string[],
	anonymizedRows: Record<string, unknown>[],
	driver: DbCredentials["driver"],
	batchSize: number = 1000,
): string {
	const lines: string[] = [];
	const quotedTable = quoteIdentifier(tableName, driver);
	const quotedColumns = columns
		.map((c) => quoteIdentifier(c, driver))
		.join(", ");

	const batches = batchArray(anonymizedRows, batchSize);

	for (const batch of batches) {
		const valueSets = batch
			.map((row) => {
				const values = columns
					.map((col) => escapeValue(row[col], driver))
					.join(", ");
				return `(${values})`;
			})
			.join(", ");

		lines.push(
			`INSERT INTO ${quotedTable} (${quotedColumns}) VALUES ${valueSets};`,
		);
	}

	return `${lines.join("\n")}\n`;
}

/**
 * Generate INSERT statements for a table with anonymized data
 * Uses database-specific bulk loading for optimal performance:
 * - Postgres: COPY format (100-1000x faster than row INSERT)
 * - MySQL/SQLite: Batched multi-row INSERT (10-50x faster than row INSERT)
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

	// Anonymize all rows upfront
	const anonymizedRows = (result.rows as Record<string, unknown>[]).map((row) =>
		anonymizer.anonymizeRow(row, tableName, tableRules),
	);

	// Use database-specific bulk loading for optimal performance
	if (driver === "postgres") {
		return generateCopyFormat(tableName, columns, anonymizedRows, driver);
	}

	// MySQL and SQLite use batched multi-row INSERT
	return generateBatchedInserts(
		tableName,
		columns,
		anonymizedRows,
		driver,
		1000,
	);
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
			// Check if we can use replication role for disabling FK checks
			let canUseReplicationRole = true;
			if (credentials.driver === "postgres") {
				canUseReplicationRole = await canSetReplicationRole(
					db,
					credentials.driver,
				);
			}

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
			const disableStatement = getFKDisableStatement(
				credentials.driver,
				canUseReplicationRole,
			);
			if (disableStatement) {
				lines.push(disableStatement);
				lines.push("");
			}

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
			const enableStatement = getFKEnableStatement(
				credentials.driver,
				canUseReplicationRole,
			);
			if (enableStatement) {
				lines.push(enableStatement);
			}

			return lines.join("\n");
		} finally {
			await db.destroy();
		}
	});
}
