import * as cliCommands from "@ccflare/cli-commands";
import { DatabaseFactory } from "@ccflare/database";

export interface Stats {
	totalRequests: number;
	successRate: number;
	activeAccounts: number;
	avgResponseTime: number;
	totalTokens: number;
	totalCostUsd: number;
	avgTokensPerSecond: number | null;
	tokenDetails?: {
		inputTokens: number;
		cacheReadInputTokens: number;
		cacheCreationInputTokens: number;
		outputTokens: number;
	};
	accounts: Array<{
		name: string;
		requestCount: number;
		successRate: number;
	}>;
	recentErrors: string[];
}

export async function getStats(): Promise<Stats> {
	const dbOps = DatabaseFactory.getInstance();
	const statsRepository = dbOps.getStatsRepository();

	// Get overall statistics using the consolidated repository
	const stats = statsRepository.getAggregatedStats();
	const activeAccounts = statsRepository.getActiveAccountCount();

	const successRate =
		stats && stats.totalRequests > 0
			? Math.round((stats.successfulRequests / stats.totalRequests) * 100)
			: 0;

	// Get per-account stats using the consolidated repository
	const accountsWithStats = statsRepository.getAccountStats(10, false);

	// Get recent errors
	const recentErrors = statsRepository.getRecentErrors();

	return {
		totalRequests: stats.totalRequests,
		successRate,
		activeAccounts,
		avgResponseTime: Math.round(stats.avgResponseTime || 0),
		totalTokens: stats.totalTokens,
		totalCostUsd: stats.totalCostUsd,
		avgTokensPerSecond: stats.avgTokensPerSecond,
		tokenDetails:
			stats.inputTokens || stats.outputTokens
				? {
						inputTokens: stats.inputTokens,
						cacheReadInputTokens: stats.cacheReadInputTokens,
						cacheCreationInputTokens: stats.cacheCreationInputTokens,
						outputTokens: stats.outputTokens,
					}
				: undefined,
		accounts: accountsWithStats,
		recentErrors,
	};
}

export async function resetStats(): Promise<void> {
	const dbOps = DatabaseFactory.getInstance();
	const db = dbOps.getDatabase();
	// Clear request history
	db.run("DELETE FROM requests");
	// Reset account statistics
	db.run("UPDATE accounts SET request_count = 0, session_request_count = 0");
}

export async function clearHistory(): Promise<void> {
	const dbOps = DatabaseFactory.getInstance();
	const db = dbOps.getDatabase();
	db.run("DELETE FROM requests");
}

export async function analyzePerformance(): Promise<void> {
	const dbOps = DatabaseFactory.getInstance();
	const db = dbOps.getDatabase();
	cliCommands.analyzePerformance(db);
}
