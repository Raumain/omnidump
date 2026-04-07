import { createServerFn } from "@tanstack/react-start";

import type {
	AnonymizationOptions,
	AnonymizationProfile,
	AnonymizationRule,
	CreateProfileInput,
	ProfileRow,
	RuleRow,
	SaveRulesInput,
} from "../lib/anonymization-types";
import type { Success } from "../lib/result";
import { db } from "./internal-db";

/**
 * Get all anonymization profiles for a connection
 */
export const getAnonymizationProfilesFn = createServerFn({ method: "GET" })
	.inputValidator((connectionId: number) => connectionId)
	.handler(async ({ data: connectionId }): Promise<AnonymizationProfile[]> => {
		const rows = db
			.query(
				`
			SELECT 
				p.id,
				p.connection_id,
				p.name,
				p.created_at,
				p.updated_at,
				COUNT(r.id) as rule_count
			FROM anonymization_profiles p
			LEFT JOIN anonymization_rules r ON r.profile_id = p.id
			WHERE p.connection_id = ?
			GROUP BY p.id
			ORDER BY p.updated_at DESC
		`,
			)
			.all(connectionId) as Array<ProfileRow & { rule_count: number }>;

		return rows.map((row) => ({
			id: row.id,
			connectionId: row.connection_id,
			name: row.name,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
			ruleCount: row.rule_count,
		}));
	});

/**
 * Get a single anonymization profile by ID
 */
export const getAnonymizationProfileFn = createServerFn({ method: "GET" })
	.inputValidator((profileId: number) => profileId)
	.handler(
		async ({ data: profileId }): Promise<AnonymizationProfile | null> => {
			const row = db
				.query(
					`
			SELECT 
				p.id,
				p.connection_id,
				p.name,
				p.created_at,
				p.updated_at,
				COUNT(r.id) as rule_count
			FROM anonymization_profiles p
			LEFT JOIN anonymization_rules r ON r.profile_id = p.id
			WHERE p.id = ?
			GROUP BY p.id
		`,
				)
				.get(profileId) as (ProfileRow & { rule_count: number }) | null;

			if (!row) return null;

			return {
				id: row.id,
				connectionId: row.connection_id,
				name: row.name,
				createdAt: row.created_at,
				updatedAt: row.updated_at,
				ruleCount: row.rule_count,
			};
		},
	);

/**
 * Create a new anonymization profile
 */
export const createAnonymizationProfileFn = createServerFn({ method: "POST" })
	.inputValidator((input: CreateProfileInput) => input)
	.handler(async ({ data: input }): Promise<AnonymizationProfile> => {
		const now = new Date().toISOString();

		const result = db
			.query(
				`
			INSERT INTO anonymization_profiles (connection_id, name, created_at, updated_at)
			VALUES (?, ?, ?, ?)
			RETURNING id, connection_id, name, created_at, updated_at
		`,
			)
			.get(input.connectionId, input.name, now, now) as ProfileRow;

		return {
			id: result.id,
			connectionId: result.connection_id,
			name: result.name,
			createdAt: result.created_at,
			updatedAt: result.updated_at,
			ruleCount: 0,
		};
	});

/**
 * Update an anonymization profile name
 */
export const updateAnonymizationProfileFn = createServerFn({ method: "POST" })
	.inputValidator((input: { profileId: number; name: string }) => input)
	.handler(async ({ data: input }): Promise<AnonymizationProfile | null> => {
		const now = new Date().toISOString();

		db.query(
			`
			UPDATE anonymization_profiles 
			SET name = ?, updated_at = ?
			WHERE id = ?
		`,
		).run(input.name, now, input.profileId);

		return getAnonymizationProfileFn({ data: input.profileId });
	});

/**
 * Delete an anonymization profile and its rules
 */
export const deleteAnonymizationProfileFn = createServerFn({ method: "POST" })
	.inputValidator((profileId: number) => profileId)
	.handler(async ({ data: profileId }): Promise<Success> => {
		// Rules are deleted via CASCADE
		db.query("DELETE FROM anonymization_profiles WHERE id = ?").run(profileId);

		return { success: true };
	});

/**
 * Get all rules for a profile
 */
export const getAnonymizationRulesFn = createServerFn({ method: "GET" })
	.inputValidator((profileId: number) => profileId)
	.handler(async ({ data: profileId }): Promise<AnonymizationRule[]> => {
		const rows = db
			.query(
				`
			SELECT id, profile_id, table_name, column_name, method, options
			FROM anonymization_rules
			WHERE profile_id = ?
			ORDER BY table_name, column_name
		`,
			)
			.all(profileId) as RuleRow[];

		return rows.map((row) => ({
			id: row.id,
			profileId: row.profile_id,
			tableName: row.table_name,
			columnName: row.column_name,
			method: row.method as AnonymizationRule["method"],
			options: row.options
				? (JSON.parse(row.options) as AnonymizationOptions)
				: undefined,
		}));
	});

/**
 * Save rules for a profile (replaces all existing rules)
 */
export const saveAnonymizationRulesFn = createServerFn({ method: "POST" })
	.inputValidator((input: SaveRulesInput) => input)
	.handler(async ({ data: input }): Promise<Success> => {
		// Delete existing rules
		db.query("DELETE FROM anonymization_rules WHERE profile_id = ?").run(
			input.profileId,
		);

		// Insert new rules
		const insertStmt = db.query(`
			INSERT INTO anonymization_rules (profile_id, table_name, column_name, method, options)
			VALUES (?, ?, ?, ?, ?)
		`);

		for (const rule of input.rules) {
			insertStmt.run(
				input.profileId,
				rule.tableName,
				rule.columnName,
				rule.method,
				rule.options ? JSON.stringify(rule.options) : null,
			);
		}

		// Update profile timestamp
		db.query(
			"UPDATE anonymization_profiles SET updated_at = ? WHERE id = ?",
		).run(new Date().toISOString(), input.profileId);

		return { success: true };
	});

/**
 * Duplicate a profile with all its rules
 */
export const duplicateAnonymizationProfileFn = createServerFn({
	method: "POST",
})
	.inputValidator((input: { profileId: number; newName: string }) => input)
	.handler(async ({ data: input }): Promise<AnonymizationProfile | null> => {
		const originalProfile = await getAnonymizationProfileFn({
			data: input.profileId,
		});

		if (!originalProfile) return null;

		// Create new profile
		const newProfile = await createAnonymizationProfileFn({
			data: {
				connectionId: originalProfile.connectionId,
				name: input.newName,
			},
		});

		// Copy rules
		const rules = await getAnonymizationRulesFn({ data: input.profileId });

		if (rules.length > 0) {
			await saveAnonymizationRulesFn({
				data: {
					profileId: newProfile.id,
					rules: rules.map((r) => ({
						tableName: r.tableName,
						columnName: r.columnName,
						method: r.method,
						options: r.options,
					})),
				},
			});
		}

		return getAnonymizationProfileFn({ data: newProfile.id });
	});
