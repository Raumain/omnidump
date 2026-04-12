import { useCallback, useState } from "react";

import type {
	TableRow,
	TableRowIdentity,
} from "#/routes/_visualization/table-utils";

type EditableColumn = {
	name: string;
};

type FieldErrors = Record<string, string>;

const clearFieldError = (
	columnName: string,
	previous: FieldErrors,
): FieldErrors => {
	if (!previous[columnName]) {
		return previous;
	}

	const next = { ...previous };
	delete next[columnName];
	return next;
};

export function useVisualizationInlineRowState() {
	const [isCreatingRow, setIsCreatingRow] = useState(false);
	const [newRowValues, setNewRowValues] = useState<Record<string, string>>({});
	const [newRowError, setNewRowError] = useState<string | null>(null);
	const [newRowFieldErrors, setNewRowFieldErrors] = useState<FieldErrors>({});
	const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);
	const [editingRowIdentity, setEditingRowIdentity] =
		useState<TableRowIdentity | null>(null);
	const [editingValues, setEditingValues] = useState<Record<string, string>>(
		{},
	);
	const [editingError, setEditingError] = useState<string | null>(null);
	const [editingFieldErrors, setEditingFieldErrors] = useState<FieldErrors>({});

	const resetInlineStates = useCallback(() => {
		setIsCreatingRow(false);
		setNewRowValues({});
		setNewRowError(null);
		setNewRowFieldErrors({});
		setEditingRowIndex(null);
		setEditingRowIdentity(null);
		setEditingValues({});
		setEditingError(null);
		setEditingFieldErrors({});
	}, []);

	const openCreateRow = useCallback(
		(createEditableColumns: EditableColumn[]) => {
			const initialValues: Record<string, string> = {};

			for (const column of createEditableColumns) {
				initialValues[column.name] = "";
			}

			setIsCreatingRow(true);
			setEditingRowIndex(null);
			setEditingRowIdentity(null);
			setEditingValues({});
			setEditingError(null);
			setEditingFieldErrors({});
			setNewRowValues(initialValues);
			setNewRowError(null);
			setNewRowFieldErrors({});
		},
		[],
	);

	const cancelCreateRow = useCallback(() => {
		setIsCreatingRow(false);
		setNewRowValues({});
		setNewRowError(null);
		setNewRowFieldErrors({});
	}, []);

	const openInlineEditRow = useCallback(
		({
			rowIndex,
			row,
			rowIdentities,
			updateEditableColumns,
		}: {
			rowIndex: number;
			row: TableRow;
			rowIdentities: TableRowIdentity[];
			updateEditableColumns: EditableColumn[];
		}) => {
			const identity = rowIdentities[rowIndex];

			if (!identity || Object.keys(identity).length === 0) {
				setEditingError(
					"This row cannot be edited because no primary key identity was detected.",
				);
				return;
			}

			const initialValues: Record<string, string> = {};

			for (const column of updateEditableColumns) {
				const rawValue = row[column.name];
				initialValues[column.name] =
					rawValue === null || rawValue === undefined ? "" : String(rawValue);
			}

			setIsCreatingRow(false);
			setNewRowValues({});
			setNewRowError(null);
			setNewRowFieldErrors({});
			setEditingRowIndex(rowIndex);
			setEditingRowIdentity(identity);
			setEditingValues(initialValues);
			setEditingError(null);
			setEditingFieldErrors({});
		},
		[],
	);

	const cancelInlineEditRow = useCallback(() => {
		setEditingRowIndex(null);
		setEditingRowIdentity(null);
		setEditingValues({});
		setEditingError(null);
		setEditingFieldErrors({});
	}, []);

	const clearCreateMutationError = useCallback(() => {
		setNewRowError(null);
		setNewRowFieldErrors({});
	}, []);

	const clearUpdateMutationError = useCallback(() => {
		setEditingError(null);
		setEditingFieldErrors({});
	}, []);

	const applyCreateMutationError = useCallback(
		(message: string, fieldErrors: FieldErrors) => {
			setNewRowError(message);
			setNewRowFieldErrors(fieldErrors);
		},
		[],
	);

	const applyUpdateMutationError = useCallback(
		(message: string, fieldErrors: FieldErrors) => {
			setEditingError(message);
			setEditingFieldErrors(fieldErrors);
		},
		[],
	);

	const setCreateFieldValue = useCallback(
		(columnName: string, value: string) => {
			setNewRowValues((previous) => ({
				...previous,
				[columnName]: value,
			}));
			setNewRowError(null);
			setNewRowFieldErrors((previous) => clearFieldError(columnName, previous));
		},
		[],
	);

	const setEditFieldValue = useCallback((columnName: string, value: string) => {
		setEditingValues((previous) => ({
			...previous,
			[columnName]: value,
		}));
		setEditingError(null);
		setEditingFieldErrors((previous) => clearFieldError(columnName, previous));
	}, []);

	return {
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
	};
}
