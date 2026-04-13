import { randomUUID } from "node:crypto";
import { chmodSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_SSH_PORT } from "#/lib/constants";
import type { DbCredentials } from "#/lib/db/connection";
import { extractErrorMessage } from "#/lib/errors";
import { getTunnelRuntime } from "./runtime";
import type { PooledTunnel, SpawnedProcess, TunnelRuntime } from "./types";

const STARTUP_TIMEOUT_MS = 15_000;
const POLLING_DELAY_MS = 50;
const STDERR_BUFFER_LIMIT = 16_384;
const PROCESS_KILL_GRACE_MS = 1_000;

export const isCriticalSshStderr = (chunk: string): boolean => {
	const normalized = chunk.toLowerCase();

	return /(permission denied|connection refused|connection timed out|could not resolve hostname|no route to host|connection closed|bad permissions|invalid format|operation timed out|forwarding failed|administratively prohibited)/.test(
		normalized,
	);
};

const appendStderrChunk = (buffer: string, chunk: string): string => {
	const nextBuffer = `${buffer}${chunk}`;
	if (nextBuffer.length <= STDERR_BUFFER_LIMIT) {
		return nextBuffer;
	}

	return nextBuffer.slice(-STDERR_BUFFER_LIMIT);
};

const startExitMonitor = (
	proc: SpawnedProcess,
	state: { hasSettled: boolean; stderrBuffer: string },
	failFast: (error: Error) => void,
): void => {
	void (async () => {
		try {
			const exitCode = await proc.exited;
			if (state.hasSettled) {
				return;
			}

			if (exitCode !== 0) {
				const details = state.stderrBuffer.trim();
				failFast(
					new Error(
						`SSH process exited with code ${exitCode}${details ? `: ${details}` : ""}`,
					),
				);
			}
		} catch (error) {
			if (state.hasSettled) {
				return;
			}

			const message = extractErrorMessage(error);
			failFast(new Error(`SSH process exit watcher failed: ${message}`));
		}
	})();
};

const startStderrMonitor = (
	proc: SpawnedProcess,
	state: { hasSettled: boolean; stderrBuffer: string },
	failFast: (error: Error) => void,
): (() => Promise<void>) => {
	if (!proc.stderr || typeof proc.stderr === "number") {
		return async () => {};
	}

	const decoder = new TextDecoder();
	const stderrReader = proc.stderr.getReader();

	void (async () => {
		try {
			while (!state.hasSettled) {
				const { done, value } = await stderrReader.read();
				if (done) {
					break;
				}

				const chunk = decoder.decode(value, { stream: true });
				if (!chunk) {
					continue;
				}

				state.stderrBuffer = appendStderrChunk(state.stderrBuffer, chunk);
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
			if (state.hasSettled) {
				return;
			}

			const message = extractErrorMessage(error);
			failFast(new Error(`SSH stderr watcher failed: ${message}`));
		} finally {
			stderrReader.releaseLock();
		}
	})();

	return async () => {
		await stderrReader.cancel().catch(() => {});
	};
};

const killProcessWithGracePeriod = async (
	proc: SpawnedProcess,
): Promise<void> => {
	const runtime = getTunnelRuntime();
	proc.kill();
	await Promise.race([proc.exited, runtime.sleep(PROCESS_KILL_GRACE_MS)]);
};

const removeTemporaryFile = (
	path: string | null,
	deleteMessage: (pathValue: string) => string,
	failureMessage: (pathValue: string) => string,
): void => {
	if (!path) {
		return;
	}

	try {
		unlinkSync(path);
		console.log(deleteMessage(path));
	} catch {
		console.warn(failureMessage(path));
	}
};

const buildSshCommandArgs = (
	credentials: DbCredentials,
	localPort: number,
	targetHost: string,
	targetPort: number,
): string[] => {
	return [
		"ssh",
		"-N",
		"-L",
		`127.0.0.1:${localPort}:${targetHost}:${targetPort}`,
		"-p",
		(credentials.sshPort || DEFAULT_SSH_PORT).toString(),
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
};

const configurePrivateKeyAuth = async (
	runtime: TunnelRuntime,
	tempDir: string,
	credentials: DbCredentials,
	args: string[],
): Promise<string | null> => {
	if (!credentials.sshPrivateKey) {
		return null;
	}

	const keyPath = join(tempDir, `id_rsa_${randomUUID()}`);
	await runtime.writeFile(keyPath, credentials.sshPrivateKey, {
		mode: 0o600,
	});
	chmodSync(keyPath, 0o600);
	console.log(
		`[SSH Tunnel] Wrote private key to temporary file with strict mode 0600: ${keyPath}`,
	);
	args.push("-i", keyPath);
	return keyPath;
};

const configurePasswordAuth = async (
	runtime: TunnelRuntime,
	tempDir: string,
	credentials: DbCredentials,
	env: NodeJS.ProcessEnv,
): Promise<string | null> => {
	if (!credentials.sshPassword || credentials.sshPrivateKey) {
		return null;
	}

	const askPassPath = join(tempDir, `askpass_${randomUUID()}.sh`);
	const safePassword = credentials.sshPassword.replace(/"/g, '\\"');
	await runtime.writeFile(askPassPath, `#!/bin/sh\necho "${safePassword}"`, {
		mode: 0o700,
	});
	env.SSH_ASKPASS = askPassPath;
	env.SSH_ASKPASS_REQUIRE = "force";
	env.DISPLAY = "dummy:0";
	console.log(`[SSH Tunnel] Created askpass helper script: ${askPassPath}`);
	return askPassPath;
};

const cleanupOpenTunnelFailure = async (
	runtime: TunnelRuntime,
	proc: SpawnedProcess | null,
	keyPath: string | null,
	askPassPath: string | null,
	tempDir: string,
): Promise<void> => {
	if (proc) {
		try {
			await killProcessWithGracePeriod(proc);
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
};

export const waitForTunnelReadiness = async (
	proc: SpawnedProcess,
	localPort: number,
): Promise<void> => {
	const runtime = getTunnelRuntime();
	const deadline = Date.now() + STARTUP_TIMEOUT_MS;
	let attempt = 0;
	const state = {
		hasSettled: false,
		stderrBuffer: "",
	};

	let rejectFailFast: ((error: Error) => void) | null = null;
	const failFastPromise = new Promise<never>((_resolve, reject) => {
		rejectFailFast = reject;
	});

	const failFast = (error: Error) => {
		if (state.hasSettled) {
			return;
		}

		state.hasSettled = true;
		rejectFailFast?.(error);
	};

	console.log(
		`[SSH Tunnel] Waiting for local forward on 127.0.0.1:${localPort} (timeout=${STARTUP_TIMEOUT_MS}ms, interval=${POLLING_DELAY_MS}ms)`,
	);

	startExitMonitor(proc, state, failFast);
	const stopStderrMonitor = startStderrMonitor(proc, state, failFast);

	const pollUntilReady = async (): Promise<void> => {
		while (Date.now() < deadline && !state.hasSettled) {
			attempt += 1;

			const reachable = await runtime.canConnect("127.0.0.1", localPort, 200);
			if (reachable) {
				state.hasSettled = true;
				console.log(
					`[SSH Tunnel] Local forward is reachable after ${attempt} probe attempts.`,
				);
				return;
			}

			console.log(
				`[SSH Tunnel] Probe #${attempt} failed, local port ${localPort} not ready yet.`,
			);

			await Promise.race([runtime.sleep(POLLING_DELAY_MS), failFastPromise]);
		}

		if (!state.hasSettled) {
			state.hasSettled = true;
			throw new Error(
				`SSH tunnel did not become reachable on 127.0.0.1:${localPort} within ${STARTUP_TIMEOUT_MS}ms${state.stderrBuffer.trim() ? ` | stderr: ${state.stderrBuffer.trim()}` : ""}`,
			);
		}
	};

	try {
		await Promise.race([pollUntilReady(), failFastPromise]);
	} finally {
		state.hasSettled = true;
		await stopStderrMonitor();
	}
};

export const cleanupTunnelResources = async (
	tunnel: PooledTunnel,
): Promise<void> => {
	const runtime = getTunnelRuntime();
	console.log("[SSH Tunnel] Starting cleanup sequence.");

	if (tunnel.idleTimer) {
		clearTimeout(tunnel.idleTimer);
		tunnel.idleTimer = null;
	}

	try {
		console.log("[SSH Tunnel] Killing SSH child process.");
		await killProcessWithGracePeriod(tunnel.proc);
		console.log("[SSH Tunnel] SSH child process terminated.");
	} catch {
		console.warn(
			"[SSH Tunnel] Failed to kill SSH process cleanly (it may have already exited).",
		);
	}

	removeTemporaryFile(
		tunnel.keyPath,
		(path) => `[SSH Tunnel] Deleted temporary private key file: ${path}`,
		(path) =>
			`[SSH Tunnel] Could not delete temporary private key file: ${path}`,
	);

	removeTemporaryFile(
		tunnel.askPassPath,
		(path) => `[SSH Tunnel] Deleted temporary askpass file: ${path}`,
		(path) => `[SSH Tunnel] Could not delete temporary askpass file: ${path}`,
	);

	console.log(`[SSH Tunnel] Removing temporary directory: ${tunnel.tempDir}`);
	await runtime
		.rm(tunnel.tempDir, { recursive: true, force: true })
		.catch(() => {});

	console.log("[SSH Tunnel] Cleanup sequence completed.");
};

export const openTunnel = async (
	credentials: DbCredentials,
	cacheKey: string,
	targetHost: string,
	targetPort: number,
	onUnexpectedExit: (tunnel: PooledTunnel, exitCode: number) => void,
): Promise<PooledTunnel> => {
	const runtime = getTunnelRuntime();
	const localPort = await runtime.getFreePort();
	const tempDir = await runtime.mkdtemp(join(tmpdir(), "omnidump-ssh-"));
	let keyPath: string | null = null;
	let askPassPath: string | null = null;
	let proc: SpawnedProcess | null = null;

	try {
		console.log(`[SSH Tunnel] Created temporary directory: ${tempDir}`);
		const env = { ...process.env };
		const args = buildSshCommandArgs(
			credentials,
			localPort,
			targetHost,
			targetPort,
		);

		keyPath = await configurePrivateKeyAuth(
			runtime,
			tempDir,
			credentials,
			args,
		);
		askPassPath = await configurePasswordAuth(
			runtime,
			tempDir,
			credentials,
			env,
		);

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
			onUnexpectedExit(tunnel, exitCode);
		});

		return tunnel;
	} catch (error) {
		console.error("[SSH Tunnel Error - Tunnel Core Process]", error);
		await cleanupOpenTunnelFailure(
			runtime,
			proc,
			keyPath,
			askPassPath,
			tempDir,
		);
		throw error;
	}
};
