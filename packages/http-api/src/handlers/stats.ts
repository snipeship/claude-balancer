import type { DatabaseOperations } from "@ccflare/database";
import { jsonResponse } from "@ccflare/http-common";

/**
 * Create a stats handler
 */
export function createStatsHandler(dbOps: DatabaseOperations) {
	return async (): Promise<Response> => {
		const statsRepository = dbOps.getStatsRepository();

		// Get overall statistics using the consolidated repository
		const stats = await statsRepository.getAggregatedStats();
		const activeAccounts = await statsRepository.getActiveAccountCount();

		const successRate =
			stats.totalRequests > 0
				? Math.round((stats.successfulRequests / stats.totalRequests) * 100)
				: 0;

		// Get per-account stats (including unauthenticated requests)
		const accountsWithStats = await statsRepository.getAccountStats(10, true);

		// Get recent errors
		const recentErrors = await statsRepository.getRecentErrors();

		// Get top models
		const topModels = await statsRepository.getTopModels();

		const response = {
			totalRequests: stats.totalRequests,
			successRate,
			activeAccounts,
			avgResponseTime: Math.round(stats.avgResponseTime || 0),
			totalTokens: stats.totalTokens,
			totalCostUsd: stats.totalCostUsd,
			topModels,
			avgTokensPerSecond: stats.avgTokensPerSecond,
			accounts: accountsWithStats,
			recentErrors,
		};

		return jsonResponse(response);
	};
}

/**
 * Create a stats reset handler
 */
export function createStatsResetHandler(dbOps: DatabaseOperations) {
	return async (): Promise<Response> => {
		try {
			// Use repository methods to clear data instead of raw SQL
			const statsRepository = dbOps.getStatsRepository();

			// Clear request history using repository method
			if ('clearAll' in statsRepository) {
				await (statsRepository as any).clearAll();
			} else {
				// Fallback for legacy repository
				const db = dbOps.getDatabase();
				db.run("DELETE FROM requests");
				db.run("UPDATE accounts SET request_count = 0, session_request_count = 0");
			}

			return jsonResponse({
				success: true,
				message: "Statistics reset successfully",
			});
		} catch (error) {
			return jsonResponse({
				success: false,
				message: `Failed to reset statistics: ${error instanceof Error ? error.message : 'Unknown error'}`,
			}, 500);
		}
	};
}
