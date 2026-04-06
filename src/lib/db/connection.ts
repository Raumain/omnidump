import "@tanstack/react-start/server-only";
import { SQL } from "bun";
import {
	type CompiledQuery,
	type DatabaseConnection,
	type Dialect,
	type Driver,
	Kysely,
	MysqlAdapter,
	MysqlIntrospector,
	MysqlQueryCompiler,
	PostgresAdapter,
	PostgresIntrospector,
	PostgresQueryCompiler,
	type QueryResult,
	SqliteAdapter,
	SqliteIntrospector,
	SqliteQueryCompiler,
	type TransactionSettings,
	validateTransactionSettings,
} from "kysely";
import { type DbDriver, isDbDriver } from "../constants";

export type { DbDriver };
export { isDbDriver };

export interface SshCredentials {
	useSsh?: boolean;
	sshHost?: string;
	sshPort?: number;
	sshUser?: string;
	sshPrivateKey?: string;
	sshPassword?: string;
	sshPassphrase?: string;
}

interface DbCredentialsBase {
	driver: DbDriver;
	database?: string;
}

interface NetworkDbCredentialsBase extends DbCredentialsBase {
	host?: string;
	port?: number;
	user?: string;
	password?: string;
}

export interface PostgresCredentials
	extends NetworkDbCredentialsBase,
		SshCredentials {
	driver: "postgres";
}

export interface MysqlCredentials
	extends NetworkDbCredentialsBase,
		SshCredentials {
	driver: "mysql";
}

export interface SqliteCredentials extends DbCredentialsBase, SshCredentials {
	driver: "sqlite";
	host?: string;
	port?: number;
	user?: string;
	password?: string;
}

export type DbCredentials =
	| PostgresCredentials
	| MysqlCredentials
	| SqliteCredentials;

class BunDatabaseConnection implements DatabaseConnection {
	constructor(private readonly connection: SQL) {}

	async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
		const rows = await this.connection.unsafe<R[]>(compiledQuery.sql, [
			...compiledQuery.parameters,
		]);

		return { rows };
	}

	async *streamQuery<R>(
		compiledQuery: CompiledQuery,
	): AsyncIterableIterator<QueryResult<R>> {
		yield await this.executeQuery<R>(compiledQuery);
	}
}

class BunDriver implements Driver {
	private readonly dbConnection: BunDatabaseConnection;

	constructor(private readonly connection: SQL) {
		this.dbConnection = new BunDatabaseConnection(connection);
	}

	async init(): Promise<void> {}

	async acquireConnection(): Promise<DatabaseConnection> {
		return this.dbConnection;
	}

	async beginTransaction(
		_connection: DatabaseConnection,
		settings: TransactionSettings,
	): Promise<void> {
		validateTransactionSettings(settings);
		await this.connection.unsafe("begin");

		if (settings.isolationLevel) {
			await this.connection.unsafe(
				`set transaction isolation level ${settings.isolationLevel}`,
			);
		}

		if (settings.accessMode) {
			await this.connection.unsafe(`set transaction ${settings.accessMode}`);
		}
	}

	async commitTransaction(_connection: DatabaseConnection): Promise<void> {
		await this.connection.unsafe("commit");
	}

	async rollbackTransaction(_connection: DatabaseConnection): Promise<void> {
		await this.connection.unsafe("rollback");
	}

	async releaseConnection(_connection: DatabaseConnection): Promise<void> {}

	async destroy(): Promise<void> {
		await this.connection.close();
	}
}

const getDialect = (driver: DbDriver, connection: SQL): Dialect => {
	switch (driver) {
		case "postgres":
			return {
				createAdapter: () => new PostgresAdapter(),
				createDriver: () => new BunDriver(connection),
				createIntrospector: (db) => new PostgresIntrospector(db),
				createQueryCompiler: () => new PostgresQueryCompiler(),
			};
		case "mysql":
			return {
				createAdapter: () => new MysqlAdapter(),
				createDriver: () => new BunDriver(connection),
				createIntrospector: (db) => new MysqlIntrospector(db),
				createQueryCompiler: () => new MysqlQueryCompiler(),
			};
		case "sqlite":
			return {
				createAdapter: () => new SqliteAdapter(),
				createDriver: () => new BunDriver(connection),
				createIntrospector: (db) => new SqliteIntrospector(db),
				createQueryCompiler: () => new SqliteQueryCompiler(),
			};
		default:
			throw new Error(`Unsupported driver: ${String(driver)}`);
	}
};

export const createConnection = (credentials: DbCredentials): SQL => {
	if (!isDbDriver(credentials.driver)) {
		throw new Error(`Unsupported driver: ${String(credentials.driver)}`);
	}

	if (credentials.driver === "sqlite") {
		return new SQL({
			adapter: "sqlite",
			filename: credentials.database ?? ":memory:",
		});
	}

	return new SQL({
		adapter: credentials.driver,
		host: credentials.host,
		port: credentials.port,
		user: credentials.user,
		password: credentials.password,
		database: credentials.database,
		tls: credentials.useSsh ? false : undefined,
	});
};

// biome-ignore lint/suspicious/noExplicitAny: Kysely needs any for generic introspection
export const getKyselyInstance = (credentials: DbCredentials): Kysely<any> => {
	const connection = createConnection(credentials);

	// biome-ignore lint/suspicious/noExplicitAny: Kysely needs any for generic introspection
	return new Kysely<any>({
		dialect: getDialect(credentials.driver, connection),
	});
};
