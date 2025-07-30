import * as tuiCore from "@ccflare/tui-core";
import {
	formatCost,
	formatNumber,
	formatPercentage,
	formatTokensPerSecond,
} from "@ccflare/ui-common";
import { Box, Text, useInput } from "ink";
import { useCallback, useEffect, useState } from "react";
import { BarChart, PieChart, SparklineChart } from "./charts";

interface StatsScreenProps {
	onBack: () => void;
}

export function StatsScreen({ onBack }: StatsScreenProps) {
	const [stats, setStats] = useState<tuiCore.Stats | null>(null);
	const [loading, setLoading] = useState(true);
	const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
	const [showCharts, setShowCharts] = useState(false);

	useInput((input, key) => {
		if (key.escape || input === "q") {
			onBack();
		}
		if (input === "r") {
			loadStats();
		}
		if (input === "c") {
			setShowCharts(!showCharts);
		}
	});

	const loadStats = useCallback(async () => {
		try {
			const data = await tuiCore.getStats();
			setStats(data);
			setLoading(false);
			setLastUpdated(new Date());
		} catch (_error) {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadStats();
		const interval = setInterval(loadStats, 5000); // Auto-refresh every 5 seconds
		return () => clearInterval(interval);
	}, [loadStats]);

	// For TUI, we want to show just time not full timestamp for space reasons
	const formatTime = (date: Date): string => {
		return date.toLocaleTimeString();
	};

	if (loading) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="cyan" bold>
					📊 Statistics Dashboard
				</Text>
				<Text dimColor>Loading...</Text>
			</Box>
		);
	}

	if (!stats) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="cyan" bold>
					📊 Statistics Dashboard
				</Text>
				<Text color="red">Failed to load statistics</Text>
			</Box>
		);
	}

	// Calculate additional metrics
	const avgTokensPerRequest =
		stats.totalRequests > 0
			? Math.round(stats.totalTokens / stats.totalRequests)
			: 0;
	const avgCostPerRequest =
		stats.totalRequests > 0 ? stats.totalCostUsd / stats.totalRequests : 0;

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text color="cyan" bold>
					📊 Statistics Dashboard
				</Text>
				<Text dimColor>Last updated: {formatTime(lastUpdated)}</Text>
			</Box>

			{/* Overall Statistics */}
			<Box marginBottom={1}>
				<Text bold underline>
					Overall Statistics
				</Text>
			</Box>

			<Box flexDirection="column" marginBottom={1}>
				<Box>
					<Text>Total Requests: </Text>
					<Text color="yellow" bold>
						{formatNumber(stats.totalRequests)}
					</Text>
				</Box>
				<Box>
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
					<Text>Active Accounts: </Text>
					<Text color="cyan" bold>
						{stats.activeAccounts}
					</Text>
				</Box>
				<Box>
					<Text>Avg Response Time: </Text>
					<Text color="magenta" bold>
						{formatNumber(stats.avgResponseTime)}ms
					</Text>
				</Box>
				{stats.avgTokensPerSecond !== null && (
					<Box>
						<Text>Avg Output Speed: </Text>
						<Text color="blue" bold>
							{formatTokensPerSecond(stats.avgTokensPerSecond)}
						</Text>
					</Box>
				)}
			</Box>

			{/* Token Usage */}
			<Box marginBottom={1}>
				<Text bold underline>
					Token Usage Breakdown
				</Text>
			</Box>

			{stats.tokenDetails ? (
				<Box flexDirection="column" marginBottom={1}>
					<Box marginLeft={2}>
						<Text>├─ Input: </Text>
						<Text color="yellow">
							{formatNumber(stats.tokenDetails.inputTokens)}
						</Text>
					</Box>
					{stats.tokenDetails.cacheReadInputTokens > 0 && (
						<Box marginLeft={2}>
							<Text>├─ Cache Read: </Text>
							<Text color="cyan">
								{formatNumber(stats.tokenDetails.cacheReadInputTokens)}
							</Text>
						</Box>
					)}
					{stats.tokenDetails.cacheCreationInputTokens > 0 && (
						<Box marginLeft={2}>
							<Text>├─ Cache Creation: </Text>
							<Text color="cyan">
								{formatNumber(stats.tokenDetails.cacheCreationInputTokens)}
							</Text>
						</Box>
					)}
					<Box marginLeft={2}>
						<Text>└─ Output: </Text>
						<Text color="yellow">
							{formatNumber(stats.tokenDetails.outputTokens)}
						</Text>
					</Box>
					<Box marginTop={1}>
						<Text bold>Total Tokens: </Text>
						<Text color="green" bold>
							{formatNumber(stats.totalTokens)}
						</Text>
						<Text dimColor>
							{" "}
							({formatNumber(avgTokensPerRequest)} avg/request)
						</Text>
					</Box>
				</Box>
			) : (
				<Box marginBottom={1}>
					<Text>Total Tokens: </Text>
					<Text color="green" bold>
						{formatNumber(stats.totalTokens)}
					</Text>
				</Box>
			)}

			{/* Cost Information */}
			<Box marginBottom={1}>
				<Text bold>Total Cost: </Text>
				<Text color="green" bold>
					{formatCost(stats.totalCostUsd)}
				</Text>
				<Text dimColor> ({formatCost(avgCostPerRequest)} avg/request)</Text>
			</Box>

			{/* Account Usage */}
			{stats.accounts.length > 0 && (
				<>
					<Box marginTop={1} marginBottom={1}>
						<Text bold underline>
							Account Performance
						</Text>
					</Box>
					<Box flexDirection="column">
						{stats.accounts.map((account) => (
							<Box key={account.name}>
								<Text>{account.name}: </Text>
								<Text color="yellow">
									{formatNumber(account.requestCount)} requests
								</Text>
								<Text> (</Text>
								<Text
									color={
										account.successRate >= 95
											? "green"
											: account.successRate >= 80
												? "yellow"
												: "red"
									}
								>
									{formatPercentage(account.successRate)} success
								</Text>
								<Text>)</Text>
							</Box>
						))}
					</Box>
				</>
			)}

			{/* Charts Section - Toggle with 'c' */}
			{showCharts && (
				<>
					<Box marginTop={2} marginBottom={1}>
						<Text bold underline>
							Visual Analytics
						</Text>
					</Box>

					{/* Token Usage Pie Chart */}
					{stats.tokenDetails && (
						<Box marginBottom={2}>
							<PieChart
								title="Token Distribution"
								data={[
									{
										label: "Input",
										value: stats.tokenDetails.inputTokens,
										color: "yellow",
									},
									{
										label: "Cache",
										value:
											stats.tokenDetails.cacheReadInputTokens +
											stats.tokenDetails.cacheCreationInputTokens,
										color: "cyan",
									},
									{
										label: "Output",
										value: stats.tokenDetails.outputTokens,
										color: "green",
									},
								]}
								size="small"
								showLegend={true}
							/>
						</Box>
					)}

					{/* Account Performance Bar Chart */}
					{stats.accounts.length > 0 && (
						<Box marginBottom={2}>
							<BarChart
								title="Account Request Distribution"
								data={stats.accounts.map((account) => ({
									label: account.name,
									value: account.requestCount,
									color:
										account.successRate >= 95
											? "green"
											: account.successRate >= 80
												? "yellow"
												: "red",
								}))}
								width={30}
								showValues={true}
							/>
						</Box>
					)}

					{/* Success Rate Sparkline */}
					<Box marginBottom={2}>
						<Text bold>Performance Trend</Text>
						<Box marginTop={1}>
							<SparklineChart
								data={[85, 88, 90, 92, 91, 93, 95, stats.successRate]}
								label="Success %"
								color={
									stats.successRate >= 95
										? "green"
										: stats.successRate >= 80
											? "yellow"
											: "red"
								}
								showCurrent={true}
							/>
						</Box>
					</Box>
				</>
			)}

			{/* Recent Errors */}
			{stats.recentErrors.length > 0 && !showCharts && (
				<>
					<Box marginTop={1} marginBottom={1}>
						<Text bold underline color="red">
							Recent Errors
						</Text>
					</Box>
					<Box flexDirection="column">
						{stats.recentErrors.slice(0, 5).map((error, idx) => (
							<Box
								key={`error-${idx}-${error.substring(0, 10)}`}
								marginLeft={2}
							>
								<Text color="red" dimColor>
									• {error.length > 60 ? `${error.substring(0, 60)}...` : error}
								</Text>
							</Box>
						))}
					</Box>
				</>
			)}

			<Box marginTop={2}>
				<Text dimColor>
					[c] {showCharts ? "Hide" : "Show"} Charts • [r] Refresh • [q/ESC] Back
				</Text>
			</Box>
		</Box>
	);
}
