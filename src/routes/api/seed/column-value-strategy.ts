import { faker } from "@faker-js/faker";

import type { SeedableColumn } from "./types";

export const shouldSkipColumn = (column: {
	name: string;
	isAutoIncrementing?: boolean;
}): boolean => {
	return (
		column.name.toLowerCase() === "id" || column.isAutoIncrementing === true
	);
};

const getValueForColumn = (column: {
	name: string;
	dataType: string;
}): unknown => {
	const columnName = column.name.toLowerCase();
	const dataType = column.dataType.toLowerCase();

	if (columnName.endsWith("_id")) {
		if (dataType.includes("uuid")) {
			return faker.string.uuid();
		}

		if (
			dataType.includes("integer") ||
			dataType.includes("int") ||
			dataType.includes("numeric")
		) {
			return faker.number.int({ min: 1, max: 100 });
		}
	}

	if (columnName.includes("first") && columnName.includes("name")) {
		return faker.person.firstName();
	}

	if (columnName.includes("last") && columnName.includes("name")) {
		return faker.person.lastName();
	}

	if (columnName.includes("email")) {
		return faker.internet.email();
	}

	if (columnName.includes("name")) {
		return faker.company.name();
	}

	if (columnName.includes("city")) {
		return faker.location.city();
	}

	if (columnName.includes("country")) {
		return faker.location.country();
	}

	if (columnName.includes("zip") || columnName.includes("postal")) {
		return faker.location.zipCode();
	}

	if (columnName.includes("address") || columnName.includes("street")) {
		return faker.location.streetAddress();
	}

	if (columnName.includes("phone")) {
		return faker.phone.number();
	}

	if (columnName.includes("url") || columnName.includes("website")) {
		return faker.internet.url();
	}

	if (columnName.includes("company")) {
		return faker.company.name();
	}

	if (columnName.includes("description") || columnName.includes("bio")) {
		return faker.lorem.sentences(2);
	}

	if (
		dataType.includes("varchar") ||
		dataType.includes("text") ||
		dataType.includes("string")
	) {
		return faker.lorem.word();
	}

	if (
		dataType.includes("integer") ||
		dataType.includes("int") ||
		dataType.includes("numeric")
	) {
		return faker.number.int({ max: 1000 });
	}

	if (dataType.includes("boolean") || dataType.includes("bool")) {
		return faker.datatype.boolean();
	}

	if (dataType.includes("timestamp") || dataType.includes("date")) {
		return faker.date.recent().toISOString();
	}

	return faker.lorem.word();
};

const pickRandomValue = (values: unknown[]): unknown => {
	const index = faker.number.int({ min: 0, max: values.length - 1 });
	return values[index];
};

export const getColumnSeedValue = (
	column: SeedableColumn,
	foreignKeyValuesByColumn: ReadonlyMap<string, unknown[]>,
	enumValuesByColumn: ReadonlyMap<string, string[]> = new Map(),
): unknown => {
	const foreignKeyValues = foreignKeyValuesByColumn.get(column.name);

	if (foreignKeyValues) {
		if (foreignKeyValues.length === 0) {
			throw new Error(
				`Cannot seed ${column.name}: referenced key list is empty for foreign key column.`,
			);
		}

		return pickRandomValue(foreignKeyValues);
	}

	const enumValues = enumValuesByColumn.get(column.name);

	if (enumValues) {
		if (enumValues.length === 0) {
			throw new Error(
				`Cannot seed ${column.name}: enum value list is empty for enum column.`,
			);
		}

		return pickRandomValue(enumValues);
	}

	return getValueForColumn(column);
};
