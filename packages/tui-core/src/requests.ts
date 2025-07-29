import { DatabaseFactory, withDatabaseRetrySync } from "@ccflare/database";

export interface RequestPayload {
	id: string;
	request: {
		headers: Record<string, string>;
		body: string | null;
	};
	response: {
		status: number;
		headers: Record<string, string>;
		body: string | null;
	} | null;
	error?: string;
	meta: {
		accountId?: string;
		accountName?: string;
		retry?: number;
		timestamp: number;
		success?: boolean;
		rateLimited?: boolean;
		accountsAttempted?: number;
	};
}

export interface RequestSummary {
	id: string;
	model?: string;
	inputTokens?: number;
	outputTokens?: number;
	totalTokens?: number;
	cacheReadInputTokens?: number;
	cacheCreationInputTokens?: number;
	costUsd?: number;
	responseTimeMs?: number;
}

export async function getRequests(limit = 100): Promise<RequestPayload[]> {
	const dbOps = DatabaseFactory.getInstance();

	// Use optimized approach: get summary data from requests table (no JSON parsing)
	const summaries = withDatabaseRetrySync(() => {
		const db = dbOps.getDatabase();
		return db
			.query(`
				SELECT
					r.id,
					r.timestamp,
					r.method,
					r.path,
					r.account_used,
					r.status_code,
					r.success,
					r.error_message,
					r.response_time_ms,
					r.failover_attempts,
					r.model,
					r.input_tokens,
					r.output_tokens,
					r.total_tokens,
					r.cache_read_input_tokens,
					r.cache_creation_input_tokens,
					r.cost_usd,
					a.name as account_name
				FROM requests r
				LEFT JOIN accounts a ON r.account_used = a.id
				ORDER BY r.timestamp DESC
				LIMIT ?
			`)
			.all(limit);
	}, dbOps.getRetryConfig(), "getRequests") as Array<{
		id: string;
		timestamp: number;
		method: string;
		path: string;
		account_used: string | null;
		account_name: string | null;
		status_code: number | null;
		success: 0 | 1;
		error_message: string | null;
		response_time_ms: number | null;
		failover_attempts: number;
		model: string | null;
		input_tokens: number | null;
		output_tokens: number | null;
		total_tokens: number | null;
		cache_read_input_tokens: number | null;
		cache_creation_input_tokens: number | null;
		cost_usd: number | null;
	}>;

	// Transform to RequestPayload format with summary data only
	const parsed = summaries.map((summary) => ({
		id: summary.id,
		request: { headers: {}, body: null }, // Empty for summary view
		response: summary.status_code ? {
			status: summary.status_code,
			headers: {},
			body: null
		} : null,
		error: summary.error_message || undefined,
		meta: {
			timestamp: summary.timestamp,
			accountId: summary.account_used,
			accountName: summary.account_name,
			success: summary.success === 1,
			retry: summary.failover_attempts,
			rateLimited: false, // Would need calculation if needed
		},
	})) as RequestPayload[];

	return parsed;
}

/**
 * Get full request payload data for a specific request (for detailed view)
 */
export async function getRequestPayload(requestId: string): Promise<RequestPayload | null> {
	const dbOps = DatabaseFactory.getInstance();

	const payload = withDatabaseRetrySync(() => {
		return dbOps.getRequestPayload(requestId);
	}, dbOps.getRetryConfig(), "getRequestPayload");

	return payload as RequestPayload | null;
}

export async function getRequestSummaries(
	limit = 100,
): Promise<Map<string, RequestSummary>> {
	const dbOps = DatabaseFactory.getInstance();

	// Use retry logic for the database query
	const summaries = withDatabaseRetrySync(() => {
		const db = dbOps.getDatabase();
		return db
			.query(`
			SELECT
				id,
				model,
				input_tokens as inputTokens,
				output_tokens as outputTokens,
				total_tokens as totalTokens,
				cache_read_input_tokens as cacheReadInputTokens,
				cache_creation_input_tokens as cacheCreationInputTokens,
				cost_usd as costUsd,
				response_time_ms as responseTimeMs
			FROM requests
			ORDER BY timestamp DESC
			LIMIT ?
		`)
			.all(limit);
	}, dbOps.getRetryConfig(), "getRequestSummaries") as Array<{
		id: string;
		model?: string;
		inputTokens?: number;
		outputTokens?: number;
		totalTokens?: number;
		cacheReadInputTokens?: number;
		cacheCreationInputTokens?: number;
		costUsd?: number;
		responseTimeMs?: number;
	}>;

	const summaryMap = new Map<string, RequestSummary>();
	summaries.forEach((summary) => {
		summaryMap.set(summary.id, {
			id: summary.id,
			model: summary.model || undefined,
			inputTokens: summary.inputTokens || undefined,
			outputTokens: summary.outputTokens || undefined,
			totalTokens: summary.totalTokens || undefined,
			cacheReadInputTokens: summary.cacheReadInputTokens || undefined,
			cacheCreationInputTokens: summary.cacheCreationInputTokens || undefined,
			costUsd: summary.costUsd || undefined,
			responseTimeMs: summary.responseTimeMs || undefined,
		});
	});

	return summaryMap;
}
