/**
 * Extracts a human-readable error message from an unknown error value.
 * Safely handles Error instances, strings, and unknown types.
 */
export function extractErrorMessage(
	error: unknown,
	fallback = "Unknown error",
): string {
	if (error instanceof Error) {
		return error.message;
	}
	if (typeof error === "string") {
		return error;
	}
	return fallback;
}
