import { Box, Text } from "ink";
import { formatAxisValue } from "./utils";

export interface PieChartData {
	label: string;
	value: number;
	color?: "green" | "yellow" | "red" | "cyan" | "magenta" | "blue";
}

interface PieChartProps {
	data: PieChartData[];
	title?: string;
	showLegend?: boolean;
	size?: "small" | "medium" | "large";
}

const _PIE_CHARS = {
	full: "●",
	three_quarters: "◕",
	half: "◐",
	quarter: "◔",
	empty: "○",
} as const;

const SIZE_CONFIG = {
	small: { radius: 3, chars: ["•", "○"] },
	medium: { radius: 5, chars: ["●", "○"] },
	large: { radius: 7, chars: ["●", "○"] },
} as const;

export function PieChart({
	data,
	title,
	showLegend = true,
	size = "medium",
}: PieChartProps) {
	if (data.length === 0) {
		return (
			<Box flexDirection="column">
				{title && (
					<Text bold underline>
						{title}
					</Text>
				)}
				<Text dimColor>No data available</Text>
			</Box>
		);
	}

	const total = data.reduce((sum, item) => sum + item.value, 0);
	const percentages = data.map((item) => ({
		...item,
		percentage: total > 0 ? (item.value / total) * 100 : 0,
	}));

	// Sort by percentage for better visualization
	percentages.sort((a, b) => b.percentage - a.percentage);

	// Simple ASCII representation
	const { radius } = SIZE_CONFIG[size];
	const diameter = radius * 2 + 1;

	// Create a simple circular visualization
	const createCircle = () => {
		const circle: string[][] = [];
		for (let y = 0; y < diameter; y++) {
			const row: string[] = [];
			for (let x = 0; x < diameter; x++) {
				const dx = x - radius;
				const dy = y - radius;
				const distance = Math.sqrt(dx * dx + dy * dy);

				if (distance <= radius) {
					// Determine which segment this point belongs to
					let angle = Math.atan2(dy, dx) + Math.PI; // 0 to 2π
					angle = angle / (2 * Math.PI); // 0 to 1

					let cumulativePercentage = 0;
					let segmentIndex = 0;
					for (let i = 0; i < percentages.length; i++) {
						cumulativePercentage += percentages[i].percentage / 100;
						if (angle <= cumulativePercentage) {
							segmentIndex = i;
							break;
						}
					}

					const color = percentages[segmentIndex]?.color || "cyan";
					row.push(color);
				} else {
					row.push(" ");
				}
			}
			circle.push(row);
		}
		return circle;
	};

	const circleColors = createCircle();

	return (
		<Box flexDirection="column">
			{title && (
				<Box marginBottom={1}>
					<Text bold underline>
						{title}
					</Text>
				</Box>
			)}

			<Box flexDirection="row">
				{/* Pie visualization */}
				<Box flexDirection="column" marginRight={2}>
					{circleColors.map((row, y) => (
						<Box key={`pie-row-${y}-${radius}`}>
							{row.map((color, x) => (
								<Text
									key={`pie-cell-${x}-${y}-${radius}`}
									color={
										color === " "
											? undefined
											: (color as
													| "green"
													| "yellow"
													| "red"
													| "cyan"
													| "magenta"
													| "blue")
									}
								>
									{color === " " ? " " : "●"}
								</Text>
							))}
						</Box>
					))}
				</Box>

				{/* Legend */}
				{showLegend && (
					<Box flexDirection="column">
						{percentages.map((item, index) => (
							<Box key={`${item.label}-${index}`}>
								<Text color={item.color || "cyan"}>● </Text>
								<Text>{item.label}: </Text>
								<Text bold>{Math.round(item.percentage)}%</Text>
								<Text dimColor> ({formatAxisValue(item.value)})</Text>
							</Box>
						))}
						<Box marginTop={1}>
							<Text dimColor>Total: {formatAxisValue(total)}</Text>
						</Box>
					</Box>
				)}
			</Box>
		</Box>
	);
}
