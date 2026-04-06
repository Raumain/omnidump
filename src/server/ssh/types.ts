export type SpawnedProcess = {
	exitCode: number | null;
	exited: Promise<number>;
	stderr?: ReadableStream<Uint8Array> | number | null;
	kill: () => void;
};

export type TunnelRuntime = {
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

export type PooledTunnel = {
	cacheKey: string;
	localPort: number;
	proc: SpawnedProcess;
	tempDir: string;
	keyPath: string | null;
	askPassPath: string | null;
	idleTimer: ReturnType<typeof setTimeout> | null;
	closing: boolean;
};

export type TunnelEntry = {
	openingPromise: Promise<PooledTunnel>;
	tunnel: PooledTunnel | null;
};
