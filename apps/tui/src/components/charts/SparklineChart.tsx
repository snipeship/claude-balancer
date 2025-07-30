import { Box, Text } from "ink";
import { createSparkline, formatAxisValue } from "./utils";

interface SparklineChartProps {
	data: number[];
	label?: string;
	color?: "green" | "yellow" | "red" | "cyan" | "magenta" | "blue";
	showMinMax?: boolean;
	showCurrent?: boolean;
}

export function SparklineChart({
	data,
	label,
	color = "cyan",
	showMinMax = true,
	showCurrent = true,
}: SparklineChartProps) {
	if (data.length === 0) {
		return <Text dimColor>No data</Text>;
	}

	const sparkline = createSparkline(data);
	const min = Math.min(...data);
	const max = Math.max(...data);
	const current = data[data.length - 1];

	return (
		<Box>
			{label && (
				<Box marginRight={1}>
					<Text>{label}:</Text>
				</Box>
			)}
			<Text color={color}>{sparkline}</Text>
			{showMinMax && (
				<Text dimColor>
					{" "}
					[{formatAxisValue(min)} → {formatAxisValue(max)}]
				</Text>
			)}
			{showCurrent && (
				<Text color={color} bold>
					{" "}
					{formatAxisValue(current)}
				</Text>
			)}
		</Box>
	);
}
