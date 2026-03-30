import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Link,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TerminalSquare } from "lucide-react";
import { useEffect } from "react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../components/ui/select.tsx";
import { Toaster } from "../components/ui/sonner";
import {
	ActiveConnectionProvider,
	useActiveConnection,
} from "../hooks/use-active-connection.tsx";
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";
import TanStackQueryProvider from "../integrations/tanstack-query/root-provider";
import { savedConnectionsQueryKey } from "../lib/query-keys.ts";
import { getSavedConnectionsFn } from "../server/connection-fns.ts";
import appCss from "../styles.css?url";

interface MyRouterContext {
	queryClient: QueryClient;
}

const THEME_INIT_SCRIPT = `(function(){try{var stored=window.localStorage.getItem('theme');var mode=(stored==='light'||stored==='dark'||stored==='auto')?stored:'auto';var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=mode==='auto'?(prefersDark?'dark':'light'):mode;var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(resolved);if(mode==='auto'){root.removeAttribute('data-theme')}else{root.setAttribute('data-theme',mode)}root.style.colorScheme=resolved;}catch(e){}})();`;

export const Route = createRootRouteWithContext<MyRouterContext>()({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: "TanStack Start Starter",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
	}),
	component: RootLayout,
	shellComponent: RootDocument,
});

function RootLayout() {
	return (
		<ActiveConnectionProvider>
			<InnerLayout />
		</ActiveConnectionProvider>
	);
}

function InnerLayout() {
	const { activeConnection, setActiveConnection } = useActiveConnection();

	const { data: savedConnectionsResult, isPending } = useQuery({
		queryKey: savedConnectionsQueryKey,
		queryFn: () => getSavedConnectionsFn(),
	});

	const savedConnections = savedConnectionsResult?.success
		? savedConnectionsResult.connections
		: [];

	useEffect(() => {
		if (!activeConnection || isPending) {
			return;
		}

		if (!savedConnectionsResult?.success) {
			return;
		}

		const matchingConnection = savedConnections.find(
			(connection) => String(connection.id) === String(activeConnection.id),
		);

		if (!matchingConnection) {
			console.warn(
				"[OmniDump] Clearing active connection, no match found for ID:",
				activeConnection.id,
				"among:",
				savedConnections.map((c) => c.id),
			);
			setActiveConnection(null);
			return;
		}

		const isSameConnection =
			String(matchingConnection.id) === String(activeConnection.id) &&
			matchingConnection.name === activeConnection.name &&
			matchingConnection.driver === activeConnection.driver &&
			matchingConnection.host === activeConnection.host &&
			matchingConnection.port === activeConnection.port &&
			matchingConnection.user === activeConnection.user &&
			matchingConnection.password === activeConnection.password &&
			matchingConnection.database_name === activeConnection.database_name &&
			matchingConnection.created_at === activeConnection.created_at;

		if (!isSameConnection) {
			setActiveConnection(matchingConnection);
		}
	}, [
		activeConnection,
		savedConnections,
		setActiveConnection,
		isPending,
		savedConnectionsResult?.success,
	]);

	const handleConnectionChange = (idStr: string) => {
		if (idStr === "none") {
			setActiveConnection(null);
			return;
		}
		const id = parseInt(idStr, 10);
		const conn = savedConnections.find((c) => c.id === id);
		if (conn) {
			setActiveConnection(conn);
		}
	};

	return (
		<div className="relative min-h-screen flex flex-col font-mono text-foreground">
			<div className="absolute inset-0 z-[-1] bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#27272a_1px,transparent_1px)] bg-size-[16px_16px] animate-pan-slow opacity-50" />

			<header className="flex items-center justify-between p-4 border-b-4 border-black dark:border-white bg-background z-10 shrink-0">
				<div className="flex items-center gap-6">
					<div className="flex items-center gap-2 font-bold text-xl tracking-tighter uppercase p-2 border-2 border-black dark:border-white bg-orange-500 text-black shadow-hardware dark:shadow-hardware-dark">
						<TerminalSquare className="w-5 h-5 text-black" />
						<span>OMNIDUMP</span>
					</div>

					<nav className="flex items-center gap-3">
						<Link
							to="/"
							className="px-4 py-2 uppercase font-bold text-sm border-2 border-transparent transition-all hover:border-black dark:hover:border-white"
							activeProps={{
								className:
									"!border-black dark:!border-white shadow-hardware dark:shadow-hardware-dark active:translate-x-[2px] active:translate-y-[2px] active:shadow-none bg-zinc-100 text-black dark:bg-zinc-800 dark:text-white rounded-none",
							}}
						>
							Home
						</Link>
						<Link
							to="/schema"
							className="px-4 py-2 uppercase font-bold text-sm border-2 border-transparent transition-all hover:border-black dark:hover:border-white"
							activeProps={{
								className:
									"!border-black dark:!border-white shadow-hardware dark:shadow-hardware-dark active:translate-x-[2px] active:translate-y-[2px] active:shadow-none bg-zinc-100 text-black dark:bg-zinc-800 dark:text-white rounded-none",
							}}
						>
							Schema
						</Link>
						<Link
							to="/import"
							className="px-4 py-2 uppercase font-bold text-sm border-2 border-transparent transition-all hover:border-black dark:hover:border-white"
							activeProps={{
								className:
									"!border-black dark:!border-white shadow-hardware dark:shadow-hardware-dark active:translate-x-[2px] active:translate-y-[2px] active:shadow-none bg-zinc-100 text-black dark:bg-zinc-800 dark:text-white rounded-none",
							}}
						>
							Import
						</Link>
					</nav>
				</div>

				<div className="flex items-center gap-4">
					<div className="flex flex-col items-end mr-2">
						<span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mr-1">
							Active DB
						</span>
						<Select
							value={activeConnection?.id?.toString() || "none"}
							onValueChange={handleConnectionChange}
						>
							<SelectTrigger className="w-50 border-2 border-black dark:border-white rounded-none shadow-hardware dark:shadow-hardware-dark font-bold bg-background text-foreground h-10 uppercase transition-all focus:ring-0 focus:ring-offset-0 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none">
								<SelectValue placeholder="Select Database" />
							</SelectTrigger>
							<SelectContent className="border-2 border-black dark:border-white rounded-none shadow-hardware dark:shadow-hardware-dark font-mono bg-background">
								<SelectItem
									value="none"
									className="rounded-none cursor-pointer focus:bg-zinc-200 dark:focus:bg-zinc-800 font-bold uppercase text-xs"
								>
									No connection
								</SelectItem>
								{savedConnections.map((conn) => (
									<SelectItem
										key={conn.id}
										value={conn.id.toString()}
										className="rounded-none cursor-pointer focus:bg-zinc-200 dark:focus:bg-zinc-800 font-bold uppercase text-xs"
									>
										<div className="flex items-center gap-2">
											<div
												className={`w-2 h-2 rounded-none border border-black dark:border-white ${activeConnection?.id === conn.id ? "bg-orange-500" : "bg-transparent"}`}
											/>
											{conn.name}
										</div>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>
			</header>

			<main className="flex-1 w-full bg-transparent overflow-y-auto p-6 md:p-8 z-10">
				<Outlet />
			</main>
		</div>
	);
}

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				{/* biome-ignore lint/security/noDangerouslySetInnerHtml: theme script needs direct insertion */}
				<script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
				<HeadContent />
			</head>
			<body className="font-sans antialiased wrap-anywhere selection:bg-[rgba(79,184,178,0.24)]">
				<TanStackQueryProvider>
					{children}
					<Toaster />
					<TanStackDevtools
						config={{
							position: "bottom-right",
						}}
						plugins={[
							{
								name: "Tanstack Router",
								render: <TanStackRouterDevtoolsPanel />,
							},
							TanStackQueryDevtools,
						]}
					/>
				</TanStackQueryProvider>
				<Scripts />
			</body>
		</html>
	);
}
