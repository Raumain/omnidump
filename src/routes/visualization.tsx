import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
	type ColumnDef,
	type ColumnFiltersState,
	type ColumnPinningState,
	type ColumnSizingInfoState,
	type ColumnSizingState,
	flexRender,
	getCoreRowModel,
	type SortingState,
	useReactTable,
	type VisibilityState,
} from "@tanstack/react-table";
import { Database, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Loader from "#/components/Loader";
import { NoConnectionState } from "#/components/NoConnectionState";
import { Button } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { useActiveConnection } from "#/hooks/use-active-connection";
import {
	visualizationMetadataQueryKey,
	visualizationTableDataQueryKey,
} from "#/lib/query-keys";
import { VISUALIZATION_LIMITS } from "#/lib/visualization";
import {
	buildDefaultColumnSizing,
	clampVisualizationColumnWidth,
	getPreferredColumnWidth,
} from "#/routes/_visualization/column-layout";
import { useVisualizationInlineRowState } from "#/routes/_visualization/inline-row-state";
import { getVisualizationPinnedStyle } from "#/routes/_visualization/pinning-style";
import {
	normalizeFilters,
	parseFiltersFromSearch,
	parseSortingFromSearch,
	serializeFilters,
	serializeSorting,
	type VisualizationSearch,
	validateVisualizationSearch,
} from "#/routes/_visualization/search-state";
import {
	createVisualizationPreferencesStorageKey,
	loadVisualizationTablePreferences,
	saveVisualizationTablePreferences,
	type VisualizationTableDensity,
} from "#/routes/_visualization/table-preferences";
import {
	formatCellValue,
	getStableRowKey,
	type TableRow,
} from "#/routes/_visualization/table-utils";
import {
	createVisualizationTableRowFn,
	getVisualizationMetadataFn,
	getVisualizationTableDataFn,
	updateVisualizationTableRowFn,
	type VisualizationMetadataSuccess,
	type VisualizationRowMutationResult,
	type VisualizationTableDataResult,
	type VisualizationTableDataSuccess,
} from "#/server/visualization-fns";

export const Route = createFileRoute("/visualization")({
	validateSearch: validateVisualizationSearch,
	component: VisualizationPage,
});

function useDebouncedValue<T>(value: T, delayMs: number): T {
	const [debouncedValue, setDebouncedValue] = useState(value);

	useEffect(() => {
		const timeout = setTimeout(() => {
			setDebouncedValue(value);
		}, delayMs);

		return () => clearTimeout(timeout);
	}, [value, delayMs]);

	return debouncedValue;
}

const getDefaultColumnPinning = (
	primaryKeyColumns: string[],
): ColumnPinningState => ({
	left: primaryKeyColumns,
	right: ["__actions"],
});

const toCellText = (value: unknown): string => formatCellValue(value);

function VisualizationPage() {
	const search = Route.useSearch();
	const navigate = useNavigate({ from: "/visualization" });
	const { activeConnection, isHydrated } = useActiveConnection();
	const [selectedTableName, setSelectedTableName] = useState(search.t ?? "");
	const [pageIndex, setPageIndex] = useState(search.p ?? 0);
	const [pageSize, setPageSize] = useState<number>(
		search.ps ?? VISUALIZATION_LIMITS.defaultTablePageSize,
	);
	const [sorting, setSorting] = useState<SortingState>(() =>
		parseSortingFromSearch(search.s),
	);
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(() =>
		parseFiltersFromSearch(search.f),
	);
	const [density, setDensity] =
		useState<VisualizationTableDensity>("comfortable");
	const [isControlsCollapsed, setIsControlsCollapsed] = useState(false);
	const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
	const [columnPinning, setColumnPinning] = useState<ColumnPinningState>({
		left: [],
		right: ["__actions"],
	});
	const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
	const [columnSizingInfo, setColumnSizingInfo] =
		useState<ColumnSizingInfoState>({
			startOffset: null,
			startSize: null,
			deltaOffset: null,
			deltaPercentage: null,
			isResizingColumn: false,
			columnSizingStart: [],
		});
	const loadedPreferencesSignatureRef = useRef<string | null>(null);
	const {
		isCreatingRow,
		newRowValues,
		newRowError,
		newRowFieldErrors,
		editingRowIndex,
		editingRowIdentity,
		editingValues,
		editingError,
		editingFieldErrors,
		resetInlineStates,
		openCreateRow,
		cancelCreateRow,
		openInlineEditRow,
		cancelInlineEditRow,
		clearCreateMutationError,
		clearUpdateMutationError,
		applyCreateMutationError,
		applyUpdateMutationError,
		setCreateFieldValue,
		setEditFieldValue,
	} = useVisualizationInlineRowState();

	useEffect(() => {
		setSelectedTableName((previous) => search.t ?? previous);
		setPageIndex((previous) => search.p ?? previous);
		setPageSize(
			(previous) =>
				search.ps ?? previous ?? VISUALIZATION_LIMITS.defaultTablePageSize,
		);
		setSorting(parseSortingFromSearch(search.s));
		setColumnFilters(parseFiltersFromSearch(search.f));
	}, [search.t, search.p, search.ps, search.s, search.f]);

	const metadataQuery = useQuery({
		queryKey: visualizationMetadataQueryKey(activeConnection?.id),
		queryFn: async (): Promise<VisualizationMetadataSuccess> => {
			if (!activeConnection) {
				throw new Error("No active connection.");
			}

			const result = await getVisualizationMetadataFn({
				data: {
					connection: activeConnection,
					includeRowEstimates: true,
				},
			});

			if (!result.success) {
				throw new Error(result.error);
			}

			return result;
		},
		enabled: Boolean(activeConnection),
		staleTime: 30_000,
	});

	const tables = metadataQuery.data?.tables ?? [];

	useEffect(() => {
		if (metadataQuery.isLoading) {
			return;
		}

		if (tables.length === 0) {
			if (selectedTableName !== "") {
				setSelectedTableName("");
				resetInlineStates();
			}
			return;
		}

		const stillExists = tables.some(
			(table) => table.tableName === selectedTableName,
		);
		if (!stillExists) {
			setSelectedTableName(tables[0]?.tableName ?? "");
			resetInlineStates();
		}
	}, [metadataQuery.isLoading, tables, selectedTableName, resetInlineStates]);

	const selectedTable = useMemo(
		() => tables.find((table) => table.tableName === selectedTableName) ?? null,
		[tables, selectedTableName],
	);

	const normalizedFilters = useMemo(
		() => normalizeFilters(columnFilters),
		[columnFilters],
	);

	useEffect(() => {
		const nextSearch: VisualizationSearch = {
			t: selectedTableName || undefined,
			p: pageIndex,
			ps: pageSize,
			s: serializeSorting(sorting),
			f: serializeFilters(columnFilters),
		};
		const currentSearch: VisualizationSearch = {
			t: search.t,
			p: search.p,
			ps: search.ps,
			s: search.s,
			f: search.f,
		};

		if (JSON.stringify(nextSearch) === JSON.stringify(currentSearch)) {
			return;
		}

		void navigate({
			search: () => nextSearch,
			replace: true,
		});
	}, [
		selectedTableName,
		pageIndex,
		pageSize,
		sorting,
		columnFilters,
		search.t,
		search.p,
		search.ps,
		search.s,
		search.f,
		navigate,
	]);

	const debouncedFilters = useDebouncedValue(normalizedFilters, 250);

	const extractMutationErrors = (
		error: unknown,
	): { message: string; fieldErrors: Record<string, string> } => {
		if (error instanceof Error) {
			const maybeError = error as Error & {
				fieldErrors?: Record<string, string>;
			};
			return {
				message: maybeError.message,
				fieldErrors: maybeError.fieldErrors ?? {},
			};
		}

		return {
			message: "Unexpected mutation error.",
			fieldErrors: {},
		};
	};

	const createRowMutation = useMutation({
		mutationFn: async (values: Record<string, string>) => {
			if (!activeConnection || !selectedTableName) {
				throw new Error("No active table context.");
			}

			const result: VisualizationRowMutationResult =
				await createVisualizationTableRowFn({
					data: {
						connection: activeConnection,
						tableName: selectedTableName,
						values,
					},
				});

			if (!result.success) {
				const error = new Error(result.error) as Error & {
					fieldErrors?: Record<string, string>;
				};
				error.fieldErrors = result.fieldErrors;
				throw error;
			}

			return result;
		},
		onSuccess: async () => {
			cancelCreateRow();
			await tableDataQuery.refetch();
		},
		onError: (error) => {
			const parsed = extractMutationErrors(error);
			applyCreateMutationError(parsed.message, parsed.fieldErrors);
		},
	});

	const updateRowMutation = useMutation({
		mutationFn: async (values: Record<string, string>) => {
			if (!activeConnection || !selectedTableName || !editingRowIdentity) {
				throw new Error("No row selected for update.");
			}

			const result: VisualizationRowMutationResult =
				await updateVisualizationTableRowFn({
					data: {
						connection: activeConnection,
						tableName: selectedTableName,
						rowIdentity: editingRowIdentity,
						values,
					},
				});

			if (!result.success) {
				const error = new Error(result.error) as Error & {
					fieldErrors?: Record<string, string>;
				};
				error.fieldErrors = result.fieldErrors;
				throw error;
			}

			return result;
		},
		onSuccess: async () => {
			cancelInlineEditRow();
			await tableDataQuery.refetch();
		},
		onError: (error) => {
			const parsed = extractMutationErrors(error);
			applyUpdateMutationError(parsed.message, parsed.fieldErrors);
		},
	});

	const requestPayload = useMemo(() => {
		if (!selectedTableName) {
			return null;
		}

		return {
			tableName: selectedTableName,
			pageIndex,
			pageSize,
			sorting: sorting.map((sort) => ({
				id: sort.id,
				desc: sort.desc,
			})),
			filters: debouncedFilters,
		};
	}, [selectedTableName, pageIndex, pageSize, sorting, debouncedFilters]);

	const tableDataQuery = useQuery<VisualizationTableDataSuccess>({
		queryKey: visualizationTableDataQueryKey(
			activeConnection?.id,
			requestPayload,
		),
		queryFn: async (): Promise<VisualizationTableDataSuccess> => {
			if (!activeConnection || !requestPayload) {
				throw new Error("Table data request is not ready.");
			}

			const result: VisualizationTableDataResult =
				await getVisualizationTableDataFn({
					data: {
						connection: activeConnection,
						request: requestPayload,
					},
				});

			if (!result.success) {
				throw new Error(result.error);
			}

			return result;
		},
		enabled:
			Boolean(activeConnection) &&
			Boolean(requestPayload) &&
			!metadataQuery.isLoading,
		placeholderData: (previousData) => previousData,
		staleTime: 5_000,
		retry: 1,
	});
	const activeColumns = tableDataQuery.data?.columns ?? [];
	const primaryKeyColumnNames = useMemo(
		() =>
			activeColumns
				.filter((column) => column.isPrimaryKey)
				.map((column) => column.name),
		[activeColumns],
	);
	const createEditableColumns = useMemo(
		() => activeColumns.filter((column) => !column.isAutoIncrementing),
		[activeColumns],
	);
	const updateEditableColumns = useMemo(
		() =>
			activeColumns.filter(
				(column) => !column.isPrimaryKey && !column.isAutoIncrementing,
			),
		[activeColumns],
	);
	const rowIdentities = tableDataQuery.data?.rowIdentities ?? [];
	const isMutatingRow =
		createRowMutation.isPending || updateRowMutation.isPending;
	const createEditableColumnNames = useMemo(
		() => new Set(createEditableColumns.map((column) => column.name)),
		[createEditableColumns],
	);
	const updateEditableColumnNames = useMemo(
		() => new Set(updateEditableColumns.map((column) => column.name)),
		[updateEditableColumns],
	);
	const defaultColumnSizing = useMemo(
		() =>
			buildDefaultColumnSizing(
				activeColumns.map((column) => ({
					name: column.name,
					dataType: column.dataType,
					kind: column.kind,
				})),
			),
		[activeColumns],
	);
	const preferenceKey = useMemo(() => {
		if (!activeConnection?.id || !selectedTableName) {
			return null;
		}

		return createVisualizationPreferencesStorageKey({
			connectionId: String(activeConnection.id),
			tableName: selectedTableName,
		});
	}, [activeConnection?.id, selectedTableName]);
	const columnsSignature = useMemo(
		() => activeColumns.map((column) => column.name).join("|"),
		[activeColumns],
	);

	useEffect(() => {
		if (!preferenceKey || columnsSignature.length === 0) {
			return;
		}

		const nextSignature = `${preferenceKey}|${columnsSignature}`;
		if (loadedPreferencesSignatureRef.current === nextSignature) {
			return;
		}

		loadedPreferencesSignatureRef.current = nextSignature;
		const loaded = loadVisualizationTablePreferences({
			storage: window.localStorage,
			key: preferenceKey,
			columnNames: activeColumns.map((column) => column.name),
		});
		const fallbackPinning = getDefaultColumnPinning(primaryKeyColumnNames);
		setDensity(loaded.density);
		setIsControlsCollapsed(loaded.isControlsCollapsed);
		setColumnVisibility(loaded.columnVisibility);
		setColumnPinning({
			left:
				loaded.columnPinning.left.length > 0
					? loaded.columnPinning.left
					: fallbackPinning.left,
			right:
				loaded.columnPinning.right.length > 0
					? loaded.columnPinning.right
					: fallbackPinning.right,
		});
		setColumnSizing({
			...defaultColumnSizing,
			...Object.fromEntries(
				Object.entries(loaded.columnSizing).map(([key, value]) => [
					key,
					clampVisualizationColumnWidth(value),
				]),
			),
		});
	}, [
		preferenceKey,
		columnsSignature,
		activeColumns,
		primaryKeyColumnNames,
		defaultColumnSizing,
	]);

	useEffect(() => {
		if (!preferenceKey || columnsSignature.length === 0) {
			return;
		}

		saveVisualizationTablePreferences({
			storage: window.localStorage,
			key: preferenceKey,
			preferences: {
				density,
				isControlsCollapsed,
				isFocusMode: false,
				columnSizing,
				columnVisibility,
				columnPinning: {
					left: columnPinning.left ?? [],
					right: columnPinning.right ?? [],
				},
			},
		});
	}, [
		preferenceKey,
		columnsSignature,
		density,
		isControlsCollapsed,
		columnSizing,
		columnVisibility,
		columnPinning,
	]);

	const handleOpenCreateRow = useCallback(() => {
		openCreateRow(createEditableColumns);
	}, [openCreateRow, createEditableColumns]);

	const handleOpenInlineEditRow = useCallback(
		(rowIndex: number, row: TableRow) => {
			openInlineEditRow({
				rowIndex,
				row,
				rowIdentities,
				updateEditableColumns,
			});
		},
		[openInlineEditRow, rowIdentities, updateEditableColumns],
	);

	const submitCreateRow = useCallback(() => {
		clearCreateMutationError();
		createRowMutation.mutate(newRowValues);
	}, [clearCreateMutationError, createRowMutation, newRowValues]);

	const submitInlineEditRow = useCallback(() => {
		if (editingRowIdentity) {
			clearUpdateMutationError();
			updateRowMutation.mutate(editingValues);
		}
	}, [
		clearUpdateMutationError,
		editingRowIdentity,
		editingValues,
		updateRowMutation,
	]);

	useEffect(() => {
		if (editingRowIndex === null) {
			return;
		}

		const rowCount = tableDataQuery.data?.rows.length ?? 0;
		if (editingRowIndex >= rowCount) {
			cancelInlineEditRow();
		}
	}, [editingRowIndex, tableDataQuery.data?.rows.length, cancelInlineEditRow]);

	const tableColumns = useMemo<ColumnDef<TableRow>[]>(() => {
		const dataColumns = (tableDataQuery.data?.columns ?? []).map((column) => ({
			id: column.name,
			accessorFn: (row: TableRow) => row[column.name],
			size: getPreferredColumnWidth({
				name: column.name,
				dataType: column.dataType,
				kind: column.kind,
			}),
			minSize: 80,
			maxSize: 560,
			header: () => {
				const currentSort = sorting.find((sort) => sort.id === column.name);
				const sortIndicator = currentSort ? (currentSort.desc ? "▼" : "▲") : "";

				return (
					<button
						type="button"
						className="w-full text-left font-black uppercase tracking-widest text-xs text-muted-foreground hover:text-primary"
						onClick={() => {
							setPageIndex(0);
							setSorting((previous) => {
								const existing = previous.find(
									(sort) => sort.id === column.name,
								);

								if (!existing) {
									return [{ id: column.name, desc: false }];
								}

								if (existing.desc === false) {
									return [{ id: column.name, desc: true }];
								}

								return [];
							});
						}}
					>
						{column.name} {sortIndicator}
					</button>
				);
			},
		}));

		const actionColumn: ColumnDef<TableRow> = {
			id: "__actions",
			size: 120,
			minSize: 110,
			maxSize: 180,
			header: () => (
				<span className="text-xs font-black uppercase tracking-widest text-muted-foreground">
					Actions
				</span>
			),
		};

		return [...dataColumns, actionColumn];
	}, [tableDataQuery.data?.columns, sorting]);

	const table = useReactTable({
		data: (tableDataQuery.data?.rows ?? []) as TableRow[],
		columns: tableColumns,
		state: {
			sorting,
			columnFilters,
			columnVisibility,
			columnPinning,
			columnSizing,
			columnSizingInfo,
			pagination: {
				pageIndex,
				pageSize,
			},
		},
		getCoreRowModel: getCoreRowModel(),
		onSortingChange: setSorting,
		onColumnFiltersChange: setColumnFilters,
		onColumnVisibilityChange: setColumnVisibility,
		onColumnPinningChange: setColumnPinning,
		onColumnSizingChange: setColumnSizing,
		onColumnSizingInfoChange: setColumnSizingInfo,
		manualSorting: true,
		manualFiltering: true,
		manualPagination: true,
		columnResizeMode: "onChange",
		enableColumnResizing: true,
		enableColumnPinning: true,
	});

	const resetTableLayout = useCallback(() => {
		setDensity("comfortable");
		setColumnVisibility({});
		setColumnSizing(defaultColumnSizing);
		setColumnPinning(getDefaultColumnPinning(primaryKeyColumnNames));
	}, [defaultColumnSizing, primaryKeyColumnNames]);

	if (!isHydrated) {
		return <Loader />;
	}

	if (!activeConnection) {
		return (
			<NoConnectionState
				title="No active connection."
				message="Select a saved connection to browse table data."
			/>
		);
	}

	const pageCount = tableDataQuery.data?.pageCount ?? 0;
	const totalRows = tableDataQuery.data?.totalRows ?? 0;
	const tableRows = tableDataQuery.data?.rows ?? [];
	const tableColumnCount = table.getVisibleLeafColumns().length;
	const canEditRows = updateEditableColumns.length > 0;
	const activeColumnsByName = new Map(
		activeColumns.map((column) => [column.name, column]),
	);
	const controlsVisible = !isControlsCollapsed;
	const densityCellClass =
		density === "compact" ? "px-2 py-1 text-xs" : "px-2.5 py-2 text-sm";

	const getPinnedCellStyle = (
		column: ReturnType<typeof table.getVisibleLeafColumns>[number],
	) => {
		const pinned = column.getIsPinned();
		return getVisualizationPinnedStyle({
			pinned,
			offset:
				pinned === "left"
					? column.getStart("left")
					: pinned === "right"
						? column.getAfter("right")
						: 0,
			surface: "body",
		});
	};

	return (
		<section className="mx-auto flex min-h-screen w-full flex-col gap-6 p-6 md:p-10 font-mono">
			<div className="bg-card border-2 border-border p-6 shadow-hardware w-full">
				<h1 className="text-3xl font-black uppercase tracking-wider text-primary">
					DATA_VISUALIZATION
				</h1>
				<div className="flex flex-wrap items-center gap-3 mt-2">
					<div className="w-3 h-3 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(255,150,0,0.8)]" />
					<p className="text-sm font-bold uppercase tracking-widest text-primary">
						Server-side table explorer
					</p>
					<span className="text-muted-foreground">|</span>
					<p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
						Filters + sorting + pagination executed on server
					</p>
				</div>
			</div>

			<div
				className={`grid grid-cols-1 gap-6 ${controlsVisible ? "lg:grid-cols-[320px_1fr]" : ""}`}
			>
				{controlsVisible ? (
					<div className="bg-card border-2 border-border shadow-hardware p-5 space-y-4">
						<div className="flex items-center justify-between border-b-2 border-border pb-3">
							<h2 className="font-black uppercase tracking-wider text-primary">
								Table controls
							</h2>
							<Button
								type="button"
								size="icon-sm"
								variant="ghost"
								onClick={() => {
									void metadataQuery.refetch();
									void tableDataQuery.refetch();
								}}
							>
								<RefreshCw className="w-4 h-4" />
							</Button>
						</div>

						<div className="space-y-2">
							<Label>Table</Label>
							<Select
								value={selectedTableName || undefined}
								onValueChange={(value) => {
									setSelectedTableName(value);
									setPageIndex(0);
									setColumnFilters([]);
									setSorting([]);
									resetInlineStates();
								}}
								disabled={metadataQuery.isLoading || tables.length === 0}
							>
								<SelectTrigger className="w-full rounded-none border-2 border-border bg-card font-bold uppercase">
									<SelectValue placeholder="Select table" />
								</SelectTrigger>
								<SelectContent className="rounded-none border-2 border-border bg-card font-mono">
									{tables.map((tableInfo) => (
										<SelectItem
											key={tableInfo.tableName}
											value={tableInfo.tableName}
											className="uppercase text-xs font-bold"
										>
											<div className="flex w-full items-center justify-between gap-3">
												<span>{tableInfo.tableName}</span>
												<span className="text-[10px] text-muted-foreground">
													{tableInfo.rowCountEstimate ?? "?"} rows
												</span>
											</div>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2">
							<Label>Page size</Label>
							<Select
								value={String(pageSize)}
								onValueChange={(value) => {
									const parsed = Number(value);
									if (!Number.isFinite(parsed)) {
										return;
									}
									setPageIndex(0);
									setPageSize(
										Math.min(parsed, VISUALIZATION_LIMITS.maxTablePageSize),
									);
								}}
							>
								<SelectTrigger className="w-full rounded-none border-2 border-border bg-card font-bold uppercase">
									<SelectValue />
								</SelectTrigger>
								<SelectContent className="rounded-none border-2 border-border bg-card font-mono">
									{[25, 50, 100, 200].map((size) => (
										<SelectItem
											key={size}
											value={String(size)}
											className="uppercase text-xs font-bold"
										>
											{size}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="border-2 border-border bg-secondary p-3">
							<p className="text-xs font-bold uppercase text-muted-foreground">
								Current table
							</p>
							<p className="mt-1 text-sm font-black uppercase text-primary">
								{selectedTable?.tableName ?? "none"}
							</p>
							<p className="mt-2 text-xs font-bold uppercase text-muted-foreground">
								Columns: {selectedTable?.columns.length ?? 0}
							</p>
							<p className="text-xs font-bold uppercase text-muted-foreground">
								Total rows: {totalRows}
							</p>
						</div>
					</div>
				) : null}

				<div className="bg-card border-2 border-border shadow-hardware p-5 space-y-4 min-w-0">
					<div className="flex items-center justify-between border-b-2 border-border pb-3">
						<h2 className="font-black uppercase tracking-wider text-primary flex items-center gap-2">
							<Database className="w-5 h-5" />
							Table data
						</h2>
						<div className="flex flex-wrap items-center gap-2">
							<div className="text-xs font-bold uppercase text-muted-foreground">
								{totalRows} rows total
							</div>
							<div className="text-xs font-bold uppercase text-muted-foreground">
								Page {pageCount === 0 ? 0 : pageIndex + 1} / {pageCount}
							</div>
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={pageIndex === 0}
								onClick={() =>
									setPageIndex((previous) => Math.max(0, previous - 1))
								}
							>
								Prev
							</Button>
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={
									pageCount === 0 || pageIndex >= Math.max(pageCount - 1, 0)
								}
								onClick={() =>
									setPageIndex((previous) =>
										Math.min(previous + 1, Math.max(pageCount - 1, 0)),
									)
								}
							>
								Next
							</Button>
							<Button
								type="button"
								variant="accent"
								size="sm"
								disabled={
									createEditableColumns.length === 0 ||
									isCreatingRow ||
									editingRowIndex !== null ||
									isMutatingRow
								}
								onClick={handleOpenCreateRow}
							>
								New row
							</Button>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => setIsControlsCollapsed((previous) => !previous)}
							>
								{controlsVisible ? "Hide controls" : "Show controls"}
							</Button>
						</div>
					</div>

					<div className="flex flex-wrap items-center gap-2 border-2 border-border bg-secondary px-3 py-2">
						<div className="text-[11px] font-bold uppercase text-muted-foreground">
							Density
						</div>
						<Button
							type="button"
							size="xs"
							variant={density === "comfortable" ? "accent" : "outline"}
							onClick={() => setDensity("comfortable")}
						>
							Comfortable
						</Button>
						<Button
							type="button"
							size="xs"
							variant={density === "compact" ? "accent" : "outline"}
							onClick={() => setDensity("compact")}
						>
							Compact
						</Button>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button type="button" size="xs" variant="outline">
									Columns
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent
								align="start"
								className="rounded-none border-2 border-border bg-card font-mono min-w-55"
							>
								<DropdownMenuLabel className="uppercase text-[11px] font-bold">
									Toggle columns
								</DropdownMenuLabel>
								<DropdownMenuSeparator />
								{activeColumns.map((column) => (
									<DropdownMenuCheckboxItem
										key={`visible-${column.name}`}
										checked={
											table.getColumn(column.name)?.getIsVisible() ?? true
										}
										onCheckedChange={(checked) =>
											table
												.getColumn(column.name)
												?.toggleVisibility(Boolean(checked))
										}
										className="uppercase text-[11px] font-bold"
									>
										{column.name}
									</DropdownMenuCheckboxItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>
						<Button
							type="button"
							size="xs"
							variant="outline"
							onClick={resetTableLayout}
						>
							Reset layout
						</Button>
					</div>

					{metadataQuery.isLoading ? (
						<div className="p-4 border-2 border-border bg-secondary text-sm font-bold uppercase">
							Loading table metadata...
						</div>
					) : null}

					{metadataQuery.error ? (
						<div className="p-4 border-2 border-destructive bg-destructive/10 text-sm font-bold">
							{metadataQuery.error instanceof Error
								? metadataQuery.error.message
								: "Failed to load metadata."}
						</div>
					) : null}

					{!metadataQuery.isLoading && tables.length === 0 ? (
						<div className="p-6 border-2 border-border text-sm font-bold uppercase text-muted-foreground">
							This database has no tables.
						</div>
					) : null}

					{requestPayload && tableDataQuery.error ? (
						<div className="p-4 border-2 border-destructive bg-destructive/10 text-sm font-bold">
							{tableDataQuery.error instanceof Error
								? tableDataQuery.error.message
								: "Failed to load table data."}
						</div>
					) : null}
					{editingError ? (
						<div className="p-4 border-2 border-destructive bg-destructive/10 text-sm font-bold whitespace-normal wrap-break-word">
							{editingError}
						</div>
					) : null}

					<div className="border-2 border-border overflow-auto max-h-[calc(100vh-320px)]">
						<table
							className="min-w-full text-sm border-separate border-spacing-0"
							style={{ width: table.getTotalSize() }}
						>
							<thead className="bg-secondary">
								{table.getHeaderGroups().map((headerGroup) => (
									<tr key={headerGroup.id} className="border-b-2 border-border">
										{headerGroup.headers.map((header) => (
											<th
												key={header.id}
												className={`align-top text-left border-r border-border last:border-r-0 sticky top-0 ${densityCellClass} bg-secondary`}
												style={{
													...getVisualizationPinnedStyle({
														pinned: header.column.getIsPinned(),
														offset:
															header.column.getIsPinned() === "left"
																? header.column.getStart("left")
																: header.column.getIsPinned() === "right"
																	? header.column.getAfter("right")
																	: 0,
														surface: "header",
													}),
													width: header.getSize(),
													minWidth: header.column.columnDef.minSize,
													maxWidth: header.column.columnDef.maxSize,
												}}
											>
												<div className="relative">
													{header.isPlaceholder
														? null
														: flexRender(
																header.column.columnDef.header,
																header.getContext(),
															)}
													{header.column.getCanResize() ? (
														<button
															type="button"
															aria-label={`Resize ${header.column.id} column`}
															onMouseDown={header.getResizeHandler()}
															onTouchStart={header.getResizeHandler()}
															className={`absolute right-0 top-0 h-full w-1 cursor-col-resize touch-none bg-border/40 transition-colors hover:bg-primary ${
																header.column.getIsResizing()
																	? "bg-primary"
																	: ""
															}`}
														/>
													) : null}
												</div>
											</th>
										))}
									</tr>
								))}
								{tableDataQuery.data ? (
									<tr className="border-b border-border">
										{table.getVisibleLeafColumns().map((visibleColumn) => {
											if (visibleColumn.id === "__actions") {
												return (
													<th
														key="filter-__actions"
														className={`border-r border-border last:border-r-0 bg-card ${densityCellClass}`}
														style={{
															...getPinnedCellStyle(visibleColumn),
															width: visibleColumn.getSize(),
														}}
													/>
												);
											}

											const currentFilter =
												(columnFilters.find(
													(filter) => filter.id === visibleColumn.id,
												)?.value as string | undefined) ?? "";

											return (
												<th
													key={`filter-${visibleColumn.id}`}
													className={`border-r border-border last:border-r-0 bg-card ${densityCellClass}`}
													style={{
														...getPinnedCellStyle(visibleColumn),
														width: visibleColumn.getSize(),
													}}
												>
													<Input
														type="text"
														value={currentFilter}
														onChange={(event) => {
															const nextValue = event.target.value;
															setPageIndex(0);
															setColumnFilters((previous) => {
																const withoutCurrent = previous.filter(
																	(filter) => filter.id !== visibleColumn.id,
																);

																if (nextValue.trim() === "") {
																	return withoutCurrent;
																}

																return [
																	...withoutCurrent,
																	{
																		id: visibleColumn.id,
																		value: nextValue,
																	},
																];
															});
														}}
														className={`rounded-none border border-border bg-secondary text-xs font-bold ${
															density === "compact" ? "h-7" : "h-8"
														}`}
														placeholder="Filter..."
													/>
												</th>
											);
										})}
									</tr>
								) : null}
							</thead>
							<tbody>
								{isCreatingRow && tableDataQuery.data ? (
									<tr className="border-b-2 border-primary bg-primary/5">
										{table.getVisibleLeafColumns().map((visibleColumn) => {
											if (visibleColumn.id === "__actions") {
												return (
													<td
														key="create-actions"
														className={`border-r border-border last:border-r-0 align-top ${densityCellClass}`}
														style={{
															...getPinnedCellStyle(visibleColumn),
															width: visibleColumn.getSize(),
														}}
													>
														<div className="flex flex-col gap-1">
															<div className="flex items-center gap-1">
																<Button
																	type="button"
																	size="xs"
																	variant="accent"
																	disabled={isMutatingRow}
																	onClick={submitCreateRow}
																>
																	{isMutatingRow ? "Saving..." : "Save"}
																</Button>
																<Button
																	type="button"
																	size="xs"
																	variant="outline"
																	disabled={isMutatingRow}
																	onClick={cancelCreateRow}
																>
																	Cancel
																</Button>
															</div>
															{newRowError ? (
																<p className="text-[11px] font-bold text-destructive">
																	{newRowError}
																</p>
															) : null}
														</div>
													</td>
												);
											}

											const column = activeColumnsByName.get(visibleColumn.id);
											if (!column) {
												return null;
											}

											const isEditableColumn = createEditableColumnNames.has(
												column.name,
											);

											return (
												<td
													key={`create-${column.name}`}
													className={`border-r border-border last:border-r-0 align-top ${densityCellClass}`}
													style={{
														...getPinnedCellStyle(visibleColumn),
														width: visibleColumn.getSize(),
													}}
												>
													{isEditableColumn ? (
														<div className="space-y-1">
															<Input
																type="text"
																value={newRowValues[column.name] ?? ""}
																onChange={(event) =>
																	setCreateFieldValue(
																		column.name,
																		event.target.value,
																	)
																}
																className={`rounded-none border border-border bg-card text-xs font-bold ${
																	density === "compact" ? "h-7" : "h-8"
																}`}
																placeholder={column.dataType}
																disabled={isMutatingRow}
															/>
															{newRowFieldErrors[column.name] ? (
																<p className="text-[11px] font-bold text-destructive">
																	{newRowFieldErrors[column.name]}
																</p>
															) : null}
														</div>
													) : (
														<span className="text-[11px] font-bold uppercase text-muted-foreground">
															auto
														</span>
													)}
												</td>
											);
										})}
									</tr>
								) : null}

								{tableDataQuery.isLoading ? (
									<tr>
										<td
											colSpan={tableColumnCount}
											className="p-6 text-center text-sm font-bold uppercase text-primary"
										>
											Loading rows...
										</td>
									</tr>
								) : tableRows.length === 0 && !isCreatingRow ? (
									<tr>
										<td
											colSpan={tableColumnCount}
											className="p-6 text-center text-sm font-bold uppercase text-muted-foreground"
										>
											No rows for current filters.
										</td>
									</tr>
								) : (
									tableRows.map((row, rowIndex) => {
										const identity = rowIdentities[rowIndex];
										const rowKey = getStableRowKey(row, identity);
										const hasEditableIdentity =
											Boolean(identity) &&
											Object.keys(identity ?? {}).length > 0;
										const isEditingThisRow = editingRowIndex === rowIndex;

										return (
											<tr
												key={rowKey}
												className="border-b border-border hover:bg-secondary/40"
											>
												{table.getVisibleLeafColumns().map((visibleColumn) => {
													if (visibleColumn.id === "__actions") {
														return (
															<td
																key={`${rowKey}-actions`}
																className={`border-r border-border last:border-r-0 align-top ${densityCellClass}`}
																style={{
																	...getPinnedCellStyle(visibleColumn),
																	width: visibleColumn.getSize(),
																}}
															>
																{isEditingThisRow ? (
																	<div className="flex items-center gap-1">
																		<Button
																			type="button"
																			size="xs"
																			variant="accent"
																			disabled={isMutatingRow}
																			onClick={submitInlineEditRow}
																		>
																			{isMutatingRow ? "Saving..." : "Save"}
																		</Button>
																		<Button
																			type="button"
																			size="xs"
																			variant="outline"
																			disabled={isMutatingRow}
																			onClick={cancelInlineEditRow}
																		>
																			Cancel
																		</Button>
																	</div>
																) : (
																	<Button
																		type="button"
																		size="xs"
																		variant="outline"
																		disabled={
																			!canEditRows ||
																			!hasEditableIdentity ||
																			isCreatingRow ||
																			isMutatingRow
																		}
																		onClick={() =>
																			handleOpenInlineEditRow(rowIndex, row)
																		}
																	>
																		Edit
																	</Button>
																)}
															</td>
														);
													}

													const column = activeColumnsByName.get(
														visibleColumn.id,
													);
													if (!column) {
														return null;
													}

													const isEditableCell =
														isEditingThisRow &&
														updateEditableColumnNames.has(column.name);

													return (
														<td
															key={`${rowKey}-${column.name}`}
															className={`border-r border-border last:border-r-0 align-top ${densityCellClass}`}
															style={{
																...getPinnedCellStyle(visibleColumn),
																width: visibleColumn.getSize(),
															}}
														>
															{isEditableCell ? (
																<div className="space-y-1">
																	<Input
																		type="text"
																		value={editingValues[column.name] ?? ""}
																		onChange={(event) =>
																			setEditFieldValue(
																				column.name,
																				event.target.value,
																			)
																		}
																		className={`rounded-none border border-border bg-card text-xs font-bold ${
																			density === "compact" ? "h-7" : "h-8"
																		}`}
																		placeholder={column.dataType}
																		disabled={isMutatingRow}
																	/>
																	{editingFieldErrors[column.name] ? (
																		<p className="text-[11px] font-bold text-destructive">
																			{editingFieldErrors[column.name]}
																		</p>
																	) : null}
																</div>
															) : (
																<span
																	className="block truncate whitespace-nowrap"
																	title={toCellText(row[column.name])}
																>
																	{toCellText(row[column.name])}
																</span>
															)}
														</td>
													);
												})}
											</tr>
										);
									})
								)}
							</tbody>
						</table>
					</div>
				</div>
			</div>
		</section>
	);
}
