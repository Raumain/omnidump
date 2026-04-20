import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const vitestBunShim = fileURLToPath(
	new URL("./tests/bun-shim.ts", import.meta.url),
);

const config = defineConfig({
	build: {
		rollupOptions: {
			external: ["bun"],
		},
	},
	resolve: {
		alias: process.env.VITEST ? { bun: vitestBunShim } : undefined,
		dedupe: ["react", "react-dom"],
	},
	ssr: {
		external: ["bun"],
	},
	plugins: [
		devtools(),
		tsconfigPaths({ projects: ["./tsconfig.json"] }),
		tailwindcss(),
		...(process.env.VITEST ? [] : [tanstackStart()]),
		viteReact(),
	],
});

export default config;
