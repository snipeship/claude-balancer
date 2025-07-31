import {
	CartesianGrid,
	Legend,
	Line,
	LineChart,
	ReferenceLine,
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

interface LineConfig {
	dataKey: string;
	stroke?: string;
	strokeWidth?: number;
	dot?: boolean;
	name?: string;
}

interface ReferenceLineConfig {
	y: number;
	stroke?: string;
	strokeDasharray?: string;
	label?: string;
}

interface BaseLineChartProps extends CommonChartProps {
	lines: LineConfig | LineConfig[];
	referenceLines?: ReferenceLineConfig[];
}

export function BaseLineChart({
	data,
	lines,
	xAxisKey = "time",
	loading = false,
	height = "medium",
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
	referenceLines = [],
	margin,
	className = "",
	error = null,
	emptyState,
	onChartClick,
}: BaseLineChartProps) {
	const chartHeight = getChartHeight(height);
	const isEmpty = isChartEmpty(data);
	const tooltipStyles = getTooltipStyles(tooltipStyle);
	const lineConfigs = Array.isArray(lines) ? lines : [lines];

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
				<LineChart data={data} margin={margin} onClick={onChartClick}>
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
					{lineConfigs.map((lineConfig, _index) => (
						<Line
							key={lineConfig.dataKey}
							type="monotone"
							dataKey={lineConfig.dataKey}
							stroke={lineConfig.stroke || COLORS.primary}
							strokeWidth={lineConfig.strokeWidth || 2}
							dot={lineConfig.dot ?? false}
							name={lineConfig.name || lineConfig.dataKey}
							animationDuration={animationDuration}
						/>
					))}
					{referenceLines.map((refLine) => (
						<ReferenceLine
							key={`ref-line-${refLine.y}`}
							y={refLine.y}
							stroke={refLine.stroke || COLORS.primary}
							strokeDasharray={
								refLine.strokeDasharray || CHART_PROPS.strokeDasharray
							}
							label={refLine.label}
						/>
					))}
				</LineChart>
			</ResponsiveContainer>
		</ChartContainer>
	);
}
