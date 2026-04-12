export type SeedRequestBody = {
	connectionId?: unknown;
	tableName?: unknown;
	count?: unknown;
};

export type ParsedSeedRequestBody = {
	connectionId: number;
	tableName: string;
	count: number;
};

export type SeedableColumn = {
	name: string;
	dataType: string;
	isAutoIncrementing?: boolean;
};

export type ForeignKeyConstraint = {
	columnName: string;
	referencedTableName: string;
	referencedColumnName: string;
};
