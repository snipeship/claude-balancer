import type { Database } from "bun:sqlite";
import { NO_ACCOUNT_ID } from "@ccflare/core";
import type { DatabaseOperations } from "@ccflare/database";
import { jsonResponse } from "../utils/http-error";

/**
 * Create a stats handler
 */
export function createStatsHandler(db: Database) {
	return (): Response => {
		const stats = db
			.query(
				`
				SELECT 
					COUNT(*) as totalRequests,
					SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successfulRequests,
					AVG(response_time_ms) as avgResponseTime,
					SUM(total_tokens) as totalTokens,
					SUM(cost_usd) as totalCostUsd
				FROM requests
			`,
			)
			// biome-ignore lint/suspicious/noExplicitAny: Database query results can vary in shape
			.get() as any;

		const accountCount = db
			.query("SELECT COUNT(*) as count FROM accounts")
			.get() as { count: number } | undefined;

		const successRate =
			stats?.totalRequests > 0
				? Math.round((stats.successfulRequests / stats.totalRequests) * 100)
				: 0;

		// Get per-account stats (including unauthenticated requests)
		const accountStats = db
			.query(
				`
				WITH account_requests AS (
					SELECT 
						COALESCE(a.id, ?) as id,
						COALESCE(a.name, ?) as name,
						COUNT(r.id) as requestCount,
						COUNT(r.id) as totalRequests
					FROM requests r
					LEFT JOIN accounts a ON a.id = r.account_used
					GROUP BY COALESCE(a.id, ?), COALESCE(a.name, ?)
					HAVING requestCount > 0
				)
				SELECT * FROM account_requests
				ORDER BY requestCount DESC
				LIMIT 10
			`,
			)
			.all(
				NO_ACCOUNT_ID,
				NO_ACCOUNT_ID,
				NO_ACCOUNT_ID,
				NO_ACCOUNT_ID,
			) as Array<{
			id: string;
			name: string;
			requestCount: number;
			totalRequests: number;
		}>;

		// Calculate success rate per account
		const accountsWithStats = accountStats.map((acc) => {
			const accRequests = db
				.query(
					`
					SELECT 
						COUNT(*) as total,
						SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful
					FROM requests
					WHERE account_used = ?
				`,
				)
				.get(acc.id) as { total: number; successful: number } | undefined;

			const accSuccessRate =
				accRequests && accRequests.total > 0
					? Math.round((accRequests.successful / accRequests.total) * 100)
					: 0;

			return {
				name: acc.name,
				requestCount: acc.requestCount,
				successRate: accSuccessRate,
			};
		});

		// Get recent errors
		const recentErrors = db
			.query(
				`
				SELECT error_message
				FROM requests
				WHERE success = 0 AND error_message IS NOT NULL
				ORDER BY timestamp DESC
				LIMIT 10
			`,
			)
			.all() as Array<{ error_message: string }>;

		// Get top models
		const topModels = db
			.query(
				`
				SELECT model, COUNT(*) as count
				FROM requests
				WHERE model IS NOT NULL
				GROUP BY model
				ORDER BY count DESC
				LIMIT 10
			`,
			)
			.all() as Array<{ model: string; count: number }>;

		const response = {
			totalRequests: stats?.totalRequests || 0,
			successRate,
			activeAccounts: accountCount?.count || 0,
			avgResponseTime: Math.round(stats?.avgResponseTime || 0),
			totalTokens: stats?.totalTokens || 0,
			totalCostUsd: stats?.totalCostUsd || 0,
			topModels,
			accounts: accountsWithStats,
			recentErrors: recentErrors.map((e) => e.error_message),
		};

		return jsonResponse(response);
	};
}

/**
 * Create a stats reset handler
 */
export function createStatsResetHandler(dbOps: DatabaseOperations) {
	return async (): Promise<Response> => {
		const db = dbOps.getDatabase();
		// Clear request history
		db.run("DELETE FROM requests");
		// Reset account statistics
		db.run("UPDATE accounts SET request_count = 0, session_request_count = 0");

		return jsonResponse({
			success: true,
			message: "Statistics reset successfully",
		});
	};
}
