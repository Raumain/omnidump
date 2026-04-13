import { DEFAULT_SEED_COUNT, MAX_SEED_COUNT } from "./constants";
import type { ParsedSeedRequestBody, SeedRequestBody } from "./types";

const parseConnectionId = (connectionIdParam: unknown): number => {
	const parsed =
		typeof connectionIdParam === "number"
			? connectionIdParam
			: typeof connectionIdParam === "string"
				? Number(connectionIdParam)
				: Number.NaN;

	if (!Number.isInteger(parsed) || parsed < 1) {
		throw new Error("Invalid connectionId in body.");
	}

	return parsed;
};

const parseTableName = (tableNameParam: unknown): string => {
	if (
		typeof tableNameParam !== "string" ||
		tableNameParam.trim().length === 0
	) {
		throw new Error("Invalid tableName in body.");
	}

	return tableNameParam.trim();
};

const parseSeedCount = (countParam: unknown): number => {
	if (
		countParam === undefined ||
		countParam === null ||
		(typeof countParam === "string" && countParam.trim() === "")
	) {
		return DEFAULT_SEED_COUNT;
	}

	const parsed =
		typeof countParam === "number"
			? countParam
			: typeof countParam === "string"
				? Number(countParam)
				: Number.NaN;

	if (!Number.isInteger(parsed) || parsed < 1) {
		throw new Error(
			"Invalid count in body. Must be an integer greater than 0.",
		);
	}

	return Math.min(parsed, MAX_SEED_COUNT);
};

export const parseSeedRequestBody = (
	body: SeedRequestBody,
): ParsedSeedRequestBody => {
	return {
		connectionId: parseConnectionId(body.connectionId),
		tableName: parseTableName(body.tableName),
		count: parseSeedCount(body.count),
	};
};

type ParsedSeedRequestResult =
	| {
			success: true;
			data: ParsedSeedRequestBody;
	  }
	| {
			success: false;
			response: Response;
	  };

export const parseSeedRequest = async (
	request: Request,
): Promise<ParsedSeedRequestResult> => {
	const body = (await request.json().catch(() => ({}))) as SeedRequestBody;

	try {
		return {
			success: true,
			data: parseSeedRequestBody(body),
		};
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Invalid seed request body.";

		return {
			success: false,
			response: Response.json(
				{
					success: false,
					error: message,
				},
				{ status: 400 },
			),
		};
	}
};
