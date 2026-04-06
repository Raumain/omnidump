import { createServerFn } from "@tanstack/react-start";

import type { DbCredentials } from "../lib/db/connection";
import { extractErrorMessage } from "../lib/errors";
import type { Result } from "../lib/result";
import { db } from "./internal-db";

type SaveConnectionInput = DbCredentials & {
	name: string;
};

type SaveConnectionResult = Result<{ id: number }>;

export type SavedConnection = {
	id: number;
	name: string;
	driver: string | null;
	host: string | null;
	port: number | null;
	user: string | null;
	password: string | null;
	database_name: string | null;
	use_ssh: number | null;
	ssh_host: string | null;
	ssh_port: number | null;
	ssh_user: string | null;
	ssh_private_key: string | null;
	created_at: string;
};

type GetSavedConnectionsResult = Result<{ connections: SavedConnection[] }>;

type DeleteConnectionInput = {
	id: number;
};

type DeleteConnectionResult = Result<{ deleted: boolean }>;

type UpdateConnectionInput = DbCredentials & {
	id: number;
	name: string;
};

type UpdateConnectionResult = Result<object>;

export const saveConnectionFn = createServerFn({ method: "POST" })
	.inputValidator((connection: SaveConnectionInput) => connection)
	.handler(async ({ data: connection }): Promise<SaveConnectionResult> => {
		try {
			const result = db
				.query(
					`
          INSERT INTO saved_connections (
            name,
            driver,
            host,
            port,
            user,
            password,
            database_name,
            use_ssh,
            ssh_host,
            ssh_port,
            ssh_user,
            ssh_private_key
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
				)
				.run(
					connection.name,
					connection.driver,
					connection.host ?? null,
					connection.port ?? null,
					connection.user ?? null,
					connection.password ?? null,
					connection.database ?? null,
					connection.useSsh ? 1 : 0,
					connection.sshHost ?? null,
					connection.sshPort ?? null,
					connection.sshUser ?? null,
					connection.sshPrivateKey ?? null,
				);

			return {
				success: true,
				id:
					typeof result.lastInsertRowid === "bigint"
						? Number(result.lastInsertRowid)
						: result.lastInsertRowid,
			};
		} catch (error) {
			return {
				success: false,
				error: extractErrorMessage(error),
			};
		}
	});

export const getSavedConnectionsFn = createServerFn({ method: "GET" }).handler(
	async (): Promise<GetSavedConnectionsResult> => {
		try {
			const connections = db
				.query(
					`
          SELECT *
          FROM saved_connections
          ORDER BY created_at DESC
        `,
				)
				.all() as SavedConnection[];

			return {
				success: true,
				connections,
			};
		} catch (error) {
			return {
				success: false,
				error: extractErrorMessage(error),
			};
		}
	},
);

export const deleteConnectionFn = createServerFn({ method: "POST" })
	.inputValidator((input: DeleteConnectionInput) => input)
	.handler(async ({ data: input }): Promise<DeleteConnectionResult> => {
		try {
			const result = db
				.query(
					`
          DELETE FROM saved_connections
          WHERE id = ?
        `,
				)
				.run(input.id);

			return {
				success: true,
				deleted: result.changes > 0,
			};
		} catch (error) {
			return {
				success: false,
				error: extractErrorMessage(error),
			};
		}
	});

export const updateConnectionFn = createServerFn({ method: "POST" })
	.inputValidator((input: UpdateConnectionInput) => input)
	.handler(async ({ data: connection }): Promise<UpdateConnectionResult> => {
		try {
			const result = db
				.query(
					`
          UPDATE saved_connections
          SET
            name = ?,
            driver = ?,
            host = ?,
            port = ?,
            user = ?,
            password = ?,
            database_name = ?,
            use_ssh = ?,
            ssh_host = ?,
            ssh_port = ?,
            ssh_user = ?,
            ssh_private_key = ?
          WHERE id = ?
        `,
				)
				.run(
					connection.name,
					connection.driver,
					connection.host ?? null,
					connection.port ?? null,
					connection.user ?? null,
					connection.password ?? null,
					connection.database ?? null,
					connection.useSsh ? 1 : 0,
					connection.sshHost ?? null,
					connection.sshPort ?? null,
					connection.sshUser ?? null,
					connection.sshPrivateKey ?? null,
					connection.id,
				);

			if (result.changes === 0) {
				return {
					success: false,
					error: "Connection not found",
				};
			}

			return {
				success: true,
			};
		} catch (error) {
			return {
				success: false,
				error: extractErrorMessage(error),
			};
		}
	});
