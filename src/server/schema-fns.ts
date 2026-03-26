import { createServerFn } from "@tanstack/react-start";
import { sql } from "kysely";

import {
  type DbCredentials,
  getKyselyInstance,
} from "../lib/db/connection";

type ActiveConnectionInput =
  | DbCredentials
  | {
    driver: string | null;
    host: string | null;
    port: number | null;
    user: string | null;
    password: string | null;
    database_name: string | null;
  };

type SchemaTable = {
  tableName: string;
  columns: Array<{
    name: string;
    dataType: string;
    isNullable: boolean;
  }>;
};

type GetDatabaseSchemaResult = SchemaTable[] | { error: string };

type ClearTableDataInput = {
  credentials: DbCredentials;
  tableName: string;
};

type ClearTableDataResult =
  | { success: true; message: string }
  | { success: false; error: string };

type WipeAllDataResult =
  | { success: true; message: string }
  | { success: false; error: string };

const hasDatabaseName = (
  input: ActiveConnectionInput,
): input is {
  driver: string | null;
  host: string | null;
  port: number | null;
  user: string | null;
  password: string | null;
  database_name: string | null;
} => "database_name" in input;

const normalizeCredentials = (input: ActiveConnectionInput): DbCredentials => {
  const driver = input.driver;

  const normalizedDriver: DbCredentials["driver"] =
    driver === "mysql" || driver === "sqlite" || driver === "postgres"
      ? driver
      : "postgres";

  return {
    driver: normalizedDriver,
    host: input.host ?? undefined,
    port: input.port ?? undefined,
    user: input.user ?? undefined,
    password: input.password ?? undefined,
    database: hasDatabaseName(input)
      ? input.database_name ?? undefined
      : input.database ?? undefined,
  };
};

export const getDatabaseSchemaFn = createServerFn({ method: "POST" })
  .inputValidator((credentials: ActiveConnectionInput) => credentials)
  .handler(async ({ data: credentials }): Promise<GetDatabaseSchemaResult> => {
    const normalizedCredentials = normalizeCredentials(credentials);
    const db = getKyselyInstance(normalizedCredentials);

    try {
      const tables = await db.introspection.getTables();

      return tables.map((table) => ({
        tableName: table.name,
        columns: table.columns.map((column) => ({
          name: column.name,
          dataType: column.dataType,
          isNullable: column.isNullable,
        })),
      }));
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unknown error",
      };
    } finally {
      await db.destroy();
    }
  });

export const clearTableDataFn = createServerFn({ method: "POST" })
  .inputValidator((input: ClearTableDataInput) => input)
  .handler(async ({ data: input }): Promise<ClearTableDataResult> => {
    const db = getKyselyInstance(input.credentials);

    try {
      await db.deleteFrom(input.tableName).execute();

      return {
        success: true,
        message: `Table ${input.tableName} cleared`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";

      return {
        success: false,
        error: message,
      };
    } finally {
      await db.destroy();
    }
  });

export const wipeAllDataFn = createServerFn({ method: "POST" })
  .inputValidator((credentials: DbCredentials) => credentials)
  .handler(async ({ data: credentials }): Promise<WipeAllDataResult> => {
    const db = getKyselyInstance(credentials);
    let fkChecksDisabled = false;

    const disableForeignKeyChecks = async () => {
      if (credentials.driver === "postgres") {
        await sql`SET session_replication_role = 'replica';`.execute(db);
      }

      if (credentials.driver === "mysql") {
        await sql`SET FOREIGN_KEY_CHECKS = 0;`.execute(db);
      }

      if (credentials.driver === "sqlite") {
        await sql`PRAGMA foreign_keys = OFF;`.execute(db);
      }

      fkChecksDisabled = true;
    };

    const restoreForeignKeyChecks = async () => {
      if (!fkChecksDisabled) {
        return;
      }

      if (credentials.driver === "postgres") {
        await sql`SET session_replication_role = 'origin';`.execute(db);
      }

      if (credentials.driver === "mysql") {
        await sql`SET FOREIGN_KEY_CHECKS = 1;`.execute(db);
      }

      if (credentials.driver === "sqlite") {
        await sql`PRAGMA foreign_keys = ON;`.execute(db);
      }
    };

    try {
      const tables = await db.introspection.getTables();
      const tableNames = tables
        .map((table) => table.name)
        .filter((tableName) => {
          if (credentials.driver !== "sqlite") {
            return true;
          }

          return tableName !== "sqlite_sequence";
        });

      await disableForeignKeyChecks();

      for (const tableName of tableNames) {
        await db.deleteFrom(tableName).execute();
      }

      return {
        success: true,
        message: "All data wiped successfully.",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";

      return {
        success: false,
        error: message,
      };
    } finally {
      try {
        await restoreForeignKeyChecks();
      } catch (error) {
        console.error("Failed to restore foreign key checks:", error);
      }

      await db.destroy();
    }
  });