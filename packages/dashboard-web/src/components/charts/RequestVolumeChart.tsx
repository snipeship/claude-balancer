import { formatNumber } from "@ccflare/ui-common";
import { COLORS } from "../../constants";
import { formatCompactNumber } from "../../lib/chart-utils";
import { BaseAreaChart } from "./BaseAreaChart";

interface RequestVolumeChartProps {
	data: Array<{
		time: string;
		requests: number;
		[key: string]: string | number;
	}>;
	loading?: boolean;
	height?: number;
	viewMode?: "normal" | "cumulative";
	timeRange?: string;
}

export function RequestVolumeChart({
	data,
	loading = false,
	height = 400,
	viewMode = "normal",
	timeRange = "24h",
}: RequestVolumeChartProps) {
	const isLongRange = timeRange === "7d" || timeRange === "30d";

	const gradient =
		viewMode === "cumulative" ? (
			<linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0%" stopColor={COLORS.purple} stopOpacity={0.9} />
				<stop offset="50%" stopColor={COLORS.primary} stopOpacity={0.7} />
				<stop offset="100%" stopColor={COLORS.blue} stopOpacity={0.3} />
			</linearGradient>
		) : undefined;

	return (
		<BaseAreaChart
			data={data}
			dataKey="requests"
			loading={loading}
			height={height}
			color={viewMode === "cumulative" ? COLORS.purple : COLORS.primary}
			gradientId="colorRequests"
			customGradient={gradient}
			strokeWidth={viewMode === "cumulative" ? 3 : 2}
			xAxisAngle={isLongRange ? -45 : 0}
			xAxisTextAnchor={isLongRange ? "end" : "middle"}
			xAxisHeight={isLongRange ? 60 : 30}
			yAxisTickFormatter={formatCompactNumber}
			tooltipFormatter={(value) => [formatNumber(value as number), "Requests"]}
			tooltipLabelFormatter={(label) =>
				viewMode === "cumulative" ? `Cumulative at ${label}` : label
			}
			animationDuration={1000}
		/>
	);
}
