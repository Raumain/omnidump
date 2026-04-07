import { readFileSync, statSync } from "node:fs";
import { createFileRoute } from "@tanstack/react-router";
import { extractErrorMessage } from "../../lib/errors";

const DUMPS_DIRECTORY = "./exports/dumps";

export const Route = createFileRoute("/api/download-dump" as never)({
	server: {
		handlers: {
			GET: async ({ request }) => {
				try {
					const url = new URL(request.url);
					const filePath = url.searchParams.get("path");

					if (!filePath) {
						return new Response("Missing path parameter.", { status: 400 });
					}

					// Security: Prevent path traversal
					if (filePath.includes("..") || filePath.startsWith("/")) {
						return new Response("Invalid file path.", { status: 400 });
					}

					const fullPath = `${DUMPS_DIRECTORY}/${filePath}`;

					// Check file exists
					try {
						statSync(fullPath);
					} catch {
						return new Response("File not found.", { status: 404 });
					}

					const fileName = filePath.split("/").pop() ?? "dump.sql";
					const fileContent = readFileSync(fullPath);

					return new Response(fileContent, {
						status: 200,
						headers: {
							"Content-Type": "application/sql",
							"Content-Disposition": `attachment; filename="${fileName}"`,
						},
					});
				} catch (error) {
					return new Response(extractErrorMessage(error), { status: 500 });
				}
			},
		},
	},
});
