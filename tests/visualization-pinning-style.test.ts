import { describe, expect, it } from "vitest";

import { getVisualizationPinnedStyle } from "../src/routes/_visualization/pinning-style";

describe("getVisualizationPinnedStyle", () => {
	it("returns empty style for unpinned columns", () => {
		expect(
			getVisualizationPinnedStyle({
				pinned: false,
				offset: 0,
				surface: "body",
			}),
		).toEqual({});
	});

	it("returns sticky left style with readable background", () => {
		expect(
			getVisualizationPinnedStyle({
				pinned: "left",
				offset: 48,
				surface: "body",
			}),
		).toEqual({
			position: "sticky",
			left: "48px",
			zIndex: 160,
			backgroundColor: "hsl(var(--card) / 1)",
			boxShadow: "2px 0 0 hsl(var(--border))",
		});
	});

	it("uses header surface color and highest z-index for pinned header cells", () => {
		expect(
			getVisualizationPinnedStyle({
				pinned: "right",
				offset: 64,
				surface: "header",
			}),
		).toEqual({
			position: "sticky",
			right: "64px",
			zIndex: 210,
			backgroundColor: "hsl(var(--secondary) / 1)",
			boxShadow: "-2px 0 0 hsl(var(--border))",
		});
	});

	it("keeps pinned body cells above non-pinned stacking contexts", () => {
		const leftPinned = getVisualizationPinnedStyle({
			pinned: "left",
			offset: 0,
			surface: "body",
		});

		const rightPinned = getVisualizationPinnedStyle({
			pinned: "right",
			offset: 0,
			surface: "body",
		});

		expect(leftPinned.zIndex).toBeGreaterThan(100);
		expect(rightPinned.zIndex).toBeGreaterThan(100);
	});
});
