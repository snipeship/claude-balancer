import { formatTokens } from "@ccflare/ui-common";
import { COLORS } from "../../constants";
import { BaseAreaChart } from "./BaseAreaChart";

interface TokenUsageChartProps {
	data: Array<{
		time: string;
		tokens: number;
		[key: string]: string | number;
	}>;
	loading?: boolean;
	height?: number;
	viewMode?: "normal" | "cumulative";
	timeRange?: string;
}

export function TokenUsageChart({
	data,
	loading = false,
	height = 400,
	viewMode = "normal",
	timeRange = "24h",
}: TokenUsageChartProps) {
	const isLongRange = timeRange === "7d" || timeRange === "30d";

	const gradient = (
		<linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
			<stop
				offset="0%"
				stopColor={viewMode === "cumulative" ? COLORS.blue : COLORS.primary}
				stopOpacity={0.9}
			/>
			<stop
				offset="100%"
				stopColor={viewMode === "cumulative" ? COLORS.blue : COLORS.primary}
				stopOpacity={0.1}
			/>
		</linearGradient>
	);

	return (
		<BaseAreaChart
			data={data}
			dataKey="tokens"
			loading={loading}
			height={height}
			color={viewMode === "cumulative" ? COLORS.blue : COLORS.primary}
			gradientId="colorTokens"
			customGradient={gradient}
			strokeWidth={viewMode === "cumulative" ? 3 : 2}
			xAxisAngle={isLongRange ? -45 : 0}
			xAxisTextAnchor={isLongRange ? "end" : "middle"}
			xAxisHeight={isLongRange ? 60 : 30}
			tooltipFormatter={(value) => [formatTokens(value as number), "Tokens"]}
			tooltipLabelFormatter={(label) =>
				viewMode === "cumulative" ? `Cumulative at ${label}` : label
			}
			animationDuration={1000}
		/>
	);
}
