import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { DbCredentials } from "../src/lib/db/connection";
import {
	__resetTunnelPoolForTests,
	__setTunnelPoolIdleTimeoutForTests,
	__setTunnelRuntimeForTests,
	withTunnel,
} from "../src/server/ssh-tunnel";

vi.mock("bun", () => ({
	spawn: vi.fn(),
}));

const baseCredentials: DbCredentials = {
	driver: "postgres",
	host: "127.0.0.1",
	port: 5432,
	user: "postgres",
	password: "postgres",
	database: "postgres",
	useSsh: true,
	sshHost: "bastion.internal",
	sshPort: 22,
	sshUser: "ubuntu",
};

const makeStderrStream = (text: string): ReadableStream<Uint8Array> => {
	const encoder = new TextEncoder();

	return new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(encoder.encode(text));
			controller.close();
		},
	});
};

const createMockProcess = (
	initialExitCode: number | null,
	stderrText: string = "",
) => {
	let currentExitCode = initialExitCode;
	let resolveExited: (code: number) => void = () => {};
	const exited = new Promise<number>((resolve) => {
		resolveExited = resolve;
	});

	if (initialExitCode !== null) {
		resolveExited(initialExitCode);
	}

	const state = {
		killed: false,
	};

	const proc = {
		get exitCode() {
			return currentExitCode;
		},
		exited,
		stderr: stderrText ? makeStderrStream(stderrText) : undefined,
		kill: () => {
			state.killed = true;
			if (currentExitCode === null) {
				currentExitCode = 0;
				resolveExited(0);
			}
		},
	};

	return {
		proc,
		state,
		setExitCode: (code: number) => {
			currentExitCode = code;
			resolveExited(code);
		},
	};
};

describe("withTunnel", () => {
	beforeEach(async () => {
		__setTunnelRuntimeForTests(null);
		await __resetTunnelPoolForTests();
	});

	afterEach(async () => {
		__setTunnelRuntimeForTests(null);
		__setTunnelPoolIdleTimeoutForTests(10_000);
		await __resetTunnelPoolForTests();
	});

	test("bypasses ssh flow when useSsh is disabled", async () => {
		const credentials: DbCredentials = { ...baseCredentials, useSsh: false };
		let actionCalls = 0;

		const result = await withTunnel(credentials, async (creds) => {
			actionCalls += 1;
			return creds.host;
		});

		expect(result).toBe("127.0.0.1");
		expect(actionCalls).toBe(1);
	});

	test("waits for readiness and executes action through local forwarded endpoint", async () => {
		const processMock = createMockProcess(null);
		let canConnectAttempts = 0;
		let removedTempDir: string | null = null;

		__setTunnelRuntimeForTests({
			getFreePort: async () => 54320,
			mkdtemp: async () => "/tmp/omnidump-ssh-test",
			writeFile: async () => undefined,
			rm: async (path) => {
				removedTempDir = path;
			},
			spawn: () => processMock.proc as never,
			sleep: async () => undefined,
			canConnect: async () => {
				canConnectAttempts += 1;
				return canConnectAttempts >= 3;
			},
		});

		const result = await withTunnel(baseCredentials, async (creds) => {
			expect(creds.host).toBe("127.0.0.1");
			expect(creds.port).toBe(54320);
			return "ok";
		});

		expect(result).toBe("ok");
		expect(canConnectAttempts).toBe(3);
		await __resetTunnelPoolForTests();
		expect(processMock.state.killed).toBe(true);
		expect(removedTempDir).not.toBeNull();
		if (removedTempDir === null) {
			throw new Error("Expected temp directory cleanup to be called");
		}
		expect(String(removedTempDir)).toBe("/tmp/omnidump-ssh-test");
	});

	test("throws explicit error when ssh process exits before readiness", async () => {
		const processMock = createMockProcess(255, "forwarding failed");

		__setTunnelRuntimeForTests({
			getFreePort: async () => 54320,
			mkdtemp: async () => "/tmp/omnidump-ssh-test",
			writeFile: async () => undefined,
			rm: async () => undefined,
			spawn: () => processMock.proc as never,
			sleep: async () => undefined,
			canConnect: async () => false,
		});

		await expect(
			withTunnel(baseCredentials, async () => {
				throw new Error("should not run");
			}),
		).rejects.toThrow("SSH process exited with code 255");
	});

	test("cleans up ssh process and temp files when action fails", async () => {
		const processMock = createMockProcess(null);
		let rmCalls = 0;

		__setTunnelRuntimeForTests({
			getFreePort: async () => 54320,
			mkdtemp: async () => "/tmp/omnidump-ssh-test",
			writeFile: async () => undefined,
			rm: async () => {
				rmCalls += 1;
			},
			spawn: () => processMock.proc as never,
			sleep: async () => undefined,
			canConnect: async () => true,
		});

		await expect(
			withTunnel(baseCredentials, async () => {
				throw new Error("db probe failed");
			}),
		).rejects.toThrow("db probe failed");

		await __resetTunnelPoolForTests();
		expect(processMock.state.killed).toBe(true);
		expect(rmCalls).toBe(1);
	});
});
