/**
 * Anonymization method types supported by the anonymizer engine
 */
export type AnonymizationMethod =
	| "mask"
	| "redact"
	| "null"
	| "faker:name"
	| "faker:firstName"
	| "faker:lastName"
	| "faker:email"
	| "faker:phone"
	| "faker:address"
	| "faker:city"
	| "faker:country"
	| "faker:company"
	| "faker:text"
	| "faker:uuid"
	| "faker:number";

/**
 * Method-specific options for anonymization
 */
export type AnonymizationOptions = {
	// For mask: character to use for masking (default: '*')
	maskChar?: string;
	// For mask: number of characters to preserve at start
	preserveStart?: number;
	// For mask: number of characters to preserve at end
	preserveEnd?: number;
	// For faker:text: max length of generated text
	maxLength?: number;
	// For faker:number: min/max range
	min?: number;
	max?: number;
};

/**
 * A single anonymization rule for a specific column
 */
export type AnonymizationRule = {
	id?: number;
	profileId: number;
	tableName: string;
	columnName: string;
	method: AnonymizationMethod;
	options?: AnonymizationOptions;
};

/**
 * An anonymization profile that groups rules for a connection
 */
export type AnonymizationProfile = {
	id: number;
	connectionId: number;
	name: string;
	createdAt: string;
	updatedAt: string;
	ruleCount?: number;
};

/**
 * Input for creating a new profile
 */
export type CreateProfileInput = {
	connectionId: number;
	name: string;
};

/**
 * Input for saving rules to a profile
 */
export type SaveRulesInput = {
	profileId: number;
	rules: Array<{
		tableName: string;
		columnName: string;
		method: AnonymizationMethod;
		options?: AnonymizationOptions;
	}>;
};

/**
 * Database row type for profiles
 */
export type ProfileRow = {
	id: number;
	connection_id: number;
	name: string;
	created_at: string;
	updated_at: string;
};

/**
 * Database row type for rules
 */
export type RuleRow = {
	id: number;
	profile_id: number;
	table_name: string;
	column_name: string;
	method: string;
	options: string | null;
};

/**
 * Human-readable labels for anonymization methods
 */
export const ANONYMIZATION_METHOD_LABELS: Record<AnonymizationMethod, string> =
	{
		mask: "Mask (***)",
		redact: "Redact ([REDACTED])",
		null: "Set to NULL",
		"faker:name": "Fake Full Name",
		"faker:firstName": "Fake First Name",
		"faker:lastName": "Fake Last Name",
		"faker:email": "Fake Email",
		"faker:phone": "Fake Phone",
		"faker:address": "Fake Address",
		"faker:city": "Fake City",
		"faker:country": "Fake Country",
		"faker:company": "Fake Company",
		"faker:text": "Fake Text (Lorem)",
		"faker:uuid": "Fake UUID",
		"faker:number": "Fake Number",
	};

/**
 * Get all available anonymization methods
 */
export const ANONYMIZATION_METHODS: AnonymizationMethod[] = Object.keys(
	ANONYMIZATION_METHOD_LABELS,
) as AnonymizationMethod[];
