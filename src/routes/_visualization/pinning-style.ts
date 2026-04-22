export type VisualizationPinnedDirection = "left" | "right" | false;
export type VisualizationPinnedSurface = "header" | "body";

export const getVisualizationPinnedStyle = ({
	pinned,
	offset,
	surface,
}: {
	pinned: VisualizationPinnedDirection;
	offset: number;
	surface: VisualizationPinnedSurface;
}): Record<string, string | number> => {
	if (pinned === false) {
		return {};
	}

	const isLeft = pinned === "left";
	const zIndex = surface === "header" ? 210 : 160;
	const backgroundColor =
		surface === "header" ? "var(--secondary)" : "var(--card)";

	return {
		position: "sticky",
		[isLeft ? "left" : "right"]: `${offset}px`,
		zIndex,
		backgroundColor,
		boxShadow: isLeft
			? "2px 1px 2px var(--border)"
			: "-2px 1px 2px var(--border)",
	};
};
