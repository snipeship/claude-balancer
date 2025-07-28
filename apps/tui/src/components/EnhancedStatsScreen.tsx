import * as tuiCore from "@ccflare/tui-core";
import { Box, Text, useInput } from "ink";
import { useCallback, useEffect, useState } from "react";

interface EnhancedStatsScreenProps {
	onBack: () => void;
}

export function EnhancedStatsScreen({ onBack }: EnhancedStatsScreenProps) {
	const [stats, setStats] = useState<tuiCore.Stats | null>(null);
	const [loading, setLoading] = useState(true);
	const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

	useInput((input, key) => {
		if (key.escape || input === "q") {
			onBack();
		}
		if (input === "r") {
			loadStats();
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

	const formatNumber = (num: number): string => {
		return num.toLocaleString();
	};

	const formatCost = (cost: number): string => {
		return `$${cost.toFixed(4)}`;
	};

	const formatPercentage = (rate: number): string => {
		return `${rate}%`;
	};

	const formatTimestamp = (date: Date): string => {
		return date.toLocaleTimeString();
	};

	if (loading) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="cyan" bold>
					📊 Enhanced Statistics Dashboard
				</Text>
				<Text dimColor>Loading...</Text>
			</Box>
		);
	}

	if (!stats) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="cyan" bold>
					📊 Enhanced Statistics Dashboard
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
					📊 Enhanced Statistics Dashboard
				</Text>
				<Text dimColor>Last updated: {formatTimestamp(lastUpdated)}</Text>
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

			{/* Recent Errors */}
			{stats.recentErrors.length > 0 && (
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
				<Text dimColor>Press 'r' to refresh • 'q' or ESC to go back</Text>
			</Box>
		</Box>
	);
}
