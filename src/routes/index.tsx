import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type SubmitEvent, useEffect, useState } from "react";

import { useActiveConnection } from "@/hooks/use-active-connection.tsx";
import type { DbCredentials } from "@/lib/db/connection";
import { savedConnectionsQueryKey } from "@/lib/query-keys.ts";
import {
	deleteConnectionFn,
	getSavedConnectionsFn,
	type SavedConnection,
	saveConnectionFn,
	updateConnectionFn,
} from "@/server/connection-fns";

import { ConnectionCard } from "./_index/components/ConnectionCard";
import { ConnectionForm } from "./_index/components/ConnectionForm";

export const Route = createFileRoute("/")({ component: App });

function App() {
	const queryClient = useQueryClient();
	const { activeConnection, setActiveConnection } = useActiveConnection();
	const [connectionName, setConnectionName] = useState("");
	const [credentials, setCredentials] = useState<DbCredentials>({
		driver: "postgres",
		host: "",
		port: undefined,
		user: "",
		password: "",
		database: "",
		useSsh: false,
		sshHost: "",
		sshPort: 22,
		sshUser: "",
		sshPrivateKey: "",
		sshPassword: "",
	});
	const [status, setStatus] = useState<{
		success: boolean;
		message: string;
	} | null>(null);
	const [editingConnectionId, setEditingConnectionId] = useState<number | null>(
		null,
	);

	useEffect(() => {
		if (!status) return;

		const timer = setTimeout(() => {
			setStatus(null);
		}, 2000);

		return () => clearTimeout(timer);
	}, [status]);

	const savedConnectionsQuery = useQuery({
		queryKey: savedConnectionsQueryKey,
		queryFn: () => getSavedConnectionsFn(),
	});

	const saveConnectionMutation = useMutation({
		mutationFn: saveConnectionFn,
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: savedConnectionsQueryKey,
			});
		},
	});

	const deleteConnectionMutation = useMutation({
		mutationFn: deleteConnectionFn,
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: savedConnectionsQueryKey,
			});
		},
	});

	const testConnectionMutation = useMutation({
		mutationFn: async (credentials: DbCredentials) => {
			const response = await fetch("/api/test-connection", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(credentials),
			});
			const data = await response.json();
			if (!data.success) {
				throw new Error(data.error);
			}
			return data;
		},
	});

	const updateConnectionMutation = useMutation({
		mutationFn: updateConnectionFn,
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: savedConnectionsQueryKey,
			});
		},
	});

	const savedConnections: SavedConnection[] = savedConnectionsQuery.data
		?.success
		? savedConnectionsQuery.data.connections
		: [];

	useEffect(() => {
		if (!activeConnection) {
			return;
		}

		const driver = activeConnection.driver;
		const normalizedDriver: DbCredentials["driver"] =
			driver === "mysql" || driver === "sqlite" || driver === "postgres"
				? driver
				: "postgres";

		setConnectionName(activeConnection.name);
		setCredentials({
			driver: normalizedDriver,
			host: activeConnection.host ?? "",
			port: activeConnection.port ?? undefined,
			user: activeConnection.user ?? "",
			password: activeConnection.password ?? "",
			database: activeConnection.database_name ?? "",
			useSsh: Boolean(activeConnection.use_ssh),
			sshHost: activeConnection.ssh_host ?? "",
			sshPort: activeConnection.ssh_port ?? 22,
			sshUser: activeConnection.ssh_user ?? "",
			sshPrivateKey: activeConnection.ssh_private_key ?? "",
		});
	}, [activeConnection]);

	const handleSelectConnection = (connection: SavedConnection) => {
		const driver = connection.driver;
		const normalizedDriver: DbCredentials["driver"] =
			driver === "mysql" || driver === "sqlite" || driver === "postgres"
				? driver
				: "postgres";

		setActiveConnection(connection);
		setEditingConnectionId(connection.id);

		setConnectionName(connection.name);
		setCredentials({
			driver: normalizedDriver,
			host: connection.host ?? "",
			port: connection.port ?? undefined,
			user: connection.user ?? "",
			password: connection.password ?? "",
			database: connection.database_name ?? "",
			useSsh: Boolean(connection.use_ssh),
			sshHost: connection.ssh_host ?? "",
			sshPort: connection.ssh_port ?? 22,
			sshUser: connection.ssh_user ?? "",
			sshPrivateKey: connection.ssh_private_key ?? "",
		});
		setStatus(null);
	};

	const handleDeleteConnection = (id: number) => {
		deleteConnectionMutation.mutate(
			{ data: { id } },
			{
				onSuccess: (response) => {
					if (response.success) {
						if (activeConnection?.id === id) {
							setActiveConnection(null);
						}
						if (editingConnectionId === id) {
							setEditingConnectionId(null);
						}

						setStatus({ success: true, message: "Connection deleted." });
						return;
					}

					setStatus({ success: false, message: response.error });
				},
			},
		);
	};

	const handleSaveConnection = () => {
		if (connectionName.trim() === "") {
			setStatus({ success: false, message: "Connection alias is required." });
			return;
		}

		const connectionData = {
			name: connectionName,
			...credentials,
			useSsh: credentials.useSsh ?? false,
			sshHost: credentials.useSsh ? credentials.sshHost : undefined,
			sshPort: credentials.useSsh ? credentials.sshPort : undefined,
			sshUser: credentials.useSsh ? credentials.sshUser : undefined,
			sshPrivateKey: credentials.useSsh ? credentials.sshPrivateKey : undefined,
		};

		if (editingConnectionId !== null) {
			updateConnectionMutation.mutate(
				{
					data: {
						id: editingConnectionId,
						...connectionData,
					},
				},
				{
					onSuccess: (response) => {
						if (response.success) {
							setStatus({ success: true, message: "Connection updated." });
							return;
						}

						setStatus({ success: false, message: response.error });
					},
				},
			);
		} else {
			saveConnectionMutation.mutate(
				{
					data: connectionData,
				},
				{
					onSuccess: (response) => {
						if (response.success) {
							setStatus({ success: true, message: "Connection saved." });
							return;
						}

						setStatus({ success: false, message: response.error });
					},
				},
			);
		}
	};

	const handleNewConnection = () => {
		setEditingConnectionId(null);
		setConnectionName("");
		setCredentials({
			driver: "postgres",
			host: "",
			port: undefined,
			user: "",
			password: "",
			database: "",
			useSsh: false,
			sshHost: "",
			sshPort: 22,
			sshUser: "",
			sshPrivateKey: "",
			sshPassword: "",
		});
		setStatus(null);
	};

	const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
		event.preventDefault();

		testConnectionMutation.mutate(credentials, {
			onSuccess: (response) => {
				if (response.success) {
					setStatus({ success: true, message: response.message });
					return;
				}
				setStatus({ success: false, message: response.error });
			},
		});
	};

	return (
		<section className="mx-auto flex w-full flex-col gap-6 font-mono p-6 md:p-10 pb-12">
			<div className="border-b-2 border-border pb-4 mb-8">
				<h1 className="text-3xl font-black uppercase tracking-widest text-primary">
					SYSTEM_PATCHBAY
				</h1>
				<p className="text-sm font-bold uppercase tracking-widest text-muted-foreground mt-2">
					Global Routing & Connection Matrix
				</p>
			</div>

			<div className="w-full">
				<div className="flex items-center justify-between mb-6">
					<h2 className="text-xl font-black uppercase tracking-widest text-foreground">
						Active Nodes ({savedConnections.length})
					</h2>
				</div>

				{savedConnectionsQuery.isLoading ? (
					<div className="flex justify-center p-12 border-2 border-dashed border-border bg-card">
						<p className="text-sm font-bold uppercase animate-pulse tracking-widest text-primary">
							Scanning network...
						</p>
					</div>
				) : null}

				{!savedConnectionsQuery.isLoading && savedConnections.length === 0 ? (
					<div className="flex justify-center p-12 border-2 border-dashed border-border bg-card">
						<p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
							NO NODES DETECTED. INITIALIZE A NEW CONNECTION BELOW.
						</p>
					</div>
				) : null}

				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
					{savedConnections.map((connection) => (
						<ConnectionCard
							key={connection.id}
							connection={connection}
							isActive={activeConnection?.id === connection.id}
							isDeleting={deleteConnectionMutation.isPending}
							onSelect={handleSelectConnection}
							onDelete={handleDeleteConnection}
						/>
					))}
				</div>
			</div>

			<ConnectionForm
				connectionName={connectionName}
				credentials={credentials}
				editingConnectionId={editingConnectionId}
				status={status}
				isTesting={testConnectionMutation.isPending}
				isSaving={saveConnectionMutation.isPending}
				isUpdating={updateConnectionMutation.isPending}
				onConnectionNameChange={setConnectionName}
				onCredentialsChange={setCredentials}
				onNewConnection={handleNewConnection}
				onSaveConnection={handleSaveConnection}
				onTestConnection={handleSubmit}
			/>
		</section>
	);
}
