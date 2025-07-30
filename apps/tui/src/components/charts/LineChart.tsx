import { Box, Text } from "ink";
import { formatAxisValue, getSparkChar, normalizeData } from "./utils";

export interface LineChartData {
	x: string;
	y: number;
}

interface LineChartProps {
	data: LineChartData[];
	height?: number;
	width?: number;
	title?: string;
	color?: "green" | "yellow" | "red" | "cyan" | "magenta" | "blue";
	showAxes?: boolean;
}

export function LineChart({
	data,
	height = 10,
	width = 40,
	title,
	color = "cyan",
	showAxes = true,
}: LineChartProps) {
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

	const values = data.map((d) => d.y);
	const { normalized, max, min } = normalizeData(values, height - 1);

	// Create the chart grid
	const chart: string[][] = Array(height)
		.fill(null)
		.map(() => Array(width).fill(" "));

	// Plot the points
	const xStep = Math.max(1, Math.floor(data.length / width));
	for (let i = 0; i < width && i * xStep < data.length; i++) {
		const dataIndex = i * xStep;
		const value = normalized[dataIndex];
		const y = height - 1 - Math.round(value);
		const x = i;

		if (y >= 0 && y < height) {
			// Use different characters based on the position in the y-axis
			const char = getSparkChar(values[dataIndex], min, max);
			chart[y][x] = char;
		}
	}

	return (
		<Box flexDirection="column">
			{title && (
				<Box marginBottom={1}>
					<Text bold underline>
						{title}
					</Text>
				</Box>
			)}

			{/* Y-axis labels and chart */}
			{showAxes && (
				<Box>
					<Text dimColor>{formatAxisValue(max).padStart(6)} </Text>
					<Text dimColor>┤</Text>
				</Box>
			)}

			{chart.map((row, y) => (
				<Box key={`chart-row-${y}-${height}`}>
					{showAxes && y === Math.floor(height / 2) && (
						<Text dimColor>
							{formatAxisValue((max + min) / 2).padStart(6)}{" "}
						</Text>
					)}
					{showAxes && y !== Math.floor(height / 2) && (
						<Text>{" ".repeat(6)} </Text>
					)}
					{showAxes && <Text dimColor>│</Text>}
					<Text color={color}>{row.join("")}</Text>
				</Box>
			))}

			{showAxes && (
				<>
					<Box>
						<Text dimColor>{formatAxisValue(min).padStart(6)} </Text>
						<Text dimColor>└{"─".repeat(width)}</Text>
					</Box>
					{/* X-axis labels */}
					<Box marginLeft={8}>
						<Text dimColor>
							{data[0].x}
							{" ".repeat(
								Math.max(
									0,
									width - data[0].x.length - data[data.length - 1].x.length,
								),
							)}
							{data[data.length - 1].x}
						</Text>
					</Box>
				</>
			)}
		</Box>
	);
}
