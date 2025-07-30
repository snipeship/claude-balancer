import { formatTokensPerSecond } from "@ccflare/ui-common";
import { COLORS } from "../../constants";
import { BaseAreaChart } from "./BaseAreaChart";

interface TokenSpeedChartProps {
	data: Array<{
		time: string;
		avgTokensPerSecond: number;
		[key: string]: string | number;
	}>;
	loading?: boolean;
	height?: number;
	timeRange?: string;
}

export function TokenSpeedChart({
	data,
	loading = false,
	height = 400,
	timeRange = "24h",
}: TokenSpeedChartProps) {
	const isLongRange = timeRange === "7d" || timeRange === "30d";

	// Filter out null values for better chart display
	const filteredData = data.map((point) => ({
		...point,
		avgTokensPerSecond: point.avgTokensPerSecond || 0,
	}));

	const gradient = (
		<linearGradient id="colorSpeed" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0%" stopColor={COLORS.purple} stopOpacity={0.9} />
			<stop offset="100%" stopColor={COLORS.purple} stopOpacity={0.1} />
		</linearGradient>
	);

	return (
		<BaseAreaChart
			data={filteredData}
			dataKey="avgTokensPerSecond"
			loading={loading}
			height={height}
			color={COLORS.purple}
			gradientId="colorSpeed"
			customGradient={gradient}
			strokeWidth={2}
			xAxisAngle={isLongRange ? -45 : 0}
			xAxisTextAnchor={isLongRange ? "end" : "middle"}
			xAxisHeight={isLongRange ? 60 : 30}
			tooltipFormatter={(value) => [
				formatTokensPerSecond(value as number),
				"Output Speed",
			]}
			animationDuration={1000}
		/>
	);
}
