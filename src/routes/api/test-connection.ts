import { createFileRoute } from "@tanstack/react-router";
import { createConnection, type DbCredentials } from "../../lib/db/connection";
import { withTunnel } from "../../server/ssh-tunnel";

export const Route = createFileRoute("/api/test-connection" as never)({
	server: {
		handlers: {
			POST: async ({ request }) => {
				try {
					const body = await request.json();
					const credentials = body as DbCredentials;

					// Test connection wrapped in `withTunnel` to ensure SSH forwards correctly
					await withTunnel(credentials, async (tunneledCreds) => {
						const db = createConnection(tunneledCreds);
						try {
							// Basic ping to verify credentials and network/tunnel
							await db`SELECT 1`;
						} finally {
							await db.close();
						}
					});

					return Response.json({
						success: true,
						message: "Connection successful",
					});
				} catch (error) {
					console.error("[OmniDump] /api/test-connection error:", error);
					const message =
						error instanceof Error ? error.message : "Unknown error";

					return Response.json(
						{
							success: false,
							error: message,
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
