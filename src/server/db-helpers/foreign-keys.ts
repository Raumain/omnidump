import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { DbDriver } from "#/lib/constants";

/**
 * Disables foreign key constraint checking for the current session/transaction.
 * Required when deleting or dropping tables with relationships.
 */
export async function disableForeignKeyChecks(
	// biome-ignore lint/suspicious/noExplicitAny: Kysely generic
	db: Kysely<any>,
	driver: DbDriver,
): Promise<void> {
	switch (driver) {
		case "postgres":
			await sql`SET session_replication_role = 'replica';`.execute(db);
			break;
		case "mysql":
			await sql`SET FOREIGN_KEY_CHECKS = 0;`.execute(db);
			break;
		case "sqlite":
			await sql`PRAGMA foreign_keys = OFF;`.execute(db);
			break;
	}
}

/**
 * Re-enables foreign key constraint checking after bulk operations.
 */
export async function restoreForeignKeyChecks(
	// biome-ignore lint/suspicious/noExplicitAny: Kysely generic
	db: Kysely<any>,
	driver: DbDriver,
): Promise<void> {
	switch (driver) {
		case "postgres":
			await sql`SET session_replication_role = 'origin';`.execute(db);
			break;
		case "mysql":
			await sql`SET FOREIGN_KEY_CHECKS = 1;`.execute(db);
			break;
		case "sqlite":
			await sql`PRAGMA foreign_keys = ON;`.execute(db);
			break;
	}
}

/**
 * Generates SQL statements to disable FK checks (for dump files).
 */
export function getFKDisableStatement(driver: DbDriver): string {
	switch (driver) {
		case "postgres":
			return "SET session_replication_role = 'replica';";
		case "mysql":
			return "SET FOREIGN_KEY_CHECKS = 0;";
		case "sqlite":
			return "PRAGMA foreign_keys = OFF;";
	}
}

/**
 * Generates SQL statements to re-enable FK checks (for dump files).
 */
export function getFKEnableStatement(driver: DbDriver): string {
	switch (driver) {
		case "postgres":
			return "SET session_replication_role = 'origin';";
		case "mysql":
			return "SET FOREIGN_KEY_CHECKS = 1;";
		case "sqlite":
			return "PRAGMA foreign_keys = ON;";
	}
}
