import {
	Edit3,
	FilePlus,
	Plus,
	RefreshCw,
	Save,
	Shield,
	Zap,
} from "lucide-react";
import type { SubmitEvent } from "react";

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
import type { DbCredentials } from "@/lib/db/connection";

import { SSHConfigSection } from "./SSHConfigSection";

interface ConnectionFormProps {
	connectionName: string;
	credentials: DbCredentials;
	editingConnectionId: number | null;
	status: { success: boolean; message: string } | null;
	isTesting: boolean;
	isSaving: boolean;
	isUpdating: boolean;
	onConnectionNameChange: (name: string) => void;
	onCredentialsChange: (update: (prev: DbCredentials) => DbCredentials) => void;
	onNewConnection: () => void;
	onSaveConnection: () => void;
	onTestConnection: (event: SubmitEvent<HTMLFormElement>) => void;
}

export function ConnectionForm({
	connectionName,
	credentials,
	editingConnectionId,
	status,
	isTesting,
	isSaving,
	isUpdating,
	onConnectionNameChange,
	onCredentialsChange,
	onNewConnection,
	onSaveConnection,
	onTestConnection,
}: ConnectionFormProps) {
	const isAnyMutationPending = isTesting || isSaving || isUpdating;

	return (
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
						onClick={onNewConnection}
						className="flex items-center gap-2"
					>
						<FilePlus className="w-4 h-4" />
						NEW_CONNECTION
					</Button>
				)}
			</div>

			<Form onSubmit={onTestConnection}>
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
									onConnectionNameChange(event.target.value);
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
									onCredentialsChange((prev) => ({
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
						<SSHConfigSection
							credentials={credentials}
							onCredentialsChange={onCredentialsChange}
						/>
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
										onCredentialsChange((prev) => ({
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
										onCredentialsChange((prev) => ({
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
										onCredentialsChange((prev) => ({
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
										onCredentialsChange((prev) => ({
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
										onCredentialsChange((prev) => ({
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
									onCredentialsChange((prev) => ({
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
							disabled={isAnyMutationPending}
							className="flex-1 h-16 py-4"
						>
							{isTesting ? "Probing..." : "TEST_CONNECTION"}
						</Button>
						<Button
							type="button"
							variant="accent"
							className="flex-2 h-16 py-4 text-lg flex items-center gap-3"
							disabled={isAnyMutationPending}
							onClick={() => {
								onSaveConnection();
							}}
						>
							{editingConnectionId !== null ? (
								<Edit3 className="w-6 h-6" />
							) : (
								<Save className="w-6 h-6" />
							)}
							{isSaving || isUpdating
								? "WRITING..."
								: editingConnectionId !== null
									? "UPDATE_CONFIGURATION"
									: "SAVE_CONFIGURATION"}
						</Button>
					</div>
				</div>
			</Form>
		</div>
	);
}
