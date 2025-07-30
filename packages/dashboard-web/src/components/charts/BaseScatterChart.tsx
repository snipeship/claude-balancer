import type { ReactNode } from "react";
import {
	CartesianGrid,
	ResponsiveContainer,
	Scatter,
	ScatterChart,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import {
	type CHART_HEIGHTS,
	CHART_PROPS,
	type CHART_TOOLTIP_STYLE,
	COLORS,
} from "../../constants";
import { ChartContainer } from "./ChartContainer";
import { getChartHeight, getTooltipStyles, isChartEmpty } from "./chart-utils";
import type {
	ChartClickHandler,
	ChartDataPoint,
	TooltipFormatterFunction,
} from "./types";

interface BaseScatterChartProps {
	data: ChartDataPoint[];
	xKey: string;
	yKey: string;
	loading?: boolean;
	height?: keyof typeof CHART_HEIGHTS | number;
	fill?: string;
	xAxisLabel?: string;
	yAxisLabel?: string;
	xAxisDomain?: [number | "auto", number | "auto"];
	yAxisDomain?: [number | "auto", number | "auto"];
	tooltipFormatter?: TooltipFormatterFunction;
	tooltipStyle?: keyof typeof CHART_TOOLTIP_STYLE | object;
	animationDuration?: number;
	margin?: { top?: number; right?: number; bottom?: number; left?: number };
	className?: string;
	error?: Error | null;
	emptyState?: ReactNode;
	onDotClick?: ChartClickHandler;
	renderLabel?: (entry: ChartDataPoint) => ReactNode;
}

export function BaseScatterChart({
	data,
	xKey,
	yKey,
	loading = false,
	height = "medium",
	fill = COLORS.primary,
	xAxisLabel,
	yAxisLabel,
	xAxisDomain,
	yAxisDomain,
	tooltipFormatter,
	tooltipStyle = "default",
	animationDuration = 1000,
	margin,
	className = "",
	error = null,
	emptyState,
	onDotClick,
	renderLabel,
}: BaseScatterChartProps) {
	const chartHeight = getChartHeight(height);
	const isEmpty = isChartEmpty(data);
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
				<ScatterChart margin={margin}>
					<CartesianGrid
						strokeDasharray={CHART_PROPS.strokeDasharray}
						className={CHART_PROPS.gridClassName}
					/>
					<XAxis
						dataKey={xKey}
						name={xAxisLabel || xKey}
						className="text-xs"
						domain={xAxisDomain}
						label={
							xAxisLabel
								? {
										value: xAxisLabel,
										position: "insideBottom",
										offset: -5,
									}
								: undefined
						}
					/>
					<YAxis
						dataKey={yKey}
						name={yAxisLabel || yKey}
						className="text-xs"
						domain={yAxisDomain}
						label={
							yAxisLabel
								? {
										value: yAxisLabel,
										angle: -90,
										position: "insideLeft",
									}
								: undefined
						}
					/>
					<Tooltip contentStyle={tooltipStyles} formatter={tooltipFormatter} />
					<Scatter
						name="Data"
						data={data}
						fill={fill}
						animationDuration={animationDuration}
						onClick={onDotClick}
					>
						{renderLabel &&
							data.map((entry) => (
								<text
									key={`label-${entry[xKey]}-${entry[yKey]}`}
									x={entry[xKey]}
									y={entry[yKey]}
									dy={-10}
									textAnchor="middle"
									className="text-xs fill-foreground"
								>
									{renderLabel(entry)}
								</text>
							))}
					</Scatter>
				</ScatterChart>
			</ResponsiveContainer>
		</ChartContainer>
	);
}
