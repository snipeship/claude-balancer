import { getModelShortName } from "@ccflare/core";
import { formatTokensPerSecond } from "@ccflare/ui-common";
import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	ErrorBar,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { CHART_PROPS, COLORS } from "../../constants";
import { formatCompactNumber } from "../../lib/chart-utils";
import { getTooltipStyles } from "./chart-utils";

interface ModelTokenSpeedData {
	model: string;
	avgTokensPerSecond: number | null;
	minTokensPerSecond: number | null;
	maxTokensPerSecond: number | null;
}

interface ModelTokenSpeedChartProps {
	data: ModelTokenSpeedData[];
	loading?: boolean;
	height?: number;
}

// Model-based color palette
const MODEL_COLORS: Record<string, string> = {
	"claude-3.5-sonnet": COLORS.purple,
	"claude-3.5-haiku": COLORS.success,
	"claude-3-opus": COLORS.blue,
	"claude-opus-4": COLORS.pink,
	// Add more models as needed
};

function getModelColor(model: string): string {
	// Try to find color by short name first
	const shortName = getModelShortName(model);
	if (MODEL_COLORS[shortName]) return MODEL_COLORS[shortName];

	// Check for exact match
	if (MODEL_COLORS[model]) return MODEL_COLORS[model];

	// Check for partial matches
	for (const [key, color] of Object.entries(MODEL_COLORS)) {
		if (model.includes(key) || key.includes(model)) {
			return color;
		}
	}

	// Default color
	return COLORS.primary;
}

export function ModelTokenSpeedChart({
	data,
	loading = false,
	height = 300,
}: ModelTokenSpeedChartProps) {
	if (loading) {
		return (
			<div className="flex items-center justify-center" style={{ height }}>
				<div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
			</div>
		);
	}

	// Filter out models without token speed data and prepare chart data
	const chartData = data
		.filter((d) => d.avgTokensPerSecond !== null && d.avgTokensPerSecond > 0)
		.map((d) => ({
			model: d.model,
			avgSpeed: d.avgTokensPerSecond || 0,
			minSpeed: d.minTokensPerSecond || 0,
			maxSpeed: d.maxTokensPerSecond || 0,
			// Calculate error bars (distance from avg to min/max)
			errorLower: (d.avgTokensPerSecond || 0) - (d.minTokensPerSecond || 0),
			errorUpper: (d.maxTokensPerSecond || 0) - (d.avgTokensPerSecond || 0),
		}))
		.sort((a, b) => b.avgSpeed - a.avgSpeed); // Sort by average speed

	if (chartData.length === 0) {
		return (
			<div
				className="flex items-center justify-center text-muted-foreground"
				style={{ height }}
			>
				No token speed data available
			</div>
		);
	}

	return (
		<ResponsiveContainer width="100%" height={height}>
			<BarChart
				data={chartData}
				margin={{ top: 20, right: 30, left: 60, bottom: 80 }}
			>
				<CartesianGrid
					strokeDasharray={CHART_PROPS.strokeDasharray}
					className={CHART_PROPS.gridClassName}
				/>
				<XAxis
					dataKey="model"
					fontSize={12}
					angle={-45}
					textAnchor="end"
					height={80}
					interval={0}
				/>
				<YAxis
					fontSize={12}
					tickFormatter={formatCompactNumber}
					label={{
						value: "Tokens/Second",
						angle: -90,
						position: "insideLeft",
						style: {
							textAnchor: "middle",
							fontSize: 12,
						},
					}}
				/>
				<Tooltip
					contentStyle={getTooltipStyles("default")}
					formatter={(value: number, name: string) => {
						if (name === "avgSpeed") {
							return [formatTokensPerSecond(value), "Avg Speed"];
						}
						return [value, name];
					}}
					labelFormatter={(label) => `Model: ${label}`}
				/>
				<Bar dataKey="avgSpeed" name="Average Speed">
					{chartData.map((entry) => (
						<Cell
							key={`cell-${entry.model}`}
							fill={getModelColor(entry.model)}
						/>
					))}
					<ErrorBar
						dataKey="errorLower"
						width={4}
						strokeOpacity={0.5}
						direction="y"
					/>
				</Bar>
			</BarChart>
		</ResponsiveContainer>
	);
}
