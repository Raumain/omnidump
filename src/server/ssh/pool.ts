import {
	DEFAULT_SSH_PORT,
	DEFAULT_TUNNEL_IDLE_TIMEOUT_MS,
} from "#/lib/constants";
import type { DbCredentials } from "#/lib/db/connection";
import { cleanupTunnelResources, openTunnel } from "./process";
import type { PooledTunnel, TunnelEntry } from "./types";

let tunnelIdleTimeoutMs: number = DEFAULT_TUNNEL_IDLE_TIMEOUT_MS;
const tunnelRegistry = new Map<string, TunnelEntry>();

const buildTunnelCacheKey = (
	credentials: DbCredentials,
	targetHost: string,
	targetPort: number,
): string => {
	return [
		credentials.sshHost,
		credentials.sshUser,
		(credentials.sshPort || DEFAULT_SSH_PORT).toString(),
		targetHost,
		targetPort.toString(),
		credentials.sshPrivateKey ? "key" : "password",
	].join("|");
};

export const closeTunnel = async (
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

export const refreshTunnelIdleTimeout = (tunnel: PooledTunnel): void => {
	scheduleIdleTimeout(tunnel.cacheKey, tunnel);
};

export const getOrCreateTunnel = async (
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
		(tunnel, exitCode) => {
			void closeTunnel(cacheKey, tunnel, `process-exit-${exitCode}`);
		},
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

export const __setTunnelPoolIdleTimeoutForTests = (ms: number): void => {
	tunnelIdleTimeoutMs = ms;
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
