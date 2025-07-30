import { Box, Text } from "ink";
import { createBar, formatAxisValue, getColorForValue } from "./utils";

export interface BarChartData {
	label: string;
	value: number;
	color?: "green" | "yellow" | "red" | "cyan" | "magenta" | "blue";
}

interface BarChartProps {
	data: BarChartData[];
	width?: number;
	showValues?: boolean;
	title?: string;
	colorThresholds?: { good: number; warning: number };
}

export function BarChart({
	data,
	width = 30,
	showValues = true,
	title,
	colorThresholds,
}: BarChartProps) {
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

	const maxValue = Math.max(...data.map((d) => d.value));
	const maxLabelLength = Math.max(...data.map((d) => d.label.length));

	return (
		<Box flexDirection="column">
			{title && (
				<Box marginBottom={1}>
					<Text bold underline>
						{title}
					</Text>
				</Box>
			)}
			{data.map((item, index) => {
				const bar = createBar(item.value, maxValue, width, false);
				const color =
					item.color ||
					(colorThresholds
						? getColorForValue(item.value, colorThresholds)
						: "cyan");

				return (
					<Box key={`${item.label}-${index}`}>
						<Box width={maxLabelLength + 2}>
							<Text>{item.label}:</Text>
						</Box>
						<Text color={color}>{bar}</Text>
						{showValues && <Text dimColor> {formatAxisValue(item.value)}</Text>}
					</Box>
				);
			})}
		</Box>
	);
}
