// @vitest-environment jsdom
import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
	ActiveConnectionProvider,
	useActiveConnection,
} from "../src/hooks/use-active-connection";

const ACTIVE_CONNECTION_STORAGE_KEY = "omnidump_active_connection";

describe("useActiveConnection", () => {
	let latestState: ReturnType<typeof useActiveConnection> | null = null;

	const HookProbe = () => {
		latestState = useActiveConnection();
		return null;
	};

	const renderWithProvider = () => {
		return render(
			<ActiveConnectionProvider>
				<HookProbe />
			</ActiveConnectionProvider>,
		);
	};

	beforeEach(() => {
		latestState = null;
		window.localStorage.clear();
	});

	afterEach(() => {
		window.localStorage.clear();
	});

	test("should restore active connection from local storage on mount", async () => {
		const mockConnection = { id: 1, name: "Test DB", driver: "postgres" };
		window.localStorage.setItem(
			ACTIVE_CONNECTION_STORAGE_KEY,
			JSON.stringify(mockConnection),
		);

		const { unmount } = renderWithProvider();

		await waitFor(() => {
			expect(latestState?.isHydrated).toBe(true);
		});

		expect(latestState?.activeConnection).toEqual(mockConnection as any);
		unmount();
	});

	test("should write to local storage when active connection is set", async () => {
		const { unmount } = renderWithProvider();
		await waitFor(() => {
			expect(latestState?.isHydrated).toBe(true);
		});

		const mockConnection = { id: 2, name: "Test DB 2", driver: "mysql" };

		act(() => {
			latestState?.setActiveConnection(mockConnection as any);
		});

		await waitFor(() => {
			expect(latestState?.activeConnection).toEqual(mockConnection as any);
		});
		const stored = window.localStorage.getItem(ACTIVE_CONNECTION_STORAGE_KEY);
		expect(stored).toBe(JSON.stringify(mockConnection));
		unmount();
	});
});
