import { mkdtemp, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { spawn } from "bun";
import type { TunnelRuntime } from "./types";

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

export const getTunnelRuntime = (): TunnelRuntime => runtime;

export const __setTunnelRuntimeForTests = (
	overrides: Partial<TunnelRuntime> | null,
): void => {
	runtime = overrides ? { ...defaultRuntime, ...overrides } : defaultRuntime;
};
