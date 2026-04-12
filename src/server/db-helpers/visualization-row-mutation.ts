import type { Kysely } from "kysely";
import type { DbDriver } from "#/lib/db/connection";
import { extractErrorMessage } from "#/lib/errors";
import { classifyVisualizationColumnKind } from "#/lib/visualization";
import { getPrimaryKeyColumnsForTable } from "./introspection";

export type VisualizationMutationColumn = {
	name: string;
	dataType: string;
	kind: "numeric" | "temporal" | "boolean" | "categorical" | "unknown";
	isNullable: boolean;
	isPrimaryKey: boolean;
	isAutoIncrementing: boolean;
};

export class RowValidationError extends Error {
	readonly fieldErrors: Record<string, string>;

	constructor(message: string, fieldErrors: Record<string, string>) {
		super(message);
		this.name = "RowValidationError";
		this.fieldErrors = fieldErrors;
	}
}

const parseBooleanInput = (value: string): boolean | null => {
	const normalized = value.trim().toLowerCase();

	if (
		normalized === "true" ||
		normalized === "1" ||
		normalized === "yes" ||
		normalized === "y"
	) {
		return true;
	}

	if (
		normalized === "false" ||
		normalized === "0" ||
		normalized === "no" ||
		normalized === "n"
	) {
		return false;
	}

	return null;
};

const parseColumnValue = (
	column: VisualizationMutationColumn,
	rawValue: unknown,
): unknown => {
	if (
		rawValue === undefined ||
		rawValue === null ||
		(typeof rawValue === "string" && rawValue.trim() === "")
	) {
		return null;
	}

	if (column.kind === "numeric") {
		const parsed =
			typeof rawValue === "number" ? rawValue : Number(String(rawValue).trim());
		if (!Number.isFinite(parsed)) {
			throw new Error(`${column.name} must be numeric.`);
		}
		return parsed;
	}

	if (column.kind === "boolean") {
		const parsed = parseBooleanInput(String(rawValue));
		if (parsed === null) {
			throw new Error(`${column.name} must be boolean.`);
		}
		return parsed;
	}

	return String(rawValue);
};

export const parseRowValues = (
	columns: VisualizationMutationColumn[],
	rawValues: Record<string, unknown>,
	options: {
		allowPrimaryKeyWrite: boolean;
		requireAtLeastOneValue: boolean;
	},
): Record<string, unknown> => {
	const fieldErrors: Record<string, string> = {};
	const parsedValues: Record<string, unknown> = {};
	const columnByName = new Map(columns.map((column) => [column.name, column]));

	for (const [key, rawValue] of Object.entries(rawValues)) {
		const column = columnByName.get(key);

		if (!column) {
			fieldErrors[key] = "Unknown column.";
			continue;
		}

		if (!options.allowPrimaryKeyWrite && column.isPrimaryKey) {
			fieldErrors[key] = "Primary key columns cannot be edited.";
			continue;
		}

		try {
			parsedValues[key] = parseColumnValue(column, rawValue);
		} catch (error) {
			fieldErrors[key] = extractErrorMessage(error, "Invalid value.");
		}
	}

	if (Object.keys(fieldErrors).length > 0) {
		throw new RowValidationError("Validation failed.", fieldErrors);
	}

	if (
		options.requireAtLeastOneValue &&
		Object.keys(parsedValues).length === 0
	) {
		throw new RowValidationError("No editable values were provided.", {});
	}

	return parsedValues;
};

export const parseRowIdentity = (
	primaryKeyColumns: string[],
	columns: VisualizationMutationColumn[],
	rowIdentity: Record<string, unknown>,
): Record<string, unknown> => {
	if (primaryKeyColumns.length === 0) {
		throw new Error("This table has no primary key. Row update is disabled.");
	}

	const identity: Record<string, unknown> = {};
	const fieldErrors: Record<string, string> = {};
	const columnByName = new Map(columns.map((column) => [column.name, column]));

	for (const pkColumn of primaryKeyColumns) {
		const column = columnByName.get(pkColumn);
		if (!column) {
			fieldErrors[pkColumn] = "Missing primary key metadata.";
			continue;
		}

		const rawValue = rowIdentity[pkColumn];
		if (rawValue === undefined || rawValue === null || rawValue === "") {
			fieldErrors[pkColumn] = "Missing primary key value.";
			continue;
		}

		try {
			const parsed = parseColumnValue(column, rawValue);
			if (parsed === null) {
				fieldErrors[pkColumn] = "Primary key value cannot be null.";
				continue;
			}
			identity[pkColumn] = parsed;
		} catch (error) {
			fieldErrors[pkColumn] = extractErrorMessage(
				error,
				"Invalid primary key.",
			);
		}
	}

	if (Object.keys(fieldErrors).length > 0) {
		throw new RowValidationError("Invalid row identity.", fieldErrors);
	}

	return identity;
};

export const loadTableMutationContext = async (
	db: Kysely<unknown>,
	driver: DbDriver,
	tableName: string,
) => {
	const introspectedTables = await db.introspection.getTables();
	const matchingTable = introspectedTables.find(
		(table) => table.name === tableName,
	);

	if (!matchingTable) {
		throw new Error(`Unknown table: ${tableName}`);
	}

	const primaryKeyColumnsSet = await getPrimaryKeyColumnsForTable(
		db,
		driver,
		matchingTable.name,
	);
	const columns: VisualizationMutationColumn[] = matchingTable.columns.map(
		(column) => ({
			name: column.name,
			dataType: column.dataType,
			kind: classifyVisualizationColumnKind(column.dataType),
			isNullable: column.isNullable,
			isPrimaryKey: primaryKeyColumnsSet.has(column.name),
			isAutoIncrementing: Boolean(
				(column as { isAutoIncrementing?: boolean }).isAutoIncrementing,
			),
		}),
	);

	return {
		columns,
		primaryKeyColumns: Array.from(primaryKeyColumnsSet),
	};
};
