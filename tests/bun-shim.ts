export class SQL {
	constructor(..._args: unknown[]) {
		throw new Error("bun:SQL is unavailable in Vitest.");
	}
}

export const spawn = () => {
	throw new Error("bun:spawn is unavailable in Vitest.");
};

export class Glob {
	constructor(_pattern: string) {}

	scanSync(): string[] {
		return [];
	}

	async *scan(): AsyncIterable<string> {}
}
