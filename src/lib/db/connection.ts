import { SQL } from "bun";
import {
  DummyDriver,
  Kysely,
  MysqlAdapter,
  MysqlQueryCompiler,
  PostgresAdapter,
  PostgresQueryCompiler,
  SqliteAdapter,
  SqliteQueryCompiler,
  type DatabaseIntrospector,
  type Dialect,
} from "kysely";

export type DbDriver = "postgres" | "mysql" | "sqlite";

export interface DbCredentials {
  driver: DbDriver;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
}

type RawDatabase = Record<string, never>;

const createNoopIntrospector = (): DatabaseIntrospector => ({
  getSchemas: async () => [],
  getTables: async () => [],
  getMetadata: async () => ({ tables: [] }),
});

const getDialect = (dialect: DbDriver): Dialect => {
  switch (dialect) {
    case "postgres":
      return {
        createAdapter: () => new PostgresAdapter(),
        createDriver: () => new DummyDriver(),
        createIntrospector: () => createNoopIntrospector(),
        createQueryCompiler: () => new PostgresQueryCompiler(),
      };
    case "mysql":
      return {
        createAdapter: () => new MysqlAdapter(),
        createDriver: () => new DummyDriver(),
        createIntrospector: () => createNoopIntrospector(),
        createQueryCompiler: () => new MysqlQueryCompiler(),
      };
    case "sqlite":
      return {
        createAdapter: () => new SqliteAdapter(),
        createDriver: () => new DummyDriver(),
        createIntrospector: () => createNoopIntrospector(),
        createQueryCompiler: () => new SqliteQueryCompiler(),
      };
  }
};

export const createConnection = (credentials: DbCredentials): SQL => {
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
  });
};

export const getQueryBuilder = (dialect: DbDriver): Kysely<RawDatabase> => {
  return new Kysely<RawDatabase>({
    dialect: getDialect(dialect),
  });
};
