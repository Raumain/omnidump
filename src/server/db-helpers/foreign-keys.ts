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
 * Safely checks if the current database session can set session_replication_role.
 * Returns true if the setting succeeds, false if permission is denied.
 * This is Postgres-specific; other databases return true by default (not applicable).
 */
export async function canSetReplicationRole(
	// biome-ignore lint/suspicious/noExplicitAny: Kysely generic
	db: Kysely<any>,
	driver: DbDriver,
): Promise<boolean> {
	// Only relevant for Postgres
	if (driver !== "postgres") {
		return true;
	}

	try {
		// Try to set the replication role in a controlled manner
		await sql`SET session_replication_role = 'replica';`.execute(db);
		// If successful, restore to original
		await sql`SET session_replication_role = 'origin';`.execute(db);
		return true;
	} catch (error) {
		// If we get a privilege error, return false
		// Log at debug level but don't throw
		if (error instanceof Error) {
			console.debug(
				`Cannot set session_replication_role (permission denied). Dumps will include FK constraints. Error: ${error.message}`,
			);
		}
		return false;
	}
}

/**
 * Generates SQL statements to disable FK checks (for dump files).
 * @param driver Database driver type
 * @param allowReplicationRole If false, Postgres will skip replication role setting (for unprivileged users)
 */
export function getFKDisableStatement(
	driver: DbDriver,
	allowReplicationRole: boolean = true,
): string {
	switch (driver) {
		case "postgres":
			return allowReplicationRole
				? "SET session_replication_role = 'replica';"
				: ""; // No FK disabling for unprivileged users
		case "mysql":
			return "SET FOREIGN_KEY_CHECKS = 0;";
		case "sqlite":
			return "PRAGMA foreign_keys = OFF;";
	}
}

/**
 * Generates SQL statements to re-enable FK checks (for dump files).
 * @param driver Database driver type
 * @param allowReplicationRole If false, Postgres will skip replication role setting
 */
export function getFKEnableStatement(
	driver: DbDriver,
	allowReplicationRole: boolean = true,
): string {
	switch (driver) {
		case "postgres":
			return allowReplicationRole
				? "SET session_replication_role = 'origin';"
				: ""; // No FK re-enabling for unprivileged users
		case "mysql":
			return "SET FOREIGN_KEY_CHECKS = 1;";
		case "sqlite":
			return "PRAGMA foreign_keys = ON;";
	}
}
