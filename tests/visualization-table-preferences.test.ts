import { describe, expect, it } from "vitest";

import {
	createVisualizationPreferencesStorageKey,
	loadVisualizationTablePreferences,
	saveVisualizationTablePreferences,
} from "../src/routes/_visualization/table-preferences";

type MemoryStorage = {
	getItem: (key: string) => string | null;
	setItem: (key: string, value: string) => void;
	removeItem: (key: string) => void;
};

const createMemoryStorage = (): MemoryStorage => {
	const values = new Map<string, string>();

	return {
		getItem: (key) => values.get(key) ?? null,
		setItem: (key, value) => {
			values.set(key, value);
		},
		removeItem: (key) => {
			values.delete(key);
		},
	};
};

describe("visualization table preferences", () => {
	it("builds a stable key per connection and table", () => {
		expect(
			createVisualizationPreferencesStorageKey({
				connectionId: "conn-1",
				tableName: "users",
			}),
		).toBe("omnidump:visualization:table:conn-1:users");
	});

	it("saves then reloads normalized preferences", () => {
		const storage = createMemoryStorage();
		const key = createVisualizationPreferencesStorageKey({
			connectionId: "conn-1",
			tableName: "users",
		});
		const columnNames = ["id", "email", "metadata"];

		saveVisualizationTablePreferences({
			storage,
			key,
			preferences: {
				density: "compact",
				isControlsCollapsed: true,
				isFocusMode: false,
				columnSizing: { id: 100, email: 260, unknown: 180 },
				columnVisibility: { metadata: false, unknown: true },
				columnPinning: { left: ["id"], right: ["unknown"] },
			},
		});

		const loaded = loadVisualizationTablePreferences({
			storage,
			key,
			columnNames,
		});

		expect(loaded).toEqual({
			density: "compact",
			isControlsCollapsed: true,
			isFocusMode: false,
			columnSizing: { id: 100, email: 260 },
			columnVisibility: { metadata: false },
			columnPinning: { left: ["id"], right: [] },
		});
	});

	it("returns defaults for invalid JSON payloads", () => {
		const storage = createMemoryStorage();
		const key = createVisualizationPreferencesStorageKey({
			connectionId: "conn-2",
			tableName: "orders",
		});
		storage.setItem(key, "{invalid");

		const loaded = loadVisualizationTablePreferences({
			storage,
			key,
			columnNames: ["id"],
		});

		expect(loaded).toEqual({
			density: "comfortable",
			isControlsCollapsed: false,
			isFocusMode: false,
			columnSizing: {},
			columnVisibility: {},
			columnPinning: { left: [], right: [] },
		});
	});
});
