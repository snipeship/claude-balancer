import type { ReactNode } from "react";
import {
	Cell,
	Legend,
	Pie,
	PieChart,
	ResponsiveContainer,
	Tooltip,
} from "recharts";
import {
	CHART_COLORS,
	type CHART_HEIGHTS,
	type CHART_TOOLTIP_STYLE,
} from "../../constants";
import { ChartContainer } from "./ChartContainer";
import { getChartHeight, getTooltipStyles } from "./chart-utils";
import type { ChartClickHandler, TooltipFormatterFunction } from "./types";

interface BasePieChartProps {
	data: Array<{ name: string; value: number; [key: string]: string | number }>;
	dataKey?: string;
	nameKey?: string;
	loading?: boolean;
	height?: keyof typeof CHART_HEIGHTS | number;
	innerRadius?: number;
	outerRadius?: number;
	paddingAngle?: number;
	cx?: string | number;
	cy?: string | number;
	colors?: string[];
	tooltipFormatter?: TooltipFormatterFunction;
	tooltipStyle?: keyof typeof CHART_TOOLTIP_STYLE | object;
	animationDuration?: number;
	showLegend?: boolean;
	legendLayout?: "horizontal" | "vertical";
	legendAlign?: "left" | "center" | "right";
	legendVerticalAlign?: "top" | "middle" | "bottom";
	renderLabel?: boolean;
	className?: string;
	error?: Error | null;
	emptyState?: ReactNode;
	onPieClick?: ChartClickHandler;
}

export function BasePieChart({
	data,
	dataKey = "value",
	nameKey = "name",
	loading = false,
	height = "medium",
	innerRadius = 0,
	outerRadius = 80,
	paddingAngle = 0,
	cx = "50%",
	cy = "50%",
	colors = [...CHART_COLORS],
	tooltipFormatter,
	tooltipStyle = "default",
	animationDuration = 1000,
	showLegend = false,
	legendLayout = "horizontal",
	legendAlign = "center",
	legendVerticalAlign = "bottom",
	renderLabel = false,
	className = "",
	error = null,
	emptyState,
	onPieClick,
}: BasePieChartProps) {
	const chartHeight = getChartHeight(height);
	const isEmpty = !data || data.length === 0;
	const tooltipStyles = getTooltipStyles(tooltipStyle);

	return (
		<ChartContainer
			loading={loading}
			height={height}
			className={className}
			error={error}
			isEmpty={isEmpty}
			emptyState={emptyState}
		>
			<ResponsiveContainer width="100%" height={chartHeight}>
				<PieChart>
					<Pie
						data={data}
						cx={cx}
						cy={cy}
						innerRadius={innerRadius}
						outerRadius={outerRadius}
						paddingAngle={paddingAngle}
						dataKey={dataKey}
						nameKey={nameKey}
						animationDuration={animationDuration}
						label={renderLabel}
						onClick={onPieClick}
					>
						{data.map((entry, index) => (
							<Cell
								key={`cell-${entry[nameKey]}`}
								fill={colors[index % colors.length]}
							/>
						))}
					</Pie>
					<Tooltip contentStyle={tooltipStyles} formatter={tooltipFormatter} />
					{showLegend && (
						<Legend
							layout={legendLayout}
							align={legendAlign}
							verticalAlign={legendVerticalAlign}
						/>
					)}
				</PieChart>
			</ResponsiveContainer>
		</ChartContainer>
	);
}
