/**
 * Shared constants for the OmniDump application.
 * Centralizes magic numbers and strings to improve maintainability.
 */

// =============================================================================
// Database Types
// =============================================================================

/** Supported database driver types */
export type DbDriver = "postgres" | "mysql" | "sqlite";

const DB_DRIVERS: readonly DbDriver[] = ["postgres", "mysql", "sqlite"];

/** Runtime type guard for supported database drivers */
export const isDbDriver = (value: unknown): value is DbDriver =>
	typeof value === "string" &&
	(DB_DRIVERS as readonly string[]).includes(value);

// =============================================================================
// SSH Constants
// =============================================================================

/** Default SSH port for tunnel connections */
export const DEFAULT_SSH_PORT = 22 as const;

// =============================================================================
// Tunnel Constants
// =============================================================================

/** Default idle timeout for SSH tunnels in milliseconds (10 seconds) */
export const DEFAULT_TUNNEL_IDLE_TIMEOUT_MS = 10_000 as const;

// =============================================================================
// Database Port Defaults
// =============================================================================

/** Default PostgreSQL port */
export const DEFAULT_POSTGRES_PORT = 5432 as const;

/** Default MySQL port */
export const DEFAULT_MYSQL_PORT = 3306 as const;

// =============================================================================
// CSV Import Constants
// =============================================================================

/** Number of sample rows to collect when analyzing CSV files */
export const CSV_SAMPLE_ROW_COUNT = 200 as const;
