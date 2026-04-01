import { randomUUID } from "node:crypto";
import { chmodSync, unlinkSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "bun";
import type { DbCredentials } from "../lib/db/connection";

const DEFAULT_TUNNEL_IDLE_TIMEOUT_MS = 10_000;
let tunnelIdleTimeoutMs = DEFAULT_TUNNEL_IDLE_TIMEOUT_MS;

type SpawnedProcess = {
	exitCode: number | null;
	exited: Promise<number>;
	stderr?: ReadableStream<Uint8Array> | number | null;
	kill: () => void;
};

type TunnelRuntime = {
	getFreePort: () => Promise<number>;
	mkdtemp: (prefix: string) => Promise<string>;
	rm: (
		path: string,
		options: { recursive: boolean; force: boolean },
	) => Promise<void>;
	writeFile: (
		path: string,
		data: string,
		options: { mode: number },
	) => Promise<void>;
	spawn: (
		args: string[],
		options: { env: NodeJS.ProcessEnv; stderr: "pipe"; stdout: "ignore" },
	) => SpawnedProcess;
	sleep: (ms: number) => Promise<void>;
	canConnect: (
		host: string,
		port: number,
		timeoutMs: number,
	) => Promise<boolean>;
};

type PooledTunnel = {
	cacheKey: string;
	localPort: number;
	proc: SpawnedProcess;
	tempDir: string;
	keyPath: string | null;
	askPassPath: string | null;
	idleTimer: ReturnType<typeof setTimeout> | null;
	closing: boolean;
};

type TunnelEntry = {
	openingPromise: Promise<PooledTunnel>;
	tunnel: PooledTunnel | null;
};

const tunnelRegistry = new Map<string, TunnelEntry>();

const getFreePort = async (): Promise<number> => {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.listen(0, "127.0.0.1", () => {
			const port = (server.address() as net.AddressInfo).port;
			server.close(() => resolve(port));
		});
		server.on("error", reject);
	});
};

const canConnect = async (
	host: string,
	port: number,
	timeoutMs: number,
): Promise<boolean> => {
	return new Promise((resolve) => {
		const socket = net.createConnection({ host, port });

		const onSuccess = () => {
			socket.destroy();
			resolve(true);
		};

		const onFailure = () => {
			socket.destroy();
			resolve(false);
		};

		socket.setTimeout(timeoutMs);
		socket.once("connect", onSuccess);
		socket.once("timeout", onFailure);
		socket.once("error", onFailure);
	});
};

const isCriticalSshStderr = (chunk: string): boolean => {
	const normalized = chunk.toLowerCase();

	return /(permission denied|connection refused|connection timed out|could not resolve hostname|no route to host|connection closed|bad permissions|invalid format|operation timed out|forwarding failed|administratively prohibited)/.test(
		normalized,
	);
};

const defaultRuntime: TunnelRuntime = {
	getFreePort,
	mkdtemp: (prefix) => mkdtemp(prefix),
	rm: (path, options) => rm(path, options),
	writeFile: (path, data, options) => writeFile(path, data, options),
	spawn: (args, options) => spawn(args, options),
	sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
	canConnect,
};

let runtime: TunnelRuntime = defaultRuntime;

export const __setTunnelRuntimeForTests = (
	overrides: Partial<TunnelRuntime> | null,
): void => {
	runtime = overrides ? { ...defaultRuntime, ...overrides } : defaultRuntime;
};

export const __setTunnelPoolIdleTimeoutForTests = (ms: number): void => {
	tunnelIdleTimeoutMs = ms;
};

const buildTunnelCacheKey = (
	credentials: DbCredentials,
	targetHost: string,
	targetPort: number,
): string => {
	return [
		credentials.sshHost,
		credentials.sshUser,
		(credentials.sshPort || 22).toString(),
		targetHost,
		targetPort.toString(),
		credentials.sshPrivateKey ? "key" : "password",
	].join("|");
};

const waitForTunnelReadiness = async (
	proc: SpawnedProcess,
	localPort: number,
): Promise<void> => {
	const startupTimeoutMs = 15_000;
	const pollingDelayMs = 50;
	const deadline = Date.now() + startupTimeoutMs;
	let attempt = 0;
	let stderrBuffer = "";
	let hasSettled = false;
	let stderrReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
	const stderrCleanupRef: { current: null | (() => Promise<void>) } = {
		current: null,
	};

	let rejectFailFast: ((error: Error) => void) | null = null;
	const failFastPromise = new Promise<never>((_resolve, reject) => {
		rejectFailFast = reject;
	});

	const failFast = (error: Error) => {
		if (hasSettled) {
			return;
		}

		hasSettled = true;
		rejectFailFast?.(error);
	};

	const monitorExit = async () => {
		try {
			const exitCode = await proc.exited;
			if (hasSettled) {
				return;
			}

			if (exitCode !== 0) {
				const details = stderrBuffer.trim();
				failFast(
					new Error(
						`SSH process exited with code ${exitCode}${details ? `: ${details}` : ""}`,
					),
				);
			}
		} catch (error) {
			if (hasSettled) {
				return;
			}

			const message = error instanceof Error ? error.message : String(error);
			failFast(new Error(`SSH process exit watcher failed: ${message}`));
		}
	};

	const monitorStderr = async () => {
		if (!proc.stderr || typeof proc.stderr === "number") {
			return;
		}

		const decoder = new TextDecoder();
		stderrReader = proc.stderr.getReader();
		stderrCleanupRef.current = async () => {
			if (!stderrReader) {
				return;
			}

			await stderrReader.cancel().catch(() => {});
		};

		try {
			while (!hasSettled) {
				const { done, value } = await stderrReader.read();
				if (done) {
					break;
				}

				const chunk = decoder.decode(value, { stream: true });
				if (!chunk) {
					continue;
				}

				stderrBuffer = `${stderrBuffer}${chunk}`;
				if (stderrBuffer.length > 16_384) {
					stderrBuffer = stderrBuffer.slice(-16_384);
				}

				console.error(`[SSH STDERR] ${chunk.trimEnd()}`);

				if (isCriticalSshStderr(chunk)) {
					failFast(
						new Error(
							`SSH stderr signaled failure before tunnel readiness: ${chunk.trim()}`,
						),
					);
					return;
				}
			}
		} catch (error) {
			if (hasSettled) {
				return;
			}

			const message = error instanceof Error ? error.message : String(error);
			failFast(new Error(`SSH stderr watcher failed: ${message}`));
		} finally {
			stderrReader?.releaseLock();
		}
	};

	console.log(
		`[SSH Tunnel] Waiting for local forward on 127.0.0.1:${localPort} (timeout=${startupTimeoutMs}ms, interval=${pollingDelayMs}ms)`,
	);

	const pollUntilReady = async (): Promise<void> => {
		while (Date.now() < deadline && !hasSettled) {
			attempt += 1;

			const reachable = await runtime.canConnect("127.0.0.1", localPort, 200);
			if (reachable) {
				hasSettled = true;
				console.log(
					`[SSH Tunnel] Local forward is reachable after ${attempt} probe attempts.`,
				);
				return;
			}

			console.log(
				`[SSH Tunnel] Probe #${attempt} failed, local port ${localPort} not ready yet.`,
			);

			await Promise.race([runtime.sleep(pollingDelayMs), failFastPromise]);
		}

		if (!hasSettled) {
			hasSettled = true;
			throw new Error(
				`SSH tunnel did not become reachable on 127.0.0.1:${localPort} within ${startupTimeoutMs}ms${stderrBuffer.trim() ? ` | stderr: ${stderrBuffer.trim()}` : ""}`,
			);
		}
	};

	void monitorExit();
	void monitorStderr();

	try {
		await Promise.race([pollUntilReady(), failFastPromise]);
	} finally {
		hasSettled = true;
		if (stderrCleanupRef.current) {
			await stderrCleanupRef.current();
		}
	}
};

const cleanupTunnelResources = async (tunnel: PooledTunnel): Promise<void> => {
	console.log("[SSH Tunnel] Starting cleanup sequence.");

	if (tunnel.idleTimer) {
		clearTimeout(tunnel.idleTimer);
		tunnel.idleTimer = null;
	}

	try {
		console.log("[SSH Tunnel] Killing SSH child process.");
		tunnel.proc.kill();
		await Promise.race([tunnel.proc.exited, runtime.sleep(1000)]);
		console.log("[SSH Tunnel] SSH child process terminated.");
	} catch {
		console.warn(
			"[SSH Tunnel] Failed to kill SSH process cleanly (it may have already exited).",
		);
	}

	if (tunnel.keyPath) {
		try {
			unlinkSync(tunnel.keyPath);
			console.log(
				`[SSH Tunnel] Deleted temporary private key file: ${tunnel.keyPath}`,
			);
		} catch {
			console.warn(
				`[SSH Tunnel] Could not delete temporary private key file: ${tunnel.keyPath}`,
			);
		}
	}

	if (tunnel.askPassPath) {
		try {
			unlinkSync(tunnel.askPassPath);
			console.log(
				`[SSH Tunnel] Deleted temporary askpass file: ${tunnel.askPassPath}`,
			);
		} catch {
			console.warn(
				`[SSH Tunnel] Could not delete temporary askpass file: ${tunnel.askPassPath}`,
			);
		}
	}

	console.log(`[SSH Tunnel] Removing temporary directory: ${tunnel.tempDir}`);
	await runtime
		.rm(tunnel.tempDir, { recursive: true, force: true })
		.catch(() => {});

	console.log("[SSH Tunnel] Cleanup sequence completed.");
};

const closeTunnel = async (
	cacheKey: string,
	tunnel: PooledTunnel,
	reason: string,
): Promise<void> => {
	if (tunnel.closing) {
		return;
	}

	tunnel.closing = true;
	console.log(`[SSH Pool] Closing tunnel (${reason}) for key ${cacheKey}`);

	await cleanupTunnelResources(tunnel);

	const currentEntry = tunnelRegistry.get(cacheKey);
	if (currentEntry?.tunnel === tunnel) {
		tunnelRegistry.delete(cacheKey);
		console.log(`[SSH Pool] Removed tunnel from cache for key ${cacheKey}`);
	}
};

const scheduleIdleTimeout = (cacheKey: string, tunnel: PooledTunnel): void => {
	if (tunnel.closing) {
		return;
	}

	if (tunnel.idleTimer) {
		clearTimeout(tunnel.idleTimer);
	}

	tunnel.idleTimer = setTimeout(() => {
		console.log(`[SSH Pool] Idle timeout, closing tunnel for key ${cacheKey}`);
		void closeTunnel(cacheKey, tunnel, "idle-timeout");
	}, tunnelIdleTimeoutMs);
};

const openTunnel = async (
	credentials: DbCredentials,
	cacheKey: string,
	targetHost: string,
	targetPort: number,
): Promise<PooledTunnel> => {
	const localPort = await runtime.getFreePort();
	const tempDir = await runtime.mkdtemp(join(tmpdir(), "omnidump-ssh-"));
	let keyPath: string | null = null;
	let askPassPath: string | null = null;
	let proc: SpawnedProcess | null = null;

	try {
		console.log(`[SSH Tunnel] Created temporary directory: ${tempDir}`);
		const env = { ...process.env };

		const args = [
			"ssh",
			"-N",
			"-L",
			`127.0.0.1:${localPort}:${targetHost}:${targetPort}`,
			"-p",
			(credentials.sshPort || 22).toString(),
			"-o",
			"StrictHostKeyChecking=no",
			"-o",
			"UserKnownHostsFile=/dev/null",
			"-o",
			"ExitOnForwardFailure=yes",
			"-o",
			"ConnectTimeout=15",
			"-o",
			"ServerAliveInterval=10",
			"-o",
			"ServerAliveCountMax=3",
			"-o",
			"LogLevel=ERROR",
		];

		if (credentials.sshPrivateKey) {
			keyPath = join(tempDir, `id_rsa_${randomUUID()}`);
			await runtime.writeFile(keyPath, credentials.sshPrivateKey, {
				mode: 0o600,
			});
			chmodSync(keyPath, 0o600);
			console.log(
				`[SSH Tunnel] Wrote private key to temporary file with strict mode 0600: ${keyPath}`,
			);
			args.push("-i", keyPath);
		}

		if (credentials.sshPassword && !credentials.sshPrivateKey) {
			askPassPath = join(tempDir, `askpass_${randomUUID()}.sh`);
			const safePassword = credentials.sshPassword.replace(/"/g, '\\"');
			await runtime.writeFile(
				askPassPath,
				`#!/bin/sh\necho "${safePassword}"`,
				{
					mode: 0o700,
				},
			);
			env.SSH_ASKPASS = askPassPath;
			env.SSH_ASKPASS_REQUIRE = "force";
			env.DISPLAY = "dummy:0";
			console.log(`[SSH Tunnel] Created askpass helper script: ${askPassPath}`);
		}

		args.push(`${credentials.sshUser}@${credentials.sshHost}`);

		console.log(
			`[SSH Process] Initiating native tunnel: 127.0.0.1:${localPort} -> ${targetHost}:${targetPort}`,
		);
		console.log(`[SSH Process] Command args: ${args.join(" ")}`);

		proc = runtime.spawn(args, { env, stderr: "pipe", stdout: "ignore" });
		console.log(
			"[SSH Process] Child process spawned, waiting for port binding.",
		);

		await waitForTunnelReadiness(proc, localPort);

		console.log(
			`[SSH Process] Tunnel securely established on local port ${localPort}`,
		);

		const tunnel: PooledTunnel = {
			cacheKey,
			localPort,
			proc,
			tempDir,
			keyPath,
			askPassPath,
			idleTimer: null,
			closing: false,
		};

		void proc.exited.then((exitCode) => {
			if (tunnel.closing) {
				return;
			}

			console.error(
				`[SSH Pool] Tunnel process exited unexpectedly with code ${exitCode} for key ${cacheKey}`,
			);
			void closeTunnel(cacheKey, tunnel, `process-exit-${exitCode}`);
		});

		return tunnel;
	} catch (error) {
		console.error("[SSH Tunnel Error - Tunnel Core Process]", error);

		if (proc) {
			try {
				proc.kill();
				await Promise.race([proc.exited, runtime.sleep(1000)]);
			} catch {
				// Ignore cleanup errors from a process that may already be gone.
			}
		}

		if (keyPath) {
			try {
				unlinkSync(keyPath);
			} catch {
				// Ignore best-effort cleanup errors.
			}
		}

		if (askPassPath) {
			try {
				unlinkSync(askPassPath);
			} catch {
				// Ignore best-effort cleanup errors.
			}
		}

		await runtime.rm(tempDir, { recursive: true, force: true }).catch(() => {});
		throw error;
	}
};

const getOrCreateTunnel = async (
	credentials: DbCredentials,
	targetHost: string,
	targetPort: number,
): Promise<PooledTunnel> => {
	const cacheKey = buildTunnelCacheKey(credentials, targetHost, targetPort);
	const existing = tunnelRegistry.get(cacheKey);

	if (existing) {
		console.log(`[SSH Pool] Tunnel reused for key ${cacheKey}`);
		const tunnel = await existing.openingPromise;
		scheduleIdleTimeout(cacheKey, tunnel);
		return tunnel;
	}

	console.log(`[SSH Pool] Creating new tunnel for key ${cacheKey}`);

	const entry: TunnelEntry = {
		openingPromise: Promise.resolve(null as unknown as PooledTunnel),
		tunnel: null,
	};

	entry.openingPromise = openTunnel(
		credentials,
		cacheKey,
		targetHost,
		targetPort,
	)
		.then((tunnel) => {
			entry.tunnel = tunnel;
			scheduleIdleTimeout(cacheKey, tunnel);
			return tunnel;
		})
		.catch((error) => {
			if (tunnelRegistry.get(cacheKey) === entry) {
				tunnelRegistry.delete(cacheKey);
			}
			throw error;
		});

	tunnelRegistry.set(cacheKey, entry);

	return entry.openingPromise;
};

export const __resetTunnelPoolForTests = async (): Promise<void> => {
	const entries = Array.from(tunnelRegistry.entries());

	await Promise.all(
		entries.map(async ([cacheKey, entry]) => {
			try {
				const tunnel = entry.tunnel ?? (await entry.openingPromise);
				await closeTunnel(cacheKey, tunnel, "test-reset");
			} catch {
				// Ignore reset errors for entries that already failed opening.
			}
		}),
	);

	tunnelRegistry.clear();
	tunnelIdleTimeoutMs = DEFAULT_TUNNEL_IDLE_TIMEOUT_MS;
};

export const withTunnel = async <T>(
	credentials: DbCredentials,
	action: (tunneledCreds: DbCredentials) => Promise<T>,
): Promise<T> => {
	if (!credentials.useSsh) {
		return action(credentials);
	}

	if (!credentials.sshHost || !credentials.sshUser) {
		throw new Error(
			"SSH tunneling requires both sshHost and sshUser to be provided.",
		);
	}

	const targetPort =
		credentials.port || (credentials.driver === "postgres" ? 5432 : 3306);
	const targetHost = credentials.host || "127.0.0.1";
	const tunnel = await getOrCreateTunnel(credentials, targetHost, targetPort);

	try {
		const result = await action({
			...credentials,
			host: "127.0.0.1",
			port: tunnel.localPort,
		});
		console.log(
			"[SSH Tunnel] Action executed successfully through forwarded port.",
		);

		scheduleIdleTimeout(tunnel.cacheKey, tunnel);

		return result;
	} catch (error) {
		console.error("[SSH Tunnel Error - Tunnel Core Process]", error);
		scheduleIdleTimeout(tunnel.cacheKey, tunnel);
		throw error;
	}
};
