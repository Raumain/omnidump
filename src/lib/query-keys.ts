export const savedConnectionsQueryKey = ["saved-connections"] as const;

export const visualizationMetadataQueryKey = (
	connectionId: number | undefined,
) => ["visualization", "metadata", connectionId] as const;

export const visualizationDataQueryKey = (
	connectionId: number | undefined,
	query: unknown,
) => ["visualization", "data", connectionId, query] as const;

export const visualizationTableDataQueryKey = (
	connectionId: number | undefined,
	request: unknown,
) => ["visualization", "table-data", connectionId, request] as const;
