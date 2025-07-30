/**
 * Consolidated stats repository to eliminate duplication between tui-core and http-api
 */
import type { Database } from "bun:sqlite";
import { NO_ACCOUNT_ID } from "@ccflare/types";

export interface AccountStats {
	name: string;
	requestCount: number;
	successRate: number;
	totalRequests?: number;
}

export interface AggregatedStats {
	totalRequests: number;
	successfulRequests: number;
	avgResponseTime: number;
	totalTokens: number;
	totalCostUsd: number;
	inputTokens: number;
	outputTokens: number;
	cacheReadInputTokens: number;
	cacheCreationInputTokens: number;
	avgTokensPerSecond: number | null;
}

export class StatsRepository {
	constructor(private db: Database) {}

	/**
	 * Get aggregated statistics for all requests
	 */
	getAggregatedStats(): AggregatedStats {
		const stats = this.db
			.query(
				`SELECT 
					COUNT(*) as totalRequests,
					SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successfulRequests,
					AVG(response_time_ms) as avgResponseTime,
					SUM(input_tokens) as inputTokens,
					SUM(output_tokens) as outputTokens,
					SUM(cache_creation_input_tokens) as cacheCreationInputTokens,
					SUM(cache_read_input_tokens) as cacheReadInputTokens,
					SUM(cost_usd) as totalCostUsd,
					AVG(output_tokens_per_second) as avgTokensPerSecond
				FROM requests`,
			)
			.get() as AggregatedStats;

		// Calculate total tokens
		const totalTokens =
			(stats.inputTokens || 0) +
			(stats.outputTokens || 0) +
			(stats.cacheCreationInputTokens || 0) +
			(stats.cacheReadInputTokens || 0);

		return {
			...stats,
			totalTokens,
			avgResponseTime: stats.avgResponseTime || 0,
			totalCostUsd: stats.totalCostUsd || 0,
		};
	}

	/**
	 * Get account statistics with success rates
	 * This consolidates the duplicated logic between tui-core and http-api
	 */
	getAccountStats(limit = 10, includeUnauthenticated = true): AccountStats[] {
		// Get account request counts
		const accountStatsQuery = includeUnauthenticated
			? `
				SELECT 
					COALESCE(a.id, ?) as id,
					COALESCE(a.name, ?) as name,
					COUNT(r.id) as requestCount,
					COALESCE(a.total_requests, 0) as totalRequests
				FROM requests r
				LEFT JOIN accounts a ON a.id = r.account_used
				GROUP BY COALESCE(a.id, ?), COALESCE(a.name, ?)
				HAVING requestCount > 0
				ORDER BY requestCount DESC
				LIMIT ?
			`
			: `
				SELECT 
					a.id,
					a.name,
					a.request_count as requestCount,
					a.total_requests as totalRequests
				FROM accounts a
				WHERE a.request_count > 0
				ORDER BY a.request_count DESC
				LIMIT ?
			`;

		const params = includeUnauthenticated
			? [NO_ACCOUNT_ID, NO_ACCOUNT_ID, NO_ACCOUNT_ID, NO_ACCOUNT_ID, limit]
			: [limit];

		const accountStats = this.db
			.query(accountStatsQuery)
			.all(...params) as Array<{
			id: string;
			name: string;
			requestCount: number;
			totalRequests: number;
		}>;

		// Calculate success rate per account using a batch query
		if (accountStats.length === 0) return [];

		const accountIds = accountStats.map((a) => a.id);
		const placeholders = accountIds.map(() => "?").join(",");

		const successRates = this.db
			.query(
				`SELECT 
					account_used as accountId,
					COUNT(*) as total,
					SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful
				FROM requests
				WHERE account_used IN (${placeholders})
				GROUP BY account_used`,
			)
			.all(...accountIds) as Array<{
			accountId: string;
			total: number;
			successful: number;
		}>;

		// Create a map for O(1) lookup
		const successRateMap = new Map(
			successRates.map((sr) => [
				sr.accountId,
				sr.total > 0 ? Math.round((sr.successful / sr.total) * 100) : 0,
			]),
		);

		// Combine the data
		return accountStats.map((acc) => ({
			name: acc.name,
			requestCount: acc.requestCount,
			successRate: successRateMap.get(acc.id) || 0,
			totalRequests: acc.totalRequests,
		}));
	}

	/**
	 * Get count of active accounts
	 */
	getActiveAccountCount(): number {
		const result = this.db
			.query("SELECT COUNT(*) as count FROM accounts WHERE request_count > 0")
			.get() as { count: number };
		return result.count;
	}

	/**
	 * Get recent errors (already exists in request.repository, but adding for completeness)
	 */
	getRecentErrors(limit = 10): string[] {
		const errors = this.db
			.query(
				`SELECT DISTINCT error_message
				FROM requests
				WHERE error_message IS NOT NULL
					AND error_message != ''
				ORDER BY timestamp DESC
				LIMIT ?`,
			)
			.all(limit) as Array<{ error_message: string }>;

		return errors.map((e) => e.error_message);
	}

	/**
	 * Get top models by usage
	 */
	getTopModels(
		limit = 5,
	): Array<{ model: string; count: number; percentage: number }> {
		const models = this.db
			.query(
				`WITH model_counts AS (
					SELECT 
						model,
						COUNT(*) as count
					FROM requests
					WHERE model IS NOT NULL
					GROUP BY model
				),
				total AS (
					SELECT COUNT(*) as total FROM requests WHERE model IS NOT NULL
				)
				SELECT 
					mc.model,
					mc.count,
					ROUND(CAST(mc.count AS REAL) / t.total * 100, 2) as percentage
				FROM model_counts mc, total t
				ORDER BY mc.count DESC
				LIMIT ?`,
			)
			.all(limit) as Array<{
			model: string;
			count: number;
			percentage: number;
		}>;

		return models;
	}
}
