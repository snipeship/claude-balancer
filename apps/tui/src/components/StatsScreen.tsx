import type { Stats } from "@ccflare/tui-core";
import * as tuiCore from "@ccflare/tui-core";
import { Box, Text, useInput } from "ink";
import { useCallback, useEffect, useState } from "react";

interface StatsScreenProps {
	onBack: () => void;
}

export function StatsScreen({ onBack }: StatsScreenProps) {
	const [stats, setStats] = useState<Stats | null>(null);
	const [loading, setLoading] = useState(true);

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
		} catch (_error) {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadStats();
		const interval = setInterval(loadStats, 5000); // Auto-refresh every 5 seconds
		return () => clearInterval(interval);
	}, [loadStats]);

	if (loading) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="cyan" bold>
					📊 Statistics
				</Text>
				<Text dimColor>Loading...</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text color="cyan" bold>
					📊 Statistics
				</Text>
			</Box>

			{stats && (
				<Box flexDirection="column">
					<Box marginBottom={1}>
						<Text bold>Overall Stats</Text>
						<Box flexDirection="column" marginLeft={2}>
							<Text>Total Requests: {stats.totalRequests || 0}</Text>
							<Text>Success Rate: {stats.successRate || 0}%</Text>
							<Text>Active Accounts: {stats.activeAccounts || 0}</Text>
							<Text>Avg Response Time: {stats.avgResponseTime || 0}ms</Text>
							<Text>
								Total Tokens: {(stats.totalTokens || 0).toLocaleString()}
							</Text>
							{stats.tokenDetails && (
								<Box flexDirection="column" marginLeft={2}>
									<Text dimColor>
										├─ Input: {stats.tokenDetails.inputTokens.toLocaleString()}
									</Text>
									{stats.tokenDetails.cacheReadInputTokens > 0 && (
										<Text dimColor>
											├─ Cache Read:{" "}
											{stats.tokenDetails.cacheReadInputTokens.toLocaleString()}
										</Text>
									)}
									{stats.tokenDetails.cacheCreationInputTokens > 0 && (
										<Text dimColor>
											├─ Cache Creation:{" "}
											{stats.tokenDetails.cacheCreationInputTokens.toLocaleString()}
										</Text>
									)}
									<Text dimColor>
										└─ Output:{" "}
										{stats.tokenDetails.outputTokens.toLocaleString()}
									</Text>
								</Box>
							)}
							<Text>Total Cost: ${(stats.totalCostUsd || 0).toFixed(2)}</Text>
						</Box>
					</Box>

					{stats.accounts && stats.accounts.length > 0 && (
						<Box flexDirection="column">
							<Text bold>Account Usage</Text>
							{stats.accounts.map((acc) => (
								<Box key={acc.name} marginLeft={2}>
									<Text>
										{acc.name}: {acc.requestCount || 0} requests (
										{acc.successRate || 0}% success)
									</Text>
								</Box>
							))}
						</Box>
					)}

					{stats.recentErrors && stats.recentErrors.length > 0 && (
						<Box flexDirection="column" marginTop={1}>
							<Text bold color="red">
								Recent Errors
							</Text>
							{stats.recentErrors.slice(0, 5).map((error, i) => (
								<Box
									key={`error-${i}-${error.substring(0, 10)}`}
									marginLeft={2}
								>
									<Text dimColor>{error}</Text>
								</Box>
							))}
						</Box>
					)}
				</Box>
			)}

			<Box marginTop={2}>
				<Text dimColor>Press 'r' to refresh • 'q' or ESC to go back</Text>
			</Box>
		</Box>
	);
}
