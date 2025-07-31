import { getModelShortName } from "@ccflare/core";
import * as tuiCore from "@ccflare/tui-core";
import { formatCost, formatNumber, formatPercentage } from "@ccflare/ui-common";
import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import Spinner from "ink-spinner";
import { useCallback, useEffect, useState } from "react";
import { BarChart, LineChart, PieChart, SparklineChart } from "./charts";

interface AnalyticsScreenProps {
	onBack: () => void;
}

type TimeRange = "1h" | "6h" | "24h" | "7d";
type ChartView = "overview" | "tokens" | "performance" | "costs" | "models";

const TIME_RANGE_LABELS: Record<TimeRange, string> = {
	"1h": "Last Hour",
	"6h": "Last 6 Hours",
	"24h": "Last 24 Hours",
	"7d": "Last 7 Days",
};

export function AnalyticsScreen({ onBack }: AnalyticsScreenProps) {
	const [timeRange, setTimeRange] = useState<TimeRange>("24h");
	const [chartView, setChartView] = useState<ChartView>("overview");
	const [stats, setStats] = useState<tuiCore.Stats | null>(null);
	const [loading, setLoading] = useState(true);
	interface TimeSeriesDataPoint {
		time: string;
		requests: number;
		tokens: number;
		cost: number;
		responseTime: number;
		errorRate: number;
		cacheHitRate: number;
		successRate: number;
	}

	const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesDataPoint[]>(
		[],
	);
	const [showMenu, setShowMenu] = useState(false);
	const [modelDistribution, setModelDistribution] = useState<
		tuiCore.ModelDistribution[]
	>([]);

	useInput((input, key) => {
		if (key.escape) {
			if (showMenu) {
				setShowMenu(false);
			} else {
				onBack();
			}
		}
		if (input === "q" && !showMenu) {
			onBack();
		}
		if (input === "r" && !showMenu) {
			loadData();
		}
		if (input === "m" && !showMenu) {
			setShowMenu(true);
		}
		// Time range shortcuts
		if (!showMenu) {
			if (input === "1") setTimeRange("1h");
			if (input === "2") setTimeRange("6h");
			if (input === "3") setTimeRange("24h");
			if (input === "4") setTimeRange("7d");
			// View shortcuts
			if (input === "o") setChartView("overview");
			if (input === "t") setChartView("tokens");
			if (input === "p") setChartView("performance");
			if (input === "c") setChartView("costs");
			if (input === "d") setChartView("models");
		}
	});

	const loadData = useCallback(async () => {
		try {
			setLoading(true);
			// Get basic stats
			const data = await tuiCore.getStats();
			setStats(data);

			// Get analytics with time series data
			const analytics = await tuiCore.getAnalytics(timeRange);

			// Transform time series data for display
			const transformedTimeSeries = analytics.timeSeries.map((point) => {
				const time = new Date(point.time);
				return {
					time:
						timeRange === "7d"
							? time.toLocaleDateString("en", { weekday: "short" })
							: time.toLocaleTimeString("en", {
									hour: "2-digit",
									minute: "2-digit",
								}),
					requests: point.requests,
					tokens: point.tokens,
					cost: point.cost,
					responseTime: point.responseTime,
					errorRate: point.errorRate,
					cacheHitRate: point.cacheHitRate,
					successRate: point.successRate,
				};
			});

			setTimeSeriesData(transformedTimeSeries);
			setLoading(false);
		} catch (_error) {
			setLoading(false);
		}
	}, [timeRange]);

	useEffect(() => {
		loadData();
		const interval = setInterval(loadData, 30000); // Refresh every 30 seconds
		return () => clearInterval(interval);
	}, [loadData]);

	useEffect(() => {
		if (!loading) {
			tuiCore.getAnalytics(timeRange).then((analytics) => {
				setModelDistribution(analytics.modelDistribution);
			});
		}
	}, [timeRange, loading]);

	if (loading || !stats) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="cyan" bold>
					📈 Analytics Dashboard
				</Text>
				<Box marginTop={1}>
					<Text color="green">
						<Spinner type="dots" />
					</Text>
					<Text> Loading analytics data...</Text>
				</Box>
			</Box>
		);
	}

	// Menu for selecting time range
	if (showMenu) {
		const menuItems = [
			{ label: "📊 Overview", value: "overview" },
			{ label: "🪙 Token Usage", value: "tokens" },
			{ label: "⚡ Performance", value: "performance" },
			{ label: "💰 Cost Analysis", value: "costs" },
			{ label: "🤖 Model Distribution", value: "models" },
			{ label: "← Back", value: "back" },
		];

		return (
			<Box flexDirection="column" padding={1}>
				<Text color="cyan" bold>
					Select Analytics View
				</Text>
				<Box marginTop={1}>
					<SelectInput
						items={menuItems}
						onSelect={(item) => {
							if (item.value === "back") {
								setShowMenu(false);
							} else {
								setChartView(item.value as ChartView);
								setShowMenu(false);
							}
						}}
					/>
				</Box>
			</Box>
		);
	}

	// Prepare data for charts
	const requestSparkline = timeSeriesData.map((d) => d.requests);
	const tokenSparkline = timeSeriesData.map((d) => d.tokens);
	const costSparkline = timeSeriesData.map((d) => d.cost);
	const responseTimeData = timeSeriesData.map((d) => ({
		x: d.time,
		y: d.responseTime,
	}));

	// Model distribution for pie chart
	const modelData = modelDistribution.slice(0, 3).map((model, index) => ({
		label: model.model,
		value: model.count,
		color: ["magenta", "cyan", "yellow"][index] as
			| "magenta"
			| "cyan"
			| "yellow",
	}));

	// Account performance for bar chart
	const accountBarData = stats.accounts.map((account) => ({
		label: account.name,
		value: account.requestCount,
		color:
			account.successRate >= 95
				? ("green" as const)
				: account.successRate >= 80
					? ("yellow" as const)
					: ("red" as const),
	}));

	const renderChart = () => {
		switch (chartView) {
			case "overview":
				return (
					<Box flexDirection="column">
						<Box marginBottom={1}>
							<Text bold underline>
								Request Volume & Performance
							</Text>
						</Box>

						{/* Sparklines */}
						<Box flexDirection="column" marginBottom={2}>
							<SparklineChart
								data={requestSparkline}
								label="Requests"
								color="cyan"
								showCurrent={true}
							/>
							<SparklineChart
								data={tokenSparkline}
								label="Tokens  "
								color="yellow"
								showCurrent={true}
							/>
							<SparklineChart
								data={costSparkline}
								label="Cost    "
								color="green"
								showCurrent={true}
							/>
						</Box>

						{/* Response time line chart */}
						<LineChart
							data={responseTimeData.slice(-20)}
							title="Response Time (ms)"
							height={8}
							width={50}
							color="magenta"
						/>
					</Box>
				);

			case "tokens":
				return (
					<Box flexDirection="column">
						{/* Token breakdown bar chart */}
						{stats.tokenDetails && (
							<BarChart
								title="Token Usage Breakdown"
								data={[
									{
										label: "Input",
										value: stats.tokenDetails.inputTokens,
										color: "yellow",
									},
									{
										label: "Cache Read",
										value: stats.tokenDetails.cacheReadInputTokens,
										color: "cyan",
									},
									{
										label: "Cache Create",
										value: stats.tokenDetails.cacheCreationInputTokens,
										color: "blue",
									},
									{
										label: "Output",
										value: stats.tokenDetails.outputTokens,
										color: "green",
									},
								]}
								width={40}
								showValues={true}
							/>
						)}

						<Box marginTop={2}>
							<Text bold>Token Efficiency Metrics</Text>
							<Box marginTop={1}>
								<Text>Avg tokens/request: </Text>
								<Text color="yellow" bold>
									{formatNumber(
										stats.totalRequests > 0
											? Math.round(stats.totalTokens / stats.totalRequests)
											: 0,
									)}
								</Text>
							</Box>
							<Box>
								<Text>Cache hit rate: </Text>
								<Text color="cyan" bold>
									{formatPercentage(
										stats.tokenDetails
											? (stats.tokenDetails.cacheReadInputTokens /
													stats.tokenDetails.inputTokens) *
													100
											: 0,
									)}
								</Text>
							</Box>
						</Box>
					</Box>
				);

			case "performance":
				return (
					<Box flexDirection="column">
						{/* Account performance bar chart */}
						<BarChart
							title="Account Performance (Requests)"
							data={accountBarData}
							width={35}
							showValues={true}
						/>

						<Box marginTop={2}>
							<Text bold underline>
								Performance Metrics
							</Text>
							<Box marginTop={1}>
								<Text>Success Rate: </Text>
								<Text
									color={
										stats.successRate >= 95
											? "green"
											: stats.successRate >= 80
												? "yellow"
												: "red"
									}
									bold
								>
									{formatPercentage(stats.successRate)}
								</Text>
							</Box>
							<Box>
								<Text>Avg Response: </Text>
								<Text color="magenta" bold>
									{formatNumber(stats.avgResponseTime)}ms
								</Text>
							</Box>
						</Box>
					</Box>
				);

			case "costs":
				return (
					<Box flexDirection="column">
						<Box marginBottom={1}>
							<Text bold underline>
								Cost Analysis
							</Text>
						</Box>

						{/* Cost trend sparkline */}
						<Box marginBottom={2}>
							<SparklineChart
								data={costSparkline}
								label="Cost Trend"
								color="green"
								showMinMax={true}
								showCurrent={true}
							/>
						</Box>

						{/* Cost breakdown */}
						<Box flexDirection="column">
							<Box>
								<Text>Total Cost: </Text>
								<Text color="green" bold>
									{formatCost(stats.totalCostUsd)}
								</Text>
							</Box>
							<Box>
								<Text>Avg per request: </Text>
								<Text color="yellow">
									{formatCost(
										stats.totalRequests > 0
											? stats.totalCostUsd / stats.totalRequests
											: 0,
									)}
								</Text>
							</Box>
							<Box>
								<Text>Projected daily: </Text>
								<Text dimColor>
									{formatCost(
										stats.totalCostUsd *
											(24 /
												(timeRange === "1h"
													? 1
													: timeRange === "6h"
														? 6
														: timeRange === "24h"
															? 24
															: 168)),
									)}
								</Text>
							</Box>
						</Box>
					</Box>
				);

			case "models":
				return (
					<Box flexDirection="column">
						{/* Model distribution pie chart */}
						<PieChart
							title="Model Distribution"
							data={modelData}
							size="medium"
							showLegend={true}
						/>

						<Box marginTop={2}>
							<Text bold>Model Performance</Text>
							<Box flexDirection="column" marginTop={1}>
								{modelDistribution.slice(0, 5).map((model) => {
									const shortName = getModelShortName(model.model);
									const color = shortName.includes("opus")
										? "magenta"
										: shortName.includes("sonnet")
											? "cyan"
											: "yellow";
									return (
										<Box key={model.model}>
											<Text>{model.model}: </Text>
											<Text color={color}>
												{formatNumber(model.count)} (
												{formatPercentage(model.percentage)})
											</Text>
										</Box>
									);
								})}
							</Box>
						</Box>
					</Box>
				);

			default:
				return null;
		}
	};

	return (
		<Box flexDirection="column" padding={1}>
			{/* Header */}
			<Box marginBottom={1} justifyContent="space-between">
				<Text color="cyan" bold>
					📈 Analytics Dashboard - {TIME_RANGE_LABELS[timeRange]}
				</Text>
				<Text dimColor> View: {chartView}</Text>
			</Box>

			{/* Time range selector */}
			<Box marginBottom={1}>
				<Text dimColor>
					Time: [1] 1h [2] 6h [3] 24h [4] 7d | View: [o]verview [t]okens [p]erf
					[c]ost [d]models
				</Text>
			</Box>

			{/* Chart content */}
			{renderChart()}

			{/* Controls */}
			<Box marginTop={2}>
				<Text dimColor>[m] Menu • [r] Refresh • [q/ESC] Back</Text>
			</Box>
		</Box>
	);
}
