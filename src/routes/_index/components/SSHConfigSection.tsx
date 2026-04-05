import { FormControl, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { DbCredentials } from "@/lib/db/connection";

interface SSHConfigSectionProps {
	credentials: DbCredentials;
	onCredentialsChange: (update: (prev: DbCredentials) => DbCredentials) => void;
}

export function SSHConfigSection({
	credentials,
	onCredentialsChange,
}: SSHConfigSectionProps) {
	return (
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
								onCredentialsChange((prev) => ({
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

								onCredentialsChange((prev) => ({
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
							onCredentialsChange((prev) => ({
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
							onCredentialsChange((prev) => ({
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
							onCredentialsChange((prev) => ({
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
	);
}
