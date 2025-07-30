import { COLORS } from "../../constants";
import { BaseAreaChart } from "./BaseAreaChart";

interface ResponseTimeChartProps {
	data: Array<{
		time: string;
		responseTime: number;
		[key: string]: string | number;
	}>;
	loading?: boolean;
	height?: number;
	viewMode?: "normal" | "cumulative";
	timeRange?: string;
}

export function ResponseTimeChart({
	data,
	loading = false,
	height = 400,
	viewMode = "normal",
	timeRange = "24h",
}: ResponseTimeChartProps) {
	const isLongRange = timeRange === "7d" || timeRange === "30d";

	return (
		<BaseAreaChart
			data={data}
			dataKey="responseTime"
			loading={loading}
			height={height}
			color={viewMode === "cumulative" ? COLORS.purple : COLORS.primary}
			strokeWidth={viewMode === "cumulative" ? 3 : 2}
			xAxisAngle={isLongRange ? -45 : 0}
			xAxisTextAnchor={isLongRange ? "end" : "middle"}
			xAxisHeight={isLongRange ? 60 : 30}
			tooltipFormatter={(value) => [`${value}ms`, "Response Time"]}
			tooltipLabelFormatter={(label) =>
				viewMode === "cumulative" ? `Cumulative at ${label}` : label
			}
			animationDuration={1000}
		/>
	);
}
