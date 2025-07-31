import { formatCost } from "@ccflare/ui-common";
import { COLORS } from "../../constants";
import { formatCompactCurrency } from "../../lib/chart-utils";
import { BaseAreaChart } from "./BaseAreaChart";

interface CostChartProps {
	data: Array<{
		time: string;
		cost: number;
		[key: string]: string | number;
	}>;
	loading?: boolean;
	height?: number;
	viewMode?: "normal" | "cumulative";
	timeRange?: string;
}

export function CostChart({
	data,
	loading = false,
	height = 400,
	viewMode = "normal",
	timeRange = "24h",
}: CostChartProps) {
	const isLongRange = timeRange === "7d" || timeRange === "30d";

	const gradient = (
		<linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
			<stop
				offset="0%"
				stopColor={viewMode === "cumulative" ? COLORS.warning : COLORS.primary}
				stopOpacity={0.9}
			/>
			<stop
				offset="100%"
				stopColor={viewMode === "cumulative" ? COLORS.warning : COLORS.primary}
				stopOpacity={0.1}
			/>
		</linearGradient>
	);

	return (
		<BaseAreaChart
			data={data}
			dataKey="cost"
			loading={loading}
			height={height}
			color={viewMode === "cumulative" ? COLORS.warning : COLORS.primary}
			gradientId="colorCost"
			customGradient={gradient}
			strokeWidth={viewMode === "cumulative" ? 3 : 2}
			xAxisAngle={isLongRange ? -45 : 0}
			xAxisTextAnchor={isLongRange ? "end" : "middle"}
			xAxisHeight={isLongRange ? 60 : 30}
			yAxisTickFormatter={formatCompactCurrency}
			tooltipFormatter={(value) => [formatCost(Number(value)), "Cost"]}
			tooltipLabelFormatter={(label) =>
				viewMode === "cumulative" ? `Cumulative at ${label}` : label
			}
			animationDuration={1000}
		/>
	);
}
