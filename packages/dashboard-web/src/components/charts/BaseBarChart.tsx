import {
	Bar,
	BarChart,
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

interface BarConfig {
	dataKey: string;
	fill?: string;
	name?: string;
	yAxisId?: string;
	radius?: [number, number, number, number];
}

interface BaseBarChartProps extends CommonChartProps {
	bars: BarConfig | BarConfig[];
	layout?: "horizontal" | "vertical";
	xAxisType?: "number" | "category";
	yAxisType?: "number" | "category";
	yAxisWidth?: number;
	yAxisOrientation?: "left" | "right";
	secondaryYAxis?: boolean;
}

export function BaseBarChart({
	data,
	bars,
	xAxisKey = "name",
	loading = false,
	height = "medium",
	layout = "horizontal",
	xAxisAngle = 0,
	xAxisTextAnchor = "middle",
	xAxisHeight = 30,
	xAxisType = layout === "vertical" ? "number" : "category",
	yAxisType = layout === "vertical" ? "category" : "number",
	yAxisWidth,
	yAxisDomain,
	yAxisOrientation = "left",
	secondaryYAxis = false,
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
}: BaseBarChartProps) {
	const chartHeight = getChartHeight(height);
	const isEmpty = isChartEmpty(data);
	const tooltipStyles = getTooltipStyles(tooltipStyle);
	const barConfigs = Array.isArray(bars) ? bars : [bars];

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
				<BarChart
					data={data}
					layout={layout}
					margin={margin}
					onClick={onChartClick}
				>
					<CartesianGrid
						strokeDasharray={CHART_PROPS.strokeDasharray}
						className={CHART_PROPS.gridClassName}
					/>
					{layout === "vertical" ? (
						<>
							<XAxis type={xAxisType as "number"} className="text-xs" />
							<YAxis
								dataKey={xAxisKey}
								type={yAxisType as "category"}
								className="text-xs"
								width={yAxisWidth}
							/>
						</>
					) : (
						<>
							<XAxis
								dataKey={xAxisKey}
								type={xAxisType as "category"}
								className="text-xs"
								angle={xAxisAngle}
								textAnchor={xAxisTextAnchor}
								height={xAxisHeight}
							/>
							<YAxis
								yAxisId={secondaryYAxis ? "left" : undefined}
								type={yAxisType as "number"}
								className="text-xs"
								domain={yAxisDomain}
								orientation={yAxisOrientation}
							/>
							{secondaryYAxis && (
								<YAxis
									yAxisId="right"
									orientation="right"
									className="text-xs"
								/>
							)}
						</>
					)}
					<Tooltip
						contentStyle={tooltipStyles}
						formatter={tooltipFormatter}
						labelFormatter={tooltipLabelFormatter}
					/>
					{showLegend && <Legend height={legendHeight} />}
					{barConfigs.map((barConfig) => (
						<Bar
							key={barConfig.dataKey}
							dataKey={barConfig.dataKey}
							fill={barConfig.fill || COLORS.primary}
							name={barConfig.name || barConfig.dataKey}
							yAxisId={barConfig.yAxisId}
							radius={barConfig.radius}
							animationDuration={animationDuration}
						/>
					))}
				</BarChart>
			</ResponsiveContainer>
		</ChartContainer>
	);
}
