import { createServerFn } from "@tanstack/react-start";

import {
  createConnection,
  type DbCredentials,
} from "../lib/db/connection";

type TestDatabaseConnectionResult =
  | { success: true; message: string }
  | { success: false; error: string };

export const testDatabaseConnection = createServerFn({ method: "POST" })
  .inputValidator((credentials: DbCredentials) => credentials)
  .handler(async ({ data: credentials }): Promise<TestDatabaseConnectionResult> => {
    let db: ReturnType<typeof createConnection> | undefined;

    try {
      db = createConnection(credentials);
      await db`SELECT 1`;

      return {
        success: true,
        message: "Connection successful",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";

      return {
        success: false,
        error: message,
      };
    } finally {
      await db?.close();
    }
  });