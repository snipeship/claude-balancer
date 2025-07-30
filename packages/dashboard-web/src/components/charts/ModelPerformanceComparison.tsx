import { formatCost, formatTokensPerSecond } from "@ccflare/ui-common";
import {
	Area,
	AreaChart,
	Bar,
	CartesianGrid,
	ComposedChart,
	Legend,
	Line,
	ResponsiveContainer,
	Scatter,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { CHART_HEIGHTS, CHART_PROPS, COLORS } from "../../constants";
import { ChartContainer } from "./ChartContainer";
import { getTooltipStyles } from "./chart-utils";

interface ModelComparisonData {
	model: string;
	avgTokensPerSecond: number | null;
	costPer1kTokens: number;
	avgResponseTime: number;
	errorRate: number;
	totalRequests: number;
}

interface ModelPerformanceComparisonProps {
	data: ModelComparisonData[];
	loading?: boolean;
	height?: number;
	viewMode?: "speed-cost" | "performance" | "efficiency";
}

// Model-based color palette
const MODEL_COLORS: Record<string, string> = {
	"claude-3.5-sonnet": COLORS.purple,
	"claude-3.5-haiku": COLORS.success,
	"claude-3-opus": COLORS.blue,
	"claude-opus-4": COLORS.pink,
};

function getModelColor(model: string): string {
	// Check for exact match first
	if (MODEL_COLORS[model]) return MODEL_COLORS[model];

	// Check for partial matches
	for (const [key, color] of Object.entries(MODEL_COLORS)) {
		if (model.includes(key) || key.includes(model)) {
			return color;
		}
	}

	return COLORS.primary;
}

export function ModelPerformanceComparison({
	data,
	loading = false,
	height = CHART_HEIGHTS.large,
	viewMode = "speed-cost",
}: ModelPerformanceComparisonProps) {
	// Filter and prepare data
	const chartData = data
		.filter((d) => d.avgTokensPerSecond !== null && d.avgTokensPerSecond > 0)
		.sort((a, b) => (b.avgTokensPerSecond || 0) - (a.avgTokensPerSecond || 0));

	if (viewMode === "speed-cost") {
		return (
			<ChartContainer
				loading={loading}
				height={height}
				isEmpty={chartData.length === 0}
				emptyState={
					<div className="text-muted-foreground">
						No model performance data available
					</div>
				}
			>
				<ResponsiveContainer width="100%" height={height}>
					<ComposedChart
						data={chartData}
						margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
					>
						<defs>
							<linearGradient id="speedGradient" x1="0" y1="0" x2="0" y2="1">
								<stop offset="0%" stopColor={COLORS.purple} stopOpacity={0.9} />
								<stop
									offset="100%"
									stopColor={COLORS.purple}
									stopOpacity={0.3}
								/>
							</linearGradient>
							<linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
								<stop
									offset="0%"
									stopColor={COLORS.warning}
									stopOpacity={0.9}
								/>
								<stop
									offset="100%"
									stopColor={COLORS.warning}
									stopOpacity={0.3}
								/>
							</linearGradient>
							<filter id="glow">
								<feGaussianBlur stdDeviation="3" result="coloredBlur" />
								<feMerge>
									<feMergeNode in="coloredBlur" />
									<feMergeNode in="SourceGraphic" />
								</feMerge>
							</filter>
						</defs>
						<CartesianGrid
							strokeDasharray={CHART_PROPS.strokeDasharray}
							stroke="rgba(255,255,255,0.1)"
						/>
						<XAxis
							dataKey="model"
							angle={-45}
							textAnchor="end"
							height={80}
							interval={0}
							fontSize={12}
							stroke="rgba(255,255,255,0.5)"
						/>
						<YAxis
							yAxisId="speed"
							orientation="left"
							stroke={COLORS.purple}
							fontSize={12}
							label={{
								value: "Tokens/Second",
								angle: -90,
								position: "insideLeft",
								style: { textAnchor: "middle", fill: COLORS.purple },
							}}
						/>
						<YAxis
							yAxisId="cost"
							orientation="right"
							stroke={COLORS.warning}
							fontSize={12}
							label={{
								value: "Cost per 1K Tokens ($)",
								angle: 90,
								position: "insideRight",
								style: { textAnchor: "middle", fill: COLORS.warning },
							}}
						/>
						<Tooltip
							contentStyle={{
								backgroundColor: "rgba(0,0,0,0.8)",
								border: "1px solid rgba(255,255,255,0.2)",
								borderRadius: "8px",
								backdropFilter: "blur(8px)",
							}}
							formatter={(value: number, name: string) => {
								if (name === "Speed")
									return [formatTokensPerSecond(value), name];
								if (name === "Cost/1K") return [formatCost(value), name];
								return [value, name];
							}}
						/>
						<Legend
							verticalAlign="top"
							height={36}
							iconType="rect"
							wrapperStyle={{ paddingBottom: "10px" }}
						/>
						<Bar
							yAxisId="speed"
							dataKey="avgTokensPerSecond"
							name="Speed"
							fill="url(#speedGradient)"
							filter="url(#glow)"
						/>
						<Line
							yAxisId="cost"
							type="monotone"
							dataKey="costPer1kTokens"
							name="Cost/1K"
							stroke={COLORS.warning}
							strokeWidth={3}
							dot={{ fill: COLORS.warning, r: 4 }}
							filter="url(#glow)"
						/>
					</ComposedChart>
				</ResponsiveContainer>
			</ChartContainer>
		);
	}

	if (viewMode === "performance") {
		return (
			<ChartContainer
				loading={loading}
				height={height}
				isEmpty={chartData.length === 0}
				emptyState={
					<div className="text-muted-foreground">
						No model performance data available
					</div>
				}
			>
				<ResponsiveContainer width="100%" height={height}>
					<ComposedChart
						data={chartData}
						margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
					>
						<defs>
							<linearGradient id="responseGradient" x1="0" y1="0" x2="0" y2="1">
								<stop offset="0%" stopColor={COLORS.blue} stopOpacity={0.9} />
								<stop offset="100%" stopColor={COLORS.blue} stopOpacity={0.3} />
							</linearGradient>
						</defs>
						<CartesianGrid
							strokeDasharray={CHART_PROPS.strokeDasharray}
							className={CHART_PROPS.gridClassName}
						/>
						<XAxis
							dataKey="model"
							angle={-45}
							textAnchor="end"
							height={80}
							interval={0}
							fontSize={12}
						/>
						<YAxis
							yAxisId="time"
							orientation="left"
							fontSize={12}
							label={{
								value: "Response Time (ms)",
								angle: -90,
								position: "insideLeft",
								style: { textAnchor: "middle" },
							}}
						/>
						<YAxis
							yAxisId="error"
							orientation="right"
							fontSize={12}
							label={{
								value: "Error Rate (%)",
								angle: 90,
								position: "insideRight",
								style: { textAnchor: "middle" },
							}}
						/>
						<Tooltip
							contentStyle={getTooltipStyles("dark")}
							formatter={(value: number, name: string) => {
								if (name === "Response Time") return [`${value}ms`, name];
								if (name === "Error Rate") return [`${value}%`, name];
								return [value, name];
							}}
						/>
						<Legend verticalAlign="top" height={36} iconType="rect" />
						<Bar
							yAxisId="time"
							dataKey="avgResponseTime"
							name="Response Time"
							fill="url(#responseGradient)"
						/>
						<Scatter
							yAxisId="error"
							dataKey="errorRate"
							name="Error Rate"
							fill={COLORS.error}
						/>
					</ComposedChart>
				</ResponsiveContainer>
			</ChartContainer>
		);
	}

	// Efficiency view: Speed vs Cost scatter plot
	return (
		<ChartContainer
			loading={loading}
			height={height}
			isEmpty={chartData.length === 0}
			emptyState={
				<div className="text-muted-foreground">
					No model efficiency data available
				</div>
			}
		>
			<ResponsiveContainer width="100%" height={height}>
				<AreaChart
					data={chartData}
					margin={{ top: 20, right: 30, left: 60, bottom: 80 }}
				>
					<defs>
						{chartData.map((model, index) => (
							<linearGradient
								key={model.model}
								id={`gradient-${index}`}
								x1="0"
								y1="0"
								x2="0"
								y2="1"
							>
								<stop
									offset="0%"
									stopColor={getModelColor(model.model)}
									stopOpacity={0.9}
								/>
								<stop
									offset="100%"
									stopColor={getModelColor(model.model)}
									stopOpacity={0.1}
								/>
							</linearGradient>
						))}
					</defs>
					<CartesianGrid
						strokeDasharray={CHART_PROPS.strokeDasharray}
						stroke="rgba(255,255,255,0.1)"
					/>
					<XAxis
						dataKey="model"
						angle={-45}
						textAnchor="end"
						height={80}
						interval={0}
						fontSize={12}
					/>
					<YAxis
						fontSize={12}
						label={{
							value: "Efficiency Score",
							angle: -90,
							position: "insideLeft",
							style: { textAnchor: "middle" },
						}}
					/>
					<Tooltip
						contentStyle={{
							backgroundColor: "rgba(0,0,0,0.8)",
							border: "1px solid rgba(255,255,255,0.2)",
							borderRadius: "8px",
							backdropFilter: "blur(8px)",
						}}
						content={({ active, payload }) => {
							if (!active || !payload?.[0]) return null;
							const data = payload[0].payload;
							return (
								<div className="p-3 space-y-1">
									<p className="font-semibold">{data.model}</p>
									<p className="text-sm">
										Speed: {formatTokensPerSecond(data.avgTokensPerSecond)}
									</p>
									<p className="text-sm">
										Cost/1K: {formatCost(data.costPer1kTokens)}
									</p>
									<p className="text-sm">
										Efficiency:{" "}
										{(
											(data.avgTokensPerSecond || 0) / data.costPer1kTokens
										).toFixed(2)}
									</p>
								</div>
							);
						}}
					/>
					<Area
						type="monotone"
						dataKey={(data: ModelComparisonData) =>
							(data.avgTokensPerSecond || 0) / data.costPer1kTokens
						}
						stroke={COLORS.primary}
						strokeWidth={2}
						fill="url(#gradient-0)"
						name="Efficiency Score"
					/>
				</AreaChart>
			</ResponsiveContainer>
		</ChartContainer>
	);
}
