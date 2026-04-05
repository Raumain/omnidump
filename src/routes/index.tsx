import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	Edit3,
	FilePlus,
	Plus,
	RefreshCw,
	Save,
	Shield,
	Trash2,
	Zap,
} from "lucide-react";
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
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
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

	const handleDeleteConnection = async (id: number) => {
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

	const handleSaveConnection = async () => {
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
					{savedConnections.map((connection) => {
						const isActive = activeConnection?.id === connection.id;
						return (
							<div
								key={connection.id}
								className={`bg-card border-2 p-5 flex flex-col justify-between h-full group transition-none ${isActive ? "border-primary shadow-hardware" : "border-border shadow-hardware dark:shadow-hardware hover:border-primary"}`}
							>
								<div>
									<div className="flex items-start justify-between border-b-2 border-border pb-3 mb-4">
										<div className="flex items-center gap-3">
											<div
												className={`w-3 h-3 ${isActive ? "bg-primary shadow-[0_0_8px_rgba(255,150,0,0.8)] animate-pulse" : "bg-destructive"}`}
											/>
											<p
												className="font-black uppercase tracking-widest text-lg truncate text-foreground"
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
													className="rounded-none hover:bg-destructive/20 hover:text-destructive text-muted-foreground h-8 w-8 border-2 border-transparent hover:border-destructive"
												>
													<Trash2 className="w-4 h-4" />
												</Button>
											</AlertDialogTrigger>
											<AlertDialogContent className="rounded-none border-4 border-destructive bg-card shadow-hardware font-mono p-0 max-w-md">
												<AlertDialogHeader className="p-6 pb-4">
													<AlertDialogTitle className="text-2xl font-black uppercase text-destructive flex items-center gap-2">
														<Trash2 className="w-6 h-6" /> Terminate Node?
													</AlertDialogTitle>
													<AlertDialogDescription className="text-foreground font-bold uppercase tracking-widest">
														INITIATE DELETION SEQUENCE FOR NODE:{" "}
														<span className="text-destructive font-black">
															{connection.name}
														</span>
														?
													</AlertDialogDescription>
												</AlertDialogHeader>
												<AlertDialogFooter className="p-4 border-t-2 border-destructive bg-secondary flex gap-3">
													<AlertDialogCancel className="flex-1 rounded-none border-2 border-border bg-secondary text-secondary-foreground shadow-hardware dark:shadow-hardware active:translate-x-0.5 active:translate-y-0.5 active:shadow-none font-bold uppercase transition-none">
														Cancel
													</AlertDialogCancel>
													<AlertDialogAction
														onClick={() => {
															void handleDeleteConnection(connection.id);
														}}
														className="flex-1 rounded-none border-2 border-destructive bg-destructive text-white shadow-hardware hover:bg-[#CC0000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none font-bold uppercase transition-none"
													>
														Execute Deletion
													</AlertDialogAction>
												</AlertDialogFooter>
											</AlertDialogContent>
										</AlertDialog>
									</div>

									<div className="space-y-2 mb-6">
										<div className="flex items-center justify-between text-xs font-bold uppercase">
											<span className="text-muted-foreground">DRIVER</span>
											<span className="bg-secondary text-foreground px-2 py-1 border border-border">
												{connection.driver ?? "UNKNOWN"}
											</span>
										</div>
										<div className="flex items-center justify-between text-xs font-bold uppercase">
											<span className="text-muted-foreground">HOST</span>
											<span className="truncate max-w-[60%] text-foreground">
												{connection.host || "LOCALHOST"}
											</span>
										</div>
										{connection.database_name && (
											<div className="flex items-center justify-between text-xs font-bold uppercase">
												<span className="text-muted-foreground">DB</span>
												<span className="truncate max-w-[60%] text-foreground">
													{connection.database_name}
												</span>
											</div>
										)}
										{Boolean(connection.use_ssh) && (
											<div className="flex items-center justify-between text-xs font-bold uppercase">
												<span className="text-muted-foreground">SECURITY</span>
												<span className="inline-flex items-center gap-1 bg-primary text-primary-foreground px-2 py-1 border border-primary font-mono">
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
									variant={isActive ? "accent" : "default"}
									className="w-full py-6 text-sm tracking-widest"
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

			<div className="bg-card border-2 border-border p-8 shadow-hardware mt-12 w-full max-w-2xl mx-auto">
				<div className="mb-6 border-b-2 border-border pb-4 flex items-center justify-between">
					<h2 className="text-2xl font-black uppercase tracking-widest flex items-center gap-3 text-foreground">
						{editingConnectionId !== null ? (
							<>
								<Edit3 className="w-6 h-6 border-2 border-primary bg-primary/20" />
								MODIFY_NODE
							</>
						) : (
							<>
								<Plus className="w-6 h-6 border-2 border-border bg-secondary" />
								INITIALIZE_NEW_NODE
							</>
						)}
					</h2>
					{editingConnectionId !== null && (
						<Button
							type="button"
							variant="outline"
							onClick={handleNewConnection}
							className="flex items-center gap-2"
						>
							<FilePlus className="w-4 h-4" />
							NEW_CONNECTION
						</Button>
					)}
				</div>

				<Form onSubmit={handleSubmit}>
					<div className="space-y-5">
						<FormItem>
							<FormLabel className="text-xs font-black tracking-widest mb-1 block uppercase text-muted-foreground">
								Connection Alias
							</FormLabel>
							<FormControl>
								<Input
									type="text"
									value={connectionName}
									onChange={(event) => {
										setConnectionName(event.target.value);
									}}
									className="bg-secondary border-2 border-border rounded-none p-3 h-12 font-bold uppercase text-foreground focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-primary"
									placeholder="LOCAL_DEV_DB"
								/>
							</FormControl>
						</FormItem>

						<FormItem>
							<FormLabel className="text-xs font-black tracking-widest mb-1 block uppercase text-muted-foreground">
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
									className={`w-full border-2 p-2 font-bold uppercase cursor-pointer flex items-center gap-2 justify-between transition-none ${
										credentials.useSsh
											? "border-primary bg-primary text-primary-foreground"
											: "border-border bg-secondary text-muted-foreground"
									}`}
									aria-pressed={Boolean(credentials.useSsh)}
								>
									<span className="inline-flex items-center gap-2 tracking-widest text-xs">
										<Shield className="w-4 h-4" />
										ENABLE_SECURE_TUNNEL (SSH)
									</span>
									<span className="text-[10px] tracking-widest border border-current px-2 py-1">
										{credentials.useSsh ? "ON" : "OFF"}
									</span>
								</button>
							</FormControl>
						</FormItem>

						{credentials.useSsh ? (
							<div className="ml-4 border-l-2 border-primary pl-4 py-2 space-y-4 bg-secondary/50">
								<p className="text-xs font-black uppercase tracking-widest text-primary">
									SSH_MODULE
								</p>

								<div className="grid grid-cols-3 gap-4">
									<FormItem className="col-span-2">
										<FormLabel className="text-xs font-black tracking-widest mb-1 block uppercase text-muted-foreground">
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
												className="bg-secondary border-2 border-border rounded-none p-2 font-mono text-sm text-foreground focus:border-primary"
											/>
										</FormControl>
									</FormItem>

									<FormItem className="col-span-1">
										<FormLabel className="text-xs font-black tracking-widest mb-1 block uppercase text-muted-foreground">
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
												className="bg-secondary border-2 border-border rounded-none p-2 font-mono text-sm text-foreground focus:border-primary"
											/>
										</FormControl>
									</FormItem>
								</div>

								<FormItem>
									<FormLabel className="text-xs font-black tracking-widest mb-1 block uppercase text-muted-foreground">
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
											className="bg-secondary border-2 border-border rounded-none p-2 font-mono text-sm text-foreground focus:border-primary"
										/>
									</FormControl>
								</FormItem>

								<FormItem>
									<FormLabel className="text-xs font-black tracking-widest mb-1 block uppercase text-muted-foreground">
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
											className="bg-secondary border-2 border-border rounded-none p-2 font-mono text-sm text-foreground focus:border-primary"
										/>
									</FormControl>
								</FormItem>

								<FormItem>
									<FormLabel className="text-xs font-black tracking-widest mb-1 block uppercase text-muted-foreground">
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
											className="w-full bg-secondary border-2 border-border rounded-none p-2 font-mono text-xs text-foreground focus:border-primary focus:outline-none"
										/>
									</FormControl>
								</FormItem>
							</div>
						) : null}

						<FormItem>
							<FormLabel className="text-xs font-black tracking-widest mb-1 block uppercase text-muted-foreground">
								Driver
							</FormLabel>
							<FormControl>
								<div className="border-2 border-border bg-secondary">
									<Select
										value={credentials.driver}
										onValueChange={(value) => {
											setCredentials((prev) => ({
												...prev,
												driver: value as DbCredentials["driver"],
											}));
										}}
									>
										<SelectTrigger className="w-full h-12 bg-transparent border-0 rounded-none font-bold uppercase text-foreground focus:ring-0">
											<SelectValue placeholder="Select driver" />
										</SelectTrigger>
										<SelectContent className="rounded-none border-2 border-primary shadow-hardware font-mono bg-card">
											<SelectItem
												value="postgres"
												className="font-bold uppercase rounded-none focus:bg-primary focus:text-primary-foreground cursor-pointer text-sm py-2"
											>
												PostgreSQL
											</SelectItem>
											<SelectItem
												value="mysql"
												className="font-bold uppercase rounded-none focus:bg-primary focus:text-primary-foreground cursor-pointer text-sm py-2"
											>
												MySQL
											</SelectItem>
											<SelectItem
												value="sqlite"
												className="font-bold uppercase rounded-none focus:bg-primary focus:text-primary-foreground cursor-pointer text-sm py-2"
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
								<FormLabel className="text-xs font-black tracking-widest mb-1 block uppercase text-muted-foreground">
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
										className="bg-secondary border-2 border-border rounded-none p-3 h-12 font-bold text-foreground focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-primary"
									/>
								</FormControl>
							</FormItem>

							<FormItem className="col-span-1">
								<FormLabel className="text-xs font-black tracking-widest mb-1 block uppercase text-muted-foreground">
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
										className="bg-secondary border-2 border-border rounded-none p-3 h-12 font-bold text-foreground focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-primary"
									/>
								</FormControl>
							</FormItem>
						</div>

						<div className="grid grid-cols-2 gap-4">
							<FormItem>
								<FormLabel className="text-xs font-black tracking-widest mb-1 block uppercase text-muted-foreground">
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
										className="bg-secondary border-2 border-border rounded-none p-3 h-12 font-bold text-foreground focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-primary"
									/>
								</FormControl>
							</FormItem>

							<FormItem>
								<FormLabel className="text-xs font-black tracking-widest mb-1 block uppercase text-muted-foreground">
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
										className="bg-secondary border-2 border-border rounded-none p-3 h-12 font-bold text-foreground focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-primary"
									/>
								</FormControl>
							</FormItem>
						</div>

						<FormItem>
							<FormLabel className="text-xs font-black tracking-widest mb-1 block uppercase text-muted-foreground">
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
									className="bg-secondary border-2 border-border rounded-none p-3 h-12 font-bold text-foreground focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-primary"
								/>
							</FormControl>
						</FormItem>

						{status ? (
							<output
								className={`border-4 p-4 font-black uppercase tracking-widest text-sm flex items-center justify-between ${
									status.success
										? "border-primary bg-primary text-primary-foreground"
										: "border-destructive bg-destructive text-white"
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

						<div className="flex gap-4 pt-6 mt-6 border-t-2 border-border">
							<Button
								type="submit"
								disabled={
									testConnectionMutation.isPending ||
									saveConnectionMutation.isPending ||
									updateConnectionMutation.isPending
								}
								className="flex-1 h-16 py-4"
							>
								{testConnectionMutation.isPending
									? "Probing..."
									: "TEST_CONNECTION"}
							</Button>
							<Button
								type="button"
								variant="accent"
								className="flex-2 h-16 py-4 text-lg flex items-center gap-3"
								disabled={
									saveConnectionMutation.isPending ||
									updateConnectionMutation.isPending ||
									testConnectionMutation.isPending
								}
								onClick={() => {
									void handleSaveConnection();
								}}
							>
								{editingConnectionId !== null ? (
									<Edit3 className="w-6 h-6" />
								) : (
									<Save className="w-6 h-6" />
								)}
								{saveConnectionMutation.isPending ||
								updateConnectionMutation.isPending
									? "WRITING..."
									: editingConnectionId !== null
										? "UPDATE_CONFIGURATION"
										: "SAVE_CONFIGURATION"}
							</Button>
						</div>
					</div>
				</Form>
			</div>
		</section>
	);
}
