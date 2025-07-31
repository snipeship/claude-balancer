import type { ReactNode } from "react";
import {
	Area,
	AreaChart,
	CartesianGrid,
	Legend,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { CHART_PROPS, COLORS } from "../../constants";
import { ChartContainer } from "./ChartContainer";
import {
	type CommonChartProps,
	getChartHeight,
	getTooltipStyles,
	isChartEmpty,
} from "./chart-utils";

interface BaseAreaChartProps extends CommonChartProps {
	dataKey: string;
	color?: string;
	gradientId?: string;
	customGradient?: ReactNode;
	strokeWidth?: number;
	fillOpacity?: number;
}

export function BaseAreaChart({
	data,
	dataKey,
	xAxisKey = "time",
	loading = false,
	height = "medium",
	color = COLORS.primary,
	gradientId = "colorGradient",
	customGradient,
	strokeWidth = 2,
	fillOpacity = 1,
	xAxisAngle = 0,
	xAxisTextAnchor = "middle",
	xAxisHeight = 30,
	xAxisTickFormatter,
	yAxisDomain,
	yAxisTickFormatter,
	tooltipFormatter,
	tooltipLabelFormatter,
	tooltipStyle = "default",
	animationDuration = 1000,
	showLegend = false,
	legendHeight = 36,
	margin,
	className = "",
	error = null,
	emptyState,
	onChartClick,
}: BaseAreaChartProps) {
	const chartHeight = getChartHeight(height);
	const isEmpty = isChartEmpty(data);
	const tooltipStyles = getTooltipStyles(tooltipStyle);

	const defaultGradient = (
		<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
			<stop offset="5%" stopColor={color} stopOpacity={0.8} />
			<stop offset="95%" stopColor={color} stopOpacity={0.1} />
		</linearGradient>
	);

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
				<AreaChart data={data} margin={margin} onClick={onChartClick}>
					<defs>{customGradient || defaultGradient}</defs>
					<CartesianGrid
						strokeDasharray={CHART_PROPS.strokeDasharray}
						className={CHART_PROPS.gridClassName}
					/>
					<XAxis
						dataKey={xAxisKey}
						className="text-xs"
						angle={xAxisAngle}
						textAnchor={xAxisTextAnchor}
						height={xAxisHeight}
						tickFormatter={xAxisTickFormatter}
					/>
					<YAxis
						className="text-xs"
						domain={yAxisDomain}
						tickFormatter={yAxisTickFormatter}
					/>
					<Tooltip
						contentStyle={tooltipStyles}
						formatter={tooltipFormatter}
						labelFormatter={tooltipLabelFormatter}
					/>
					{showLegend && <Legend height={legendHeight} />}
					<Area
						type="monotone"
						dataKey={dataKey}
						stroke={color}
						strokeWidth={strokeWidth}
						fillOpacity={fillOpacity}
						fill={`url(#${gradientId})`}
						animationDuration={animationDuration}
					/>
				</AreaChart>
			</ResponsiveContainer>
		</ChartContainer>
	);
}
