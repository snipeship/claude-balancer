import { formatPercentage } from "@ccflare/ui-common";
import { COLORS } from "../../constants";
import { BaseScatterChart } from "./BaseScatterChart";

interface ModelPerformanceChartProps {
	data: Array<{
		model: string;
		avgTime: number;
		errorRate: number;
		[key: string]: string | number;
	}>;
	loading?: boolean;
	height?: number;
}

export function ModelPerformanceChart({
	data,
	loading = false,
	height = 300,
}: ModelPerformanceChartProps) {
	return (
		<BaseScatterChart
			data={data}
			xKey="avgTime"
			yKey="errorRate"
			loading={loading}
			height={height}
			fill={COLORS.primary}
			xAxisLabel="Avg Response Time (ms)"
			yAxisLabel="Error Rate %"
			tooltipFormatter={(value, name) => {
				if (name === "avgTime") return [`${value}ms`, "Avg Time"];
				if (name === "errorRate")
					return [formatPercentage(Number(value)), "Error Rate"];
				return [`${value}`, name || ""];
			}}
			tooltipStyle={{
				backgroundColor: COLORS.success,
				border: `1px solid ${COLORS.success}`,
				borderRadius: "var(--radius)",
				color: "#fff",
			}}
			renderLabel={(entry) => entry.model}
		/>
	);
}
