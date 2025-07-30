// Bar chart characters
export const BAR_CHARS = {
	full: "█",
	seven_eighths: "▇",
	three_quarters: "▆",
	five_eighths: "▅",
	half: "▄",
	three_eighths: "▃",
	quarter: "▂",
	one_eighth: "▁",
	empty: " ",
} as const;

// Line chart characters
export const LINE_CHARS = {
	horizontal: "─",
	vertical: "│",
	cross: "┼",
	bottom_left: "└",
	bottom_right: "┘",
	top_left: "┌",
	top_right: "┐",
	vertical_right: "├",
	vertical_left: "┤",
	horizontal_down: "┬",
	horizontal_up: "┴",
} as const;

// Sparkline characters
export const SPARK_CHARS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;

// Get a bar character based on percentage (0-1)
export function getBarChar(percentage: number): string {
	if (percentage >= 1) return BAR_CHARS.full;
	if (percentage >= 0.875) return BAR_CHARS.seven_eighths;
	if (percentage >= 0.75) return BAR_CHARS.three_quarters;
	if (percentage >= 0.625) return BAR_CHARS.five_eighths;
	if (percentage >= 0.5) return BAR_CHARS.half;
	if (percentage >= 0.375) return BAR_CHARS.three_eighths;
	if (percentage >= 0.25) return BAR_CHARS.quarter;
	if (percentage >= 0.125) return BAR_CHARS.one_eighth;
	return BAR_CHARS.empty;
}

// Get a sparkline character based on value position in range
export function getSparkChar(value: number, min: number, max: number): string {
	if (max === min) return SPARK_CHARS[0];
	const percentage = (value - min) / (max - min);
	const index = Math.floor(percentage * (SPARK_CHARS.length - 1));
	return SPARK_CHARS[Math.max(0, Math.min(index, SPARK_CHARS.length - 1))];
}

// Normalize data to fit within a specific range
export function normalizeData(
	data: number[],
	targetMax: number,
): { normalized: number[]; max: number; min: number } {
	const max = Math.max(...data, 0);
	const min = Math.min(...data, 0);
	const range = max - min || 1;

	const normalized = data.map((value) => {
		const percentage = (value - min) / range;
		return percentage * targetMax;
	});

	return { normalized, max, min };
}

// Format a number for display with appropriate units
export function formatAxisValue(value: number): string {
	if (value >= 1000000) {
		return `${(value / 1000000).toFixed(1)}M`;
	}
	if (value >= 1000) {
		return `${(value / 1000).toFixed(1)}K`;
	}
	if (value < 1 && value > 0) {
		return value.toFixed(2);
	}
	return Math.round(value).toString();
}

// Create a horizontal bar
export function createBar(
	value: number,
	maxValue: number,
	width: number,
	showPercentage = true,
): string {
	const percentage = maxValue > 0 ? value / maxValue : 0;
	const filledWidth = Math.floor(percentage * width);
	const remainingWidth = width - filledWidth;

	let bar = "";
	for (let i = 0; i < filledWidth; i++) {
		bar += BAR_CHARS.full;
	}

	// Add partial bar for the remaining percentage
	if (remainingWidth > 0) {
		const remainingPercentage = percentage * width - filledWidth;
		bar += getBarChar(remainingPercentage);
		for (let i = 1; i < remainingWidth; i++) {
			bar += BAR_CHARS.empty;
		}
	}

	if (showPercentage) {
		const percentStr = `${Math.round(percentage * 100)}%`;
		return `${bar} ${percentStr}`;
	}

	return bar;
}

// Create a sparkline from data
export function createSparkline(data: number[]): string {
	if (data.length === 0) return "";

	const max = Math.max(...data);
	const min = Math.min(...data);

	return data.map((value) => getSparkChar(value, min, max)).join("");
}

// Get color based on value and thresholds
export function getColorForValue(
	value: number,
	thresholds: { good: number; warning: number },
	inverse = false,
): "green" | "yellow" | "red" {
	if (inverse) {
		if (value <= thresholds.good) return "green";
		if (value <= thresholds.warning) return "yellow";
		return "red";
	} else {
		if (value >= thresholds.good) return "green";
		if (value >= thresholds.warning) return "yellow";
		return "red";
	}
}
