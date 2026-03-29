import net from "node:net";
import { Client, type ConnectConfig } from "ssh2";

import type { DbCredentials } from "../lib/db/connection";

export const withTunnel = async <T>(
	credentials: DbCredentials,
	action: (tunneledCreds: DbCredentials) => Promise<T>,
): Promise<T> => {
	if (!credentials.useSsh) {
		return await action(credentials);
	}

	return await new Promise<T>((resolve, reject) => {
		const ssh = new Client();
		let server: net.Server;

		let settled = false;

		const settleReject = (error: unknown) => {
			if (settled) {
				return;
			}

			settled = true;

			if (server?.listening) {
				server.close();
			}

			ssh.end();
			reject(error);
		};

		ssh.on("ready", () => {
			server = net.createServer((sock) => {
				ssh.forwardOut(
					sock.remoteAddress ?? "127.0.0.1",
					sock.remotePort ?? 0,
					credentials.host ?? "127.0.0.1",
					credentials.port ?? 0,
					(err, stream) => {
						if (err) {
							sock.end();
							return;
						}

						sock.pipe(stream).pipe(sock);
						stream.on("error", () => sock.end());
						sock.on("error", () => stream.end());
					},
				);
			});

			server.on("error", (error) => settleReject(error));

			server.listen(0, "127.0.0.1", async () => {
				const localPort = (server.address() as net.AddressInfo).port;

				try {
					const result = await action({
						...credentials,
						host: "127.0.0.1",
						port: localPort,
					});

					if (settled) {
						return;
					}

					settled = true;
					resolve(result);
				} catch (error) {
					settleReject(error);
				} finally {
					server.close();
					ssh.end();
				}
			});
		});

		ssh.on("error", (err) => settleReject(err));

		const sshConfig: ConnectConfig = {
			host: credentials.sshHost,
			port: credentials.sshPort || 22,
			username: credentials.sshUser,
		};

		if (credentials.sshPrivateKey) {
			console.log("nok");
			sshConfig.privateKey = credentials.sshPrivateKey;

			if (credentials.sshPassword) {
				sshConfig.passphrase = credentials.sshPassword;
			}
		} else if (credentials.sshPassword) {
			console.log("ok");
			sshConfig.password = credentials.sshPassword;
		}

		ssh.connect(sshConfig);
	});
};
