import { isDbDriver } from "#/lib/constants";
import type { DbCredentials, DbDriver } from "#/lib/db/connection";
import type { SavedConnection } from "#/server/connection-fns";

/**
 * Validates and normalizes a driver string to a valid DbDriver type.
 * Defaults to "postgres" if the driver is invalid.
 */
export function normalizeDriver(driver: string | null | undefined): DbDriver {
	if (isDbDriver(driver)) {
		return driver;
	}
	return "postgres";
}

/**
 * Type guard to check if input uses database_name (SavedConnection format)
 * vs database (DbCredentials format).
 */
function hasDatabaseName(input: CredentialInput): input is SavedConnection {
	return "database_name" in input;
}

/**
 * Type guard to check if input uses snake_case SSH fields (SavedConnection format).
 */
function hasSnakeCaseSsh(input: CredentialInput): input is SavedConnection {
	return "use_ssh" in input || "ssh_host" in input;
}

type CredentialInput = DbCredentials | SavedConnection;

/**
 * Normalizes various credential formats into a consistent DbCredentials object.
 * Handles both SavedConnection (snake_case) and DbCredentials (camelCase) formats.
 */
export function normalizeCredentials(input: CredentialInput): DbCredentials {
	const driver = normalizeDriver(input.driver);

	// Handle database name (either database_name or database field)
	const database = hasDatabaseName(input)
		? (input.database_name ?? undefined)
		: (input.database ?? undefined);

	// Handle SSH fields (either snake_case or camelCase)
	const useSsh = hasSnakeCaseSsh(input)
		? Boolean(input.use_ssh)
		: (input.useSsh ?? false);

	const sshHost = hasSnakeCaseSsh(input)
		? (input.ssh_host ?? undefined)
		: (input.sshHost ?? undefined);

	const sshPort = hasSnakeCaseSsh(input)
		? (input.ssh_port ?? undefined)
		: (input.sshPort ?? undefined);

	const sshUser = hasSnakeCaseSsh(input)
		? (input.ssh_user ?? undefined)
		: (input.sshUser ?? undefined);

	const sshPrivateKey = hasSnakeCaseSsh(input)
		? (input.ssh_private_key ?? undefined)
		: (input.sshPrivateKey ?? undefined);

	return {
		driver,
		host: input.host ?? undefined,
		port: input.port ?? undefined,
		user: input.user ?? undefined,
		password: input.password ?? undefined,
		database,
		useSsh,
		sshHost,
		sshPort,
		sshUser,
		sshPrivateKey,
	};
}

/**
 * Converts a SavedConnection to DbCredentials.
 * This is a convenience wrapper around normalizeCredentials with explicit typing.
 */
export function savedConnectionToCredentials(
	connection: SavedConnection,
): DbCredentials {
	return normalizeCredentials(connection);
}
