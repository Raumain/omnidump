import { DEFAULT_MYSQL_PORT, DEFAULT_POSTGRES_PORT } from "../lib/constants";
import type { DbCredentials } from "../lib/db/connection";
import {
	__resetTunnelPoolForTests,
	__setTunnelPoolIdleTimeoutForTests,
	getOrCreateTunnel,
	refreshTunnelIdleTimeout,
} from "./ssh/pool";
import { __setTunnelRuntimeForTests } from "./ssh/runtime";

export {
	__resetTunnelPoolForTests,
	__setTunnelPoolIdleTimeoutForTests,
	__setTunnelRuntimeForTests,
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
		credentials.port ||
		(credentials.driver === "postgres"
			? DEFAULT_POSTGRES_PORT
			: DEFAULT_MYSQL_PORT);
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

		refreshTunnelIdleTimeout(tunnel);

		return result;
	} catch (error) {
		console.error("[SSH Tunnel Error - Tunnel Core Process]", error);
		refreshTunnelIdleTimeout(tunnel);
		throw error;
	}
};
