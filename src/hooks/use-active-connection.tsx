import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import type { SavedConnection } from "../server/connection-fns";

const ACTIVE_CONNECTION_STORAGE_KEY = "omnidump_active_connection";

type ActiveConnectionContextValue = {
	activeConnection: SavedConnection | null;
	setActiveConnection: (connection: SavedConnection | null) => void;
	isHydrated: boolean; // Indicateur vital pour l'UI
};

const ActiveConnectionContext =
	createContext<ActiveConnectionContextValue | null>(null);

export function ActiveConnectionProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	// 1. État initial strictement à null (Safe pour le serveur)
	const [activeConnection, setActiveConnectionState] =
		useState<SavedConnection | null>(null);
	const [isHydrated, setIsHydrated] = useState(false);

	// 2. Au montage (côté Client uniquement), on lit le LocalStorage
	useEffect(() => {
		try {
			const stored = window.localStorage.getItem(ACTIVE_CONNECTION_STORAGE_KEY);
			if (stored) {
				setActiveConnectionState(JSON.parse(stored) as SavedConnection);
			}
		} catch (error) {
			console.error("[OmniDump] Failed to parse localStorage:", error);
		} finally {
			setIsHydrated(true); // Le client a fini de charger les données
		}
	}, []);

	const setActiveConnection = useCallback(
		(connection: SavedConnection | null) => {
			setActiveConnectionState(connection);

			// Save directly on explicit update rather than through an effect
			// This prevents race conditions during hydration that would accidentally clear storage
			try {
				if (connection) {
					window.localStorage.setItem(
						ACTIVE_CONNECTION_STORAGE_KEY,
						JSON.stringify(connection),
					);
				} else {
					window.localStorage.removeItem(ACTIVE_CONNECTION_STORAGE_KEY);
				}
			} catch (error) {
				console.error("[OmniDump] Failed to save to localStorage:", error);
			}
		},
		[],
	);

	const value = useMemo(
		() => ({ activeConnection, setActiveConnection, isHydrated }),
		[activeConnection, setActiveConnection, isHydrated],
	);

	return (
		<ActiveConnectionContext.Provider value={value}>
			{children}
		</ActiveConnectionContext.Provider>
	);
}

export const useActiveConnection = () => {
	const context = useContext(ActiveConnectionContext);

	if (!context) {
		throw new Error(
			"useActiveConnection must be used within an ActiveConnectionProvider",
		);
	}

	return context;
};
