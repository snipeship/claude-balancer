import { NO_ACCOUNT_ID } from "@ccflare/core";
import type { AnalyticsResponse, APIContext } from "../types";

interface BucketConfig {
	bucketMs: number;
	displayName: string;
}

interface TotalsResult {
	total_requests: number;
	success_rate: number;
	avg_response_time: number;
	total_tokens: number;
	total_cost_usd: number;
}

interface ActiveAccountsResult {
	active_accounts: number;
}

interface TokenBreakdownResult {
	input_tokens: number;
	cache_read_input_tokens: number;
	cache_creation_input_tokens: number;
	output_tokens: number;
}

function getRangeConfig(range: string): {
	startMs: number;
	bucket: BucketConfig;
} {
	const now = Date.now();
	const hour = 60 * 60 * 1000;
	const day = 24 * hour;

	switch (range) {
		case "1h":
			return {
				startMs: now - hour,
				bucket: { bucketMs: 60 * 1000, displayName: "1m" },
			};
		case "6h":
			return {
				startMs: now - 6 * hour,
				bucket: { bucketMs: 5 * 60 * 1000, displayName: "5m" },
			};
		case "24h":
			return {
				startMs: now - day,
				bucket: { bucketMs: hour, displayName: "1h" },
			};
		case "7d":
			return {
				startMs: now - 7 * day,
				bucket: { bucketMs: hour, displayName: "1h" },
			};
		case "30d":
			return {
				startMs: now - 30 * day,
				bucket: { bucketMs: day, displayName: "1d" },
			};
		default:
			return {
				startMs: now - day,
				bucket: { bucketMs: hour, displayName: "1h" },
			};
	}
}

export function createAnalyticsHandler(context: APIContext) {
	return async (params: URLSearchParams): Promise<Response> => {
		const { db } = context;
		const range = params.get("range") ?? "24h";
		const { startMs, bucket } = getRangeConfig(range);
		const mode = params.get("mode") ?? "normal";
		const isCumulative = mode === "cumulative";

		// Extract filters
		const accountsFilter =
			params.get("accounts")?.split(",").filter(Boolean) || [];
		const modelsFilter = params.get("models")?.split(",").filter(Boolean) || [];
		const statusFilter = params.get("status") || "all";

		// Build filter conditions
		const conditions: string[] = ["timestamp > ?"];
		const queryParams: (string | number)[] = [startMs];

		if (accountsFilter.length > 0) {
			// Handle account filter - map account names to IDs via join
			const placeholders = accountsFilter.map(() => "?").join(",");
			conditions.push(`(
				r.account_used IN (SELECT id FROM accounts WHERE name IN (${placeholders}))
				OR (r.account_used = ? AND ? IN (${placeholders}))
			)`);
			queryParams.push(
				...accountsFilter,
				NO_ACCOUNT_ID,
				NO_ACCOUNT_ID,
				...accountsFilter,
			);
		}

		if (modelsFilter.length > 0) {
			const placeholders = modelsFilter.map(() => "?").join(",");
			conditions.push(`model IN (${placeholders})`);
			queryParams.push(...modelsFilter);
		}

		if (statusFilter === "success") {
			conditions.push("success = 1");
		} else if (statusFilter === "error") {
			conditions.push("success = 0");
		}

		const whereClause = conditions.join(" AND ");

		try {
			// Get totals
			const totalsQuery = db.prepare(`
				SELECT
					COUNT(*) as total_requests,
					SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0) as success_rate,
					AVG(response_time_ms) as avg_response_time,
					SUM(COALESCE(total_tokens, 0)) as total_tokens,
					SUM(COALESCE(cost_usd, 0)) as total_cost_usd
				FROM requests r
				WHERE ${whereClause}
			`);
			const totals = totalsQuery.get(...queryParams) as TotalsResult;

			// Get active accounts count (including no_account for unauthenticated requests)
			const activeAccountsQuery = db.prepare(`
				SELECT COUNT(DISTINCT COALESCE(account_used, ?)) as active_accounts
				FROM requests r
				WHERE ${whereClause}
			`);
			const activeAccounts = activeAccountsQuery.get(
				NO_ACCOUNT_ID,
				...queryParams,
			) as ActiveAccountsResult;

			// Get time series data
			const timeSeriesQuery = db.prepare(`
				SELECT
					(timestamp / ?) * ? as ts,
					COUNT(*) as requests,
					SUM(COALESCE(total_tokens, 0)) as tokens,
					SUM(COALESCE(cost_usd, 0)) as cost_usd,
					SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0) as success_rate,
					SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0) as error_rate,
					SUM(COALESCE(cache_read_input_tokens, 0)) * 100.0 / 
						NULLIF(SUM(COALESCE(input_tokens, 0) + COALESCE(cache_read_input_tokens, 0) + COALESCE(cache_creation_input_tokens, 0)), 0) as cache_hit_rate,
					AVG(response_time_ms) as avg_response_time
				FROM requests r
				WHERE ${whereClause}
				GROUP BY ts
				ORDER BY ts
			`);
			const timeSeries = timeSeriesQuery.all(
				bucket.bucketMs,
				bucket.bucketMs,
				...queryParams,
			) as Array<{
				ts: number;
				requests: number;
				tokens: number;
				cost_usd: number;
				success_rate: number;
				error_rate: number;
				cache_hit_rate: number;
				avg_response_time: number;
			}>;

			// Get token breakdown
			const tokenBreakdownQuery = db.prepare(`
				SELECT
					SUM(COALESCE(input_tokens, 0)) as input_tokens,
					SUM(COALESCE(cache_read_input_tokens, 0)) as cache_read_input_tokens,
					SUM(COALESCE(cache_creation_input_tokens, 0)) as cache_creation_input_tokens,
					SUM(COALESCE(output_tokens, 0)) as output_tokens
				FROM requests r
				WHERE ${whereClause}
			`);
			const tokenBreakdown = tokenBreakdownQuery.get(
				...queryParams,
			) as TokenBreakdownResult;

			// Get model distribution
			const modelDistQuery = db.prepare(`
				SELECT
					model,
					COUNT(*) as count
				FROM requests r
				WHERE ${whereClause} AND model IS NOT NULL
				GROUP BY model
				ORDER BY count DESC
				LIMIT 10
			`);
			const modelDistribution = modelDistQuery.all(...queryParams) as Array<{
				model: string;
				count: number;
			}>;

			// Get account performance (including unauthenticated requests)
			const accountPerfQuery = db.prepare(`
				SELECT
					COALESCE(a.name, ?) as name,
					COUNT(r.id) as requests,
					SUM(CASE WHEN r.success = 1 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(r.id), 0) as success_rate
				FROM requests r
				LEFT JOIN accounts a ON a.id = r.account_used
				WHERE ${whereClause}
				GROUP BY name
				HAVING requests > 0
				ORDER BY requests DESC
			`);
			const accountPerformance = accountPerfQuery.all(
				NO_ACCOUNT_ID,
				...queryParams,
			) as Array<{
				name: string;
				requests: number;
				success_rate: number;
			}>;

			// Get model performance metrics
			const modelPerfQuery = db.prepare(`
				SELECT
					model,
					AVG(response_time_ms) as avg_response_time,
					MAX(response_time_ms) as max_response_time,
					COUNT(*) as total_requests,
					SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as error_count,
					SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0) as error_rate
				FROM requests r
				WHERE ${whereClause} AND model IS NOT NULL
				GROUP BY model
				ORDER BY total_requests DESC
				LIMIT 10
			`);
			const modelPerfData = modelPerfQuery.all(...queryParams) as Array<{
				model: string;
				avg_response_time: number;
				max_response_time: number;
				total_requests: number;
				error_count: number;
				error_rate: number;
			}>;

			// Calculate p95 for each model
			const modelPerformance = modelPerfData.map((modelData) => {
				// For p95, we'll fetch response times and calculate
				const responseTimes = db
					.prepare(`
					SELECT response_time_ms
					FROM requests r
					WHERE ${whereClause} AND model = ? AND response_time_ms IS NOT NULL
					ORDER BY response_time_ms
				`)
					.all(...queryParams, modelData.model) as Array<{
					response_time_ms: number;
				}>;

				const p95Index = Math.ceil(responseTimes.length * 0.95) - 1;
				const p95ResponseTime =
					responseTimes.length > 0
						? responseTimes[Math.min(p95Index, responseTimes.length - 1)]
								.response_time_ms
						: modelData.avg_response_time;

				return {
					model: modelData.model,
					avgResponseTime: modelData.avg_response_time || 0,
					p95ResponseTime: p95ResponseTime || 0,
					errorRate: modelData.error_rate || 0,
				};
			});

			// Get cost by model
			const costByModelQuery = db.prepare(`
				SELECT
					model,
					SUM(COALESCE(cost_usd, 0)) as cost_usd,
					COUNT(*) as requests
				FROM requests r
				WHERE ${whereClause} AND COALESCE(cost_usd, 0) > 0 AND model IS NOT NULL
				GROUP BY model
				ORDER BY cost_usd DESC
				LIMIT 10
			`);
			const costByModel = costByModelQuery.all(...queryParams) as Array<{
				model: string;
				cost_usd: number;
				requests: number;
			}>;

			// Transform timeSeries data
			let transformedTimeSeries = timeSeries.map((point) => ({
				ts: point.ts,
				requests: point.requests || 0,
				tokens: point.tokens || 0,
				costUsd: point.cost_usd || 0,
				successRate: point.success_rate || 0,
				errorRate: point.error_rate || 0,
				cacheHitRate: point.cache_hit_rate || 0,
				avgResponseTime: point.avg_response_time || 0,
			}));

			// Apply cumulative transformation if requested
			if (isCumulative) {
				let runningRequests = 0;
				let runningTokens = 0;
				let runningCostUsd = 0;

				transformedTimeSeries = transformedTimeSeries.map((point) => {
					runningRequests += point.requests;
					runningTokens += point.tokens;
					runningCostUsd += point.costUsd;

					return {
						...point,
						requests: runningRequests,
						tokens: runningTokens,
						costUsd: runningCostUsd,
						// Keep rates as-is (not cumulative)
					};
				});
			}

			const response: AnalyticsResponse = {
				meta: {
					range,
					bucket: bucket.displayName,
					cumulative: isCumulative,
				},
				totals: {
					requests: totals.total_requests || 0,
					successRate: totals.success_rate || 0,
					activeAccounts: activeAccounts.active_accounts || 0,
					avgResponseTime: totals.avg_response_time || 0,
					totalTokens: totals.total_tokens || 0,
					totalCostUsd: totals.total_cost_usd || 0,
				},
				timeSeries: transformedTimeSeries,
				tokenBreakdown: {
					inputTokens: tokenBreakdown?.input_tokens || 0,
					cacheReadInputTokens: tokenBreakdown?.cache_read_input_tokens || 0,
					cacheCreationInputTokens:
						tokenBreakdown?.cache_creation_input_tokens || 0,
					outputTokens: tokenBreakdown?.output_tokens || 0,
				},
				modelDistribution,
				accountPerformance: accountPerformance.map((acc) => ({
					name: acc.name,
					requests: acc.requests,
					successRate: acc.success_rate || 0,
				})),
				costByModel: costByModel.map((model) => ({
					model: model.model,
					costUsd: model.cost_usd || 0,
					requests: model.requests || 0,
				})),
				modelPerformance,
			};

			return new Response(JSON.stringify(response), {
				headers: { "Content-Type": "application/json" },
			});
		} catch (error) {
			console.error("Analytics error:", error);
			return new Response(
				JSON.stringify({ error: "Failed to fetch analytics data" }),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				},
			);
		}
	};
}
