import { DatabaseFactory } from "@ccflare/database";

export interface Stats {
	totalRequests: number;
	successRate: number;
	activeAccounts: number;
	avgResponseTime: number;
	totalTokens: number;
	totalCostUsd: number;
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
	const db = dbOps.getDatabase();
	// Get overall statistics
	const stats = db
		.query(
			`
				SELECT 
					COUNT(*) as totalRequests,
					SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successfulRequests,
					AVG(response_time_ms) as avgResponseTime,
					SUM(total_tokens) as totalTokens,
					SUM(cost_usd) as totalCostUsd,
					SUM(input_tokens) as inputTokens,
					SUM(cache_read_input_tokens) as cacheReadInputTokens,
					SUM(cache_creation_input_tokens) as cacheCreationInputTokens,
					SUM(output_tokens) as outputTokens
				FROM requests
			`,
		)
		.get() as
		| {
				totalRequests: number;
				successfulRequests: number;
				avgResponseTime: number | null;
				totalTokens: number | null;
				totalCostUsd: number | null;
				inputTokens: number | null;
				cacheReadInputTokens: number | null;
				cacheCreationInputTokens: number | null;
				outputTokens: number | null;
		  }
		| undefined;

	const accountCount = db
		.query("SELECT COUNT(*) as count FROM accounts")
		.get() as { count: number } | undefined;

	const successRate =
		stats && stats.totalRequests > 0
			? Math.round((stats.successfulRequests / stats.totalRequests) * 100)
			: 0;

	// Get per-account stats
	const accountStats = db
		.query(
			`
				SELECT 
					id,
					name,
					request_count as requestCount,
					total_requests as totalRequests
				FROM accounts
				WHERE request_count > 0
				ORDER BY request_count DESC
				LIMIT 10
			`,
		)
		.all() as Array<{
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

	return {
		totalRequests: stats?.totalRequests || 0,
		successRate,
		activeAccounts: accountCount?.count || 0,
		avgResponseTime: Math.round(stats?.avgResponseTime || 0),
		totalTokens: stats?.totalTokens || 0,
		totalCostUsd: stats?.totalCostUsd || 0,
		tokenDetails:
			stats?.inputTokens || stats?.outputTokens
				? {
						inputTokens: stats?.inputTokens || 0,
						cacheReadInputTokens: stats?.cacheReadInputTokens || 0,
						cacheCreationInputTokens: stats?.cacheCreationInputTokens || 0,
						outputTokens: stats?.outputTokens || 0,
					}
				: undefined,
		accounts: accountsWithStats,
		recentErrors: recentErrors.map((e) => e.error_message),
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
