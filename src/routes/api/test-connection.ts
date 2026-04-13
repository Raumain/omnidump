import { createFileRoute } from "@tanstack/react-router";
import type { DbCredentials } from "../../lib/db/connection";
import { extractErrorMessage } from "../../lib/errors";
import { withTunnel } from "../../server/ssh-tunnel";

export const Route = createFileRoute("/api/test-connection" as never)({
	server: {
		handlers: {
			POST: async ({ request }) => {
				try {
					const { createConnection } = await import("../../lib/db/connection");
					const body = await request.json();
					const credentials = body as DbCredentials;

					// Test connection wrapped in `withTunnel` to ensure SSH forwards correctly
					await withTunnel(credentials, async (tunneledCreds) => {
						const db = createConnection(tunneledCreds);
						let querySucceeded = false;
						let queryError: unknown = null;

						try {
							// Basic ping to verify credentials and network/tunnel
							await db`SELECT 1`;
							querySucceeded = true;
						} catch (error) {
							queryError = error;
						}

						try {
							await db.close();
						} catch (closeError) {
							if (!querySucceeded && queryError === null) {
								queryError = closeError;
							}
							if (querySucceeded) {
								console.warn(
									"[OmniDump] Ignoring close error after successful ping:",
									closeError,
								);
							}
						}

						if (queryError) {
							throw queryError;
						}
					});

					return Response.json({
						success: true,
						message: "Connection successful",
					});
				} catch (error) {
					console.error("[OmniDump] /api/test-connection error:", error);

					return Response.json(
						{
							success: false,
							error: extractErrorMessage(error),
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
