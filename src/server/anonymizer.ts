import "@tanstack/react-start/server-only";
import { faker } from "@faker-js/faker";

import type {
	AnonymizationMethod,
	AnonymizationOptions,
	AnonymizationRule,
} from "../lib/anonymization-types";

/**
 * Anonymizer class that applies anonymization rules to data values.
 * Uses seeded faker for consistent output (same input -> same fake output within a session).
 */
export class Anonymizer {
	private valueCache: Map<string, unknown> = new Map();
	private seed: number;

	constructor(seed?: number) {
		this.seed = seed ?? Date.now();
		faker.seed(this.seed);
	}

	/**
	 * Get a cache key for a value to ensure consistent anonymization
	 */
	private getCacheKey(
		tableName: string,
		columnName: string,
		value: unknown,
	): string {
		return `${tableName}:${columnName}:${String(value)}`;
	}

	/**
	 * Anonymize a single value based on the method and options
	 */
	anonymize(
		value: unknown,
		method: AnonymizationMethod,
		options?: AnonymizationOptions,
		tableName?: string,
		columnName?: string,
	): unknown {
		// Handle null/undefined values
		if (value === null || value === undefined) {
			return null;
		}

		// Check cache for consistent anonymization
		if (tableName && columnName) {
			const cacheKey = this.getCacheKey(tableName, columnName, value);
			if (this.valueCache.has(cacheKey)) {
				return this.valueCache.get(cacheKey);
			}

			const result = this.applyMethod(value, method, options);
			this.valueCache.set(cacheKey, result);
			return result;
		}

		return this.applyMethod(value, method, options);
	}

	/**
	 * Apply the anonymization method to a value
	 */
	private applyMethod(
		value: unknown,
		method: AnonymizationMethod,
		options?: AnonymizationOptions,
	): unknown {
		switch (method) {
			case "mask":
				return this.mask(String(value), options);
			case "redact":
				return "[REDACTED]";
			case "null":
				return null;
			case "faker:name":
				return faker.person.fullName();
			case "faker:firstName":
				return faker.person.firstName();
			case "faker:lastName":
				return faker.person.lastName();
			case "faker:email":
				return faker.internet.email();
			case "faker:phone":
				return faker.phone.number();
			case "faker:address":
				return faker.location.streetAddress();
			case "faker:city":
				return faker.location.city();
			case "faker:country":
				return faker.location.country();
			case "faker:company":
				return faker.company.name();
			case "faker:text":
				return faker.lorem.sentence({
					min: 3,
					max: options?.maxLength ? Math.ceil(options.maxLength / 6) : 10,
				});
			case "faker:uuid":
				return faker.string.uuid();
			case "faker:number":
				return faker.number.int({
					min: options?.min ?? 0,
					max: options?.max ?? 1000000,
				});
			default:
				return value;
		}
	}

	/**
	 * Mask a string value with asterisks
	 */
	private mask(value: string, options?: AnonymizationOptions): string {
		const maskChar = options?.maskChar ?? "*";
		const preserveStart = options?.preserveStart ?? 0;
		const preserveEnd = options?.preserveEnd ?? 0;

		if (value.length <= preserveStart + preserveEnd) {
			return maskChar.repeat(value.length);
		}

		const start = value.slice(0, preserveStart);
		const end = value.slice(-preserveEnd || value.length);
		const middleLength = value.length - preserveStart - preserveEnd;

		return start + maskChar.repeat(middleLength) + (preserveEnd > 0 ? end : "");
	}

	/**
	 * Anonymize a row of data based on rules
	 */
	anonymizeRow(
		row: Record<string, unknown>,
		tableName: string,
		rules: AnonymizationRule[],
	): Record<string, unknown> {
		const result = { ...row };

		for (const rule of rules) {
			if (rule.tableName !== tableName) continue;
			if (!(rule.columnName in result)) continue;

			result[rule.columnName] = this.anonymize(
				result[rule.columnName],
				rule.method,
				rule.options,
				tableName,
				rule.columnName,
			);
		}

		return result;
	}

	/**
	 * Clear the value cache (useful for testing or when starting a new dump)
	 */
	clearCache(): void {
		this.valueCache.clear();
	}

	/**
	 * Get the seed used for this anonymizer instance
	 */
	getSeed(): number {
		return this.seed;
	}
}

/**
 * Create a new Anonymizer instance with an optional seed
 */
export function createAnonymizer(seed?: number): Anonymizer {
	return new Anonymizer(seed);
}
