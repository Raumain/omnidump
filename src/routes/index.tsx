import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, RefreshCw, Save, Shield, Trash2, Zap } from "lucide-react";
import { type SubmitEvent, useEffect, useState } from "react";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "../components/ui/alert-dialog";
import { Button } from "../components/ui/button";
import { Form, FormControl, FormItem, FormLabel } from "../components/ui/form";
import { Input } from "../components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../components/ui/select";
import { useActiveConnection } from "../hooks/use-active-connection.tsx";
import type { DbCredentials } from "../lib/db/connection";
import { savedConnectionsQueryKey } from "../lib/query-keys.ts";
import {
	deleteConnectionFn,
	getSavedConnectionsFn,
	type SavedConnection,
	saveConnectionFn,
} from "../server/connection-fns";

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

	// Using the new explicit API route because SSH Tunneling functions (like ssh2)
	// sometimes struggle within TanStack Start's generic createServerFn bundle.
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
	};

	const handleDeleteConnection = async (id: number) => {
		deleteConnectionMutation.mutate(
			{ data: { id } },
			{
				onSuccess: (response) => {
					if (response.success) {
						if (activeConnection?.id === id) {
							setActiveConnection(null);
						}

						setStatus({ success: true, message: "Connection deleted." });
						return;
					}

					setStatus({ success: false, message: response.error });
				},
			},
		);
	};

	const handleSaveConnection = async () => {
		if (connectionName.trim() === "") {
			setStatus({ success: false, message: "Connection alias is required." });
			return;
		}

		saveConnectionMutation.mutate(
			{
				data: {
					name: connectionName,
					...credentials,
					useSsh: credentials.useSsh ?? false,
					sshHost: credentials.useSsh ? credentials.sshHost : undefined,
					sshPort: credentials.useSsh ? credentials.sshPort : undefined,
					sshUser: credentials.useSsh ? credentials.sshUser : undefined,
					sshPrivateKey: credentials.useSsh
						? credentials.sshPrivateKey
						: undefined,
				},
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
		<section className="mx-auto flex w-full max-w-6xl flex-col gap-6 font-mono pb-12">
			<div className="border-b-4 border-black dark:border-white pb-4 mb-8">
				<h1 className="text-3xl font-black uppercase tracking-widest text-foreground">
					SYSTEM_PATCHBAY
				</h1>
				<p className="text-sm font-bold uppercase tracking-widest text-zinc-500 mt-2">
					Global Routing & Connection Matrix
				</p>
			</div>

			<div className="w-full">
				<div className="flex items-center justify-between mb-6">
					<h2 className="text-xl font-black uppercase tracking-widest">
						Active Nodes ({savedConnections.length})
					</h2>
				</div>

				{savedConnectionsQuery.isLoading ? (
					<div className="flex justify-center p-12 border-2 border-dashed border-zinc-400 bg-zinc-50 dark:bg-zinc-900">
						<p className="text-sm font-bold uppercase animate-pulse tracking-widest">
							Scanning network...
						</p>
					</div>
				) : null}

				{!savedConnectionsQuery.isLoading && savedConnections.length === 0 ? (
					<div className="flex justify-center p-12 border-2 border-dashed border-zinc-400 bg-zinc-50 dark:bg-zinc-900">
						<p className="text-sm font-bold uppercase tracking-widest text-zinc-500">
							NO NODES DETECTED. INITIALIZE A NEW CONNECTION BELOW.
						</p>
					</div>
				) : null}

				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
					{savedConnections.map((connection) => {
						const isActive = activeConnection?.id === connection.id;
						return (
							<div
								key={connection.id}
								className={`bg-background border-2 border-black dark:border-white p-5 transition-transform hover:-translate-y-1 flex flex-col justify-between h-full group ${isActive ? "shadow-[4px_4px_0px_0px_#f97316] border-orange-500 dark:border-orange-500" : "shadow-hardware dark:shadow-hardware-dark"}`}
							>
								<div>
									<div className="flex items-start justify-between border-b-2 border-zinc-200 dark:border-zinc-800 pb-3 mb-4">
										<div className="flex items-center gap-3">
											<div
												className={`w-3 h-3 rounded-full ${isActive ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse" : "bg-red-500 max-w-[12px] min-w-[12px]"}`}
											/>
											<p
												className="font-black uppercase tracking-widest text-lg truncate"
												title={connection.name}
											>
												{connection.name}
											</p>
										</div>
										<AlertDialog>
											<AlertDialogTrigger asChild>
												<Button
													type="button"
													variant="ghost"
													size="icon"
													aria-label={`Delete ${connection.name}`}
													disabled={deleteConnectionMutation.isPending}
													className="rounded-none hover:bg-red-100 hover:text-red-600 text-zinc-400 h-8 w-8"
												>
													<Trash2 className="w-4 h-4" />
												</Button>
											</AlertDialogTrigger>
											<AlertDialogContent className="rounded-none border-4 border-red-600 shadow-hardware font-mono p-6">
												<AlertDialogHeader>
													<AlertDialogTitle className="text-2xl font-black uppercase text-red-600 flex items-center gap-2">
														<Trash2 className="w-6 h-6" /> Terminate Node?
													</AlertDialogTitle>
													<AlertDialogDescription className="text-foreground font-bold uppercase tracking-widest">
														INITIATE DELETION SEQUENCE FOR NODE:{" "}
														<span className="text-red-600 font-black">
															{connection.name}
														</span>
														?
													</AlertDialogDescription>
												</AlertDialogHeader>
												<AlertDialogFooter className="mt-6">
													<AlertDialogCancel className="rounded-none border-2 border-black dark:border-white shadow-hardware active:translate-x-[2px] active:translate-y-[2px] active:shadow-none font-bold uppercase">
														Cancel
													</AlertDialogCancel>
													<AlertDialogAction
														onClick={() => {
															void handleDeleteConnection(connection.id);
														}}
														className="rounded-none border-2 border-black dark:border-transparent shadow-hardware active:translate-x-[2px] active:translate-y-[2px] active:shadow-none font-bold uppercase bg-red-600 text-white hover:bg-red-700"
													>
														Execute Deletion
													</AlertDialogAction>
												</AlertDialogFooter>
											</AlertDialogContent>
										</AlertDialog>
									</div>

									<div className="space-y-2 mb-6">
										<div className="flex items-center justify-between text-xs font-bold uppercase">
											<span className="text-zinc-500">DRIVER</span>
											<span className="bg-zinc-100 dark:bg-zinc-800 px-2 py-1 border border-zinc-300 dark:border-zinc-700">
												{connection.driver ?? "UNKNOWN"}
											</span>
										</div>
										<div className="flex items-center justify-between text-xs font-bold uppercase">
											<span className="text-zinc-500">HOST</span>
											<span className="truncate max-w-[60%]">
												{connection.host || "LOCALHOST"}
											</span>
										</div>
										{connection.database_name && (
											<div className="flex items-center justify-between text-xs font-bold uppercase">
												<span className="text-zinc-500">DB</span>
												<span className="truncate max-w-[60%]">
													{connection.database_name}
												</span>
											</div>
										)}
										{Boolean(connection.use_ssh) && (
											<div className="flex items-center justify-between text-xs font-bold uppercase">
												<span className="text-zinc-500">SECURITY</span>
												<span className="inline-flex items-center gap-1 bg-yellow-300 text-black px-2 py-1 border border-black dark:border-white font-mono">
													<Shield className="w-3 h-3" />
													[SSH_SECURED]
												</span>
											</div>
										)}
									</div>
								</div>

								<Button
									type="button"
									onClick={() => handleSelectConnection(connection)}
									className={`w-full rounded-none border-2 border-black dark:border-white py-6 font-black uppercase tracking-widest text-sm shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.8)] active:translate-y-[2px] active:translate-x-[2px] active:shadow-none transition-all ${
										isActive
											? "bg-orange-500 text-black hover:bg-orange-400"
											: "bg-zinc-200 dark:bg-zinc-800 text-black dark:text-white hover:bg-zinc-300 dark:hover:bg-zinc-700"
									}`}
								>
									{isActive ? (
										<span className="flex items-center gap-2">
											<Zap className="w-4 h-4" /> LINK ACTIVE
										</span>
									) : (
										"ACTIVATE_LINK"
									)}
								</Button>
							</div>
						);
					})}
				</div>
			</div>

			<div className="bg-zinc-50 dark:bg-zinc-950 border-2 border-black dark:border-white p-8 shadow-hardware mt-12 w-full max-w-2xl mx-auto">
				<div className="mb-6 border-b-4 border-black dark:border-white pb-4">
					<h2 className="text-2xl font-black uppercase tracking-widest flex items-center gap-3">
						<Plus className="w-6 h-6 border-2 border-black bg-zinc-200" />
						INITIALIZE_NEW_NODE
					</h2>
				</div>

				<Form onSubmit={handleSubmit}>
					<div className="space-y-5">
						<FormItem>
							<FormLabel className="text-xs font-black tracking-widest mb-1 block uppercase text-zinc-500">
								Connection Alias
							</FormLabel>
							<FormControl>
								<Input
									type="text"
									value={connectionName}
									onChange={(event) => {
										setConnectionName(event.target.value);
									}}
									className="bg-white dark:bg-black border-2 border-black dark:border-white rounded-none p-3 h-12 font-bold uppercase focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-orange-500 shadow-[inset_2px_2px_0px_0px_rgba(0,0,0,0.1)]"
									placeholder="LOCAL_DEV_DB"
								/>
							</FormControl>
						</FormItem>

						<FormItem>
							<FormLabel className="text-xs font-black tracking-widest mb-1 block uppercase text-zinc-500">
								Secure Tunnel
							</FormLabel>
							<FormControl>
								<button
									type="button"
									onClick={() => {
										setCredentials((prev) => ({
											...prev,
											useSsh: !prev.useSsh,
											sshPort: prev.sshPort ?? 22,
										}));
									}}
									className={`w-full border-2 border-black dark:border-white p-2 font-bold uppercase cursor-pointer flex items-center gap-2 justify-between ${
										credentials.useSsh
											? "bg-orange-500 text-black"
											: "bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200"
									}`}
									aria-pressed={Boolean(credentials.useSsh)}
								>
									<span className="inline-flex items-center gap-2 tracking-widest text-xs">
										<Shield className="w-4 h-4" />
										ENABLE_SECURE_TUNNEL (SSH)
									</span>
									<span className="text-[10px] tracking-widest border border-black dark:border-white px-2 py-1">
										{credentials.useSsh ? "ON" : "OFF"}
									</span>
								</button>
							</FormControl>
						</FormItem>

						{credentials.useSsh ? (
							<div className="ml-4 border-l-4 border-black dark:border-white pl-4 py-2 space-y-4 bg-zinc-100/50 dark:bg-zinc-900/40">
								<p className="text-xs font-black uppercase tracking-widest text-zinc-500">
									SSH_MODULE
								</p>

								<div className="grid grid-cols-3 gap-4">
									<FormItem className="col-span-2">
										<FormLabel className="text-xs font-black tracking-widest mb-1 block uppercase text-zinc-500">
											SSH_HOST
										</FormLabel>
										<FormControl>
											<Input
												type="text"
												value={credentials.sshHost ?? ""}
												onChange={(event) => {
													setCredentials((prev) => ({
														...prev,
														sshHost: event.target.value,
													}));
												}}
												placeholder="bastion.example.com"
												className="bg-zinc-100 dark:bg-zinc-900 border-2 border-black dark:border-white rounded-none p-2 font-mono text-sm focus:ring-2 focus:ring-orange-500"
											/>
										</FormControl>
									</FormItem>

									<FormItem className="col-span-1">
										<FormLabel className="text-xs font-black tracking-widest mb-1 block uppercase text-zinc-500">
											SSH_PORT
										</FormLabel>
										<FormControl>
											<Input
												type="number"
												value={credentials.sshPort ?? 22}
												onChange={(event) => {
													const value = event.target.value;

													setCredentials((prev) => ({
														...prev,
														sshPort: value === "" ? 22 : Number(value),
													}));
												}}
												placeholder="22"
												className="bg-zinc-100 dark:bg-zinc-900 border-2 border-black dark:border-white rounded-none p-2 font-mono text-sm focus:ring-2 focus:ring-orange-500"
											/>
										</FormControl>
									</FormItem>
								</div>

								<FormItem>
									<FormLabel className="text-xs font-black tracking-widest mb-1 block uppercase text-zinc-500">
										SSH_USER
									</FormLabel>
									<FormControl>
										<Input
											type="text"
											value={credentials.sshUser ?? ""}
											onChange={(event) => {
												setCredentials((prev) => ({
													...prev,
													sshUser: event.target.value,
												}));
											}}
											placeholder="deploy"
											className="bg-zinc-100 dark:bg-zinc-900 border-2 border-black dark:border-white rounded-none p-2 font-mono text-sm focus:ring-2 focus:ring-orange-500"
										/>
									</FormControl>
								</FormItem>

								<FormItem>
									<FormLabel className="text-xs font-black tracking-widest mb-1 block uppercase text-zinc-500">
										SSH_PASSWORD_OR_PASSPHRASE
									</FormLabel>
									<FormControl>
										<Input
											type="password"
											value={credentials.sshPassword ?? ""}
											onChange={(event) => {
												setCredentials((prev) => ({
													...prev,
													sshPassword: event.target.value,
												}));
											}}
											placeholder="••••••••"
											className="bg-zinc-100 dark:bg-zinc-900 border-2 border-black dark:border-white rounded-none p-2 font-mono text-sm focus:ring-2 focus:ring-orange-500"
										/>
									</FormControl>
								</FormItem>

								<FormItem>
									<FormLabel className="text-xs font-black tracking-widest mb-1 block uppercase text-zinc-500">
										SSH_PRIVATE_KEY
									</FormLabel>
									<FormControl>
										<textarea
											value={credentials.sshPrivateKey ?? ""}
											onChange={(event) => {
												setCredentials((prev) => ({
													...prev,
													sshPrivateKey: event.target.value,
												}));
											}}
											placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
											rows={6}
											className="w-full bg-zinc-100 dark:bg-zinc-900 border-2 border-black dark:border-white rounded-none p-2 font-mono text-xs focus:ring-2 focus:ring-orange-500"
										/>
									</FormControl>
								</FormItem>
							</div>
						) : null}

						<FormItem>
							<FormLabel className="text-xs font-black tracking-widest mb-1 block uppercase text-zinc-500">
								Driver
							</FormLabel>
							<FormControl>
								<div className="border-2 border-black bg-white shadow-[inset_2px_2px_0px_0px_rgba(0,0,0,0.1)] text-black">
									<Select
										value={credentials.driver}
										onValueChange={(value) => {
											setCredentials((prev) => ({
												...prev,
												driver: value as DbCredentials["driver"],
											}));
										}}
									>
										<SelectTrigger className="w-full h-12 bg-transparent border-0 rounded-none font-bold uppercase focus:ring-0">
											<SelectValue placeholder="Select driver" />
										</SelectTrigger>
										<SelectContent className="rounded-none border-2 border-black shadow-hardware font-mono">
											<SelectItem
												value="postgres"
												className="font-bold uppercase rounded-none focus:bg-zinc-200 hover:!bg-zinc-400 bg-white text-black cursor-pointer text-sm py-2"
											>
												PostgreSQL
											</SelectItem>
											<SelectItem
												value="mysql"
												className="font-bold uppercase rounded-none focus:bg-zinc-200 hover:!bg-zinc-400 bg-white text-black cursor-pointer text-sm py-2"
											>
												MySQL
											</SelectItem>
											<SelectItem
												value="sqlite"
												className="font-bold uppercase rounded-none focus:bg-zinc-200 hover:!bg-zinc-400 bg-white text-black cursor-pointer text-sm py-2"
											>
												SQLite
											</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</FormControl>
						</FormItem>

						<div className="grid grid-cols-3 gap-4">
							<FormItem className="col-span-2">
								<FormLabel className="text-xs font-black tracking-widest mb-1 block uppercase text-zinc-500">
									Host
								</FormLabel>
								<FormControl>
									<Input
										type="text"
										value={credentials.host ?? ""}
										onChange={(event) => {
											setCredentials((prev) => ({
												...prev,
												host: event.target.value,
											}));
										}}
										placeholder="localhost"
										className="bg-white dark:bg-black border-2 border-black dark:border-white rounded-none p-3 h-12 font-bold focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-orange-500 shadow-[inset_2px_2px_0px_0px_rgba(0,0,0,0.1)]"
									/>
								</FormControl>
							</FormItem>

							<FormItem className="col-span-1">
								<FormLabel className="text-xs font-black tracking-widest mb-1 block uppercase text-zinc-500">
									Port
								</FormLabel>
								<FormControl>
									<Input
										type="number"
										value={credentials.port ?? ""}
										onChange={(event) => {
											const value = event.target.value;
											setCredentials((prev) => ({
												...prev,
												port: value === "" ? undefined : Number(value),
											}));
										}}
										placeholder="5432"
										className="bg-white dark:bg-black border-2 border-black dark:border-white rounded-none p-3 h-12 font-bold focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-orange-500 shadow-[inset_2px_2px_0px_0px_rgba(0,0,0,0.1)]"
									/>
								</FormControl>
							</FormItem>
						</div>

						<div className="grid grid-cols-2 gap-4">
							<FormItem>
								<FormLabel className="text-xs font-black tracking-widest mb-1 block uppercase text-zinc-500">
									Auth User
								</FormLabel>
								<FormControl>
									<Input
										type="text"
										value={credentials.user ?? ""}
										onChange={(event) => {
											setCredentials((prev) => ({
												...prev,
												user: event.target.value,
											}));
										}}
										placeholder="root"
										className="bg-white dark:bg-black border-2 border-black dark:border-white rounded-none p-3 h-12 font-bold focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-orange-500 shadow-[inset_2px_2px_0px_0px_rgba(0,0,0,0.1)]"
									/>
								</FormControl>
							</FormItem>

							<FormItem>
								<FormLabel className="text-xs font-black tracking-widest mb-1 block uppercase text-zinc-500">
									Auth Token
								</FormLabel>
								<FormControl>
									<Input
										type="password"
										value={credentials.password ?? ""}
										onChange={(event) => {
											setCredentials((prev) => ({
												...prev,
												password: event.target.value,
											}));
										}}
										placeholder="••••••••"
										className="bg-white dark:bg-black border-2 border-black dark:border-white rounded-none p-3 h-12 font-bold focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-orange-500 shadow-[inset_2px_2px_0px_0px_rgba(0,0,0,0.1)]"
									/>
								</FormControl>
							</FormItem>
						</div>

						<FormItem>
							<FormLabel className="text-xs font-black tracking-widest mb-1 block uppercase text-zinc-500">
								Target Database
							</FormLabel>
							<FormControl>
								<Input
									type="text"
									value={credentials.database ?? ""}
									onChange={(event) => {
										setCredentials((prev) => ({
											...prev,
											database: event.target.value,
										}));
									}}
									placeholder="database_name"
									className="bg-white dark:bg-black border-2 border-black dark:border-white rounded-none p-3 h-12 font-bold focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-orange-500 shadow-[inset_2px_2px_0px_0px_rgba(0,0,0,0.1)]"
								/>
							</FormControl>
						</FormItem>

						{status ? (
							<output
								className={`border-4 p-4 font-black uppercase tracking-widest text-sm flex items-center justify-between ${
									status.success
										? "border-emerald-500 bg-emerald-500 text-black"
										: "border-red-500 bg-red-500 text-white"
								}`}
							>
								<span>{status.message}</span>
								{status.success ? (
									<Zap className="w-5 h-5" />
								) : (
									<RefreshCw className="w-5 h-5" />
								)}
							</output>
						) : null}

						<div className="flex gap-4 pt-6 mt-6 border-t-4 border-black dark:border-white">
							<Button
								type="submit"
								disabled={
									testConnectionMutation.isPending ||
									saveConnectionMutation.isPending
								}
								className="flex-1 rounded-none border-2 border-black shadow-hardware active:translate-x-[2px] active:translate-y-[2px] active:shadow-none font-black uppercase text-sm tracking-widest bg-zinc-200 text-black hover:bg-zinc-300 h-16 py-4"
							>
								{testConnectionMutation.isPending
									? "Probing..."
									: "TEST_CONNECTION"}
							</Button>
							<Button
								type="button"
								variant="secondary"
								className="flex-[2] rounded-none border-4 border-black shadow-hardware active:translate-x-[4px] active:translate-y-[4px] active:shadow-none font-black uppercase text-lg tracking-widest bg-orange-500 text-black hover:bg-orange-400 h-16 py-4 flex items-center gap-3"
								disabled={
									saveConnectionMutation.isPending ||
									testConnectionMutation.isPending
								}
								onClick={() => {
									void handleSaveConnection();
								}}
							>
								<Save className="w-6 h-6" />
								{saveConnectionMutation.isPending
									? "WRITING..."
									: "SAVE_CONFIGURATION"}
							</Button>
						</div>
					</div>
				</Form>
			</div>
		</section>
	);
}
