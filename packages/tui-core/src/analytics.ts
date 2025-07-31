import { DatabaseFactory } from "@ccflare/database";

export interface TimeSeriesDataPoint {
	time: number;
	requests: number;
	tokens: number;
	cost: number;
	responseTime: number;
	errorRate: number;
	cacheHitRate: number;
	successRate: number;
}

export interface ModelDistribution {
	model: string;
	count: number;
	percentage: number;
}

export interface Analytics {
	timeSeries: TimeSeriesDataPoint[];
	modelDistribution: ModelDistribution[];
}

function getRangeConfig(range: string): {
	startMs: number;
	bucketMs: number;
} {
	const now = Date.now();
	const hour = 60 * 60 * 1000;
	const day = 24 * hour;

	switch (range) {
		case "1h":
			return {
				startMs: now - hour,
				bucketMs: 5 * 60 * 1000, // 5 minutes
			};
		case "6h":
			return {
				startMs: now - 6 * hour,
				bucketMs: 15 * 60 * 1000, // 15 minutes
			};
		case "24h":
			return {
				startMs: now - day,
				bucketMs: 30 * 60 * 1000, // 30 minutes
			};
		case "7d":
			return {
				startMs: now - 7 * day,
				bucketMs: 60 * 60 * 1000, // 1 hour
			};
		default:
			return {
				startMs: now - day,
				bucketMs: 30 * 60 * 1000, // 30 minutes
			};
	}
}

export async function getAnalytics(timeRange: string): Promise<Analytics> {
	const dbOps = DatabaseFactory.getInstance();
	const db = dbOps.getDatabase();
	const { startMs, bucketMs } = getRangeConfig(timeRange);

	// Get time series data
	const timeSeriesQuery = db.prepare(`
		SELECT
			(timestamp / ?) * ? as ts,
			COUNT(*) as requests,
			SUM(COALESCE(total_tokens, 0)) as tokens,
			SUM(COALESCE(cost_usd, 0)) as cost,
			AVG(response_time_ms) as avg_response_time,
			SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0) as error_rate,
			SUM(COALESCE(cache_read_input_tokens, 0)) * 100.0 / 
				NULLIF(SUM(COALESCE(input_tokens, 0) + COALESCE(cache_read_input_tokens, 0) + COALESCE(cache_creation_input_tokens, 0)), 0) as cache_hit_rate,
			SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0) as success_rate
		FROM requests
		WHERE timestamp > ?
		GROUP BY ts
		ORDER BY ts
	`);

	const timeSeries = timeSeriesQuery.all(bucketMs, bucketMs, startMs) as Array<{
		ts: number;
		requests: number;
		tokens: number;
		cost: number;
		avg_response_time: number;
		error_rate: number;
		cache_hit_rate: number;
		success_rate: number;
	}>;

	// Get model distribution
	const modelDistQuery = db.prepare(`
		SELECT
			model,
			COUNT(*) as count
		FROM requests
		WHERE timestamp > ? AND model IS NOT NULL
		GROUP BY model
		ORDER BY count DESC
	`);

	const modelDistData = modelDistQuery.all(startMs) as Array<{
		model: string;
		count: number;
	}>;

	const totalModelRequests = modelDistData.reduce((sum, m) => sum + m.count, 0);

	const modelDistribution = modelDistData.map((m) => ({
		model: m.model,
		count: m.count,
		percentage:
			totalModelRequests > 0 ? (m.count / totalModelRequests) * 100 : 0,
	}));

	return {
		timeSeries: timeSeries.map((point) => ({
			time: point.ts,
			requests: point.requests || 0,
			tokens: point.tokens || 0,
			cost: point.cost || 0,
			responseTime: point.avg_response_time || 0,
			errorRate: point.error_rate || 0,
			cacheHitRate: point.cache_hit_rate || 0,
			successRate: point.success_rate || 0,
		})),
		modelDistribution,
	};
}
