import type { Database } from "bun:sqlite";
import type { DatabaseOperations } from "@ccflare/database";
import type { RequestResponse } from "../types";

/**
 * Create a requests summary handler (existing functionality)
 */
export function createRequestsSummaryHandler(db: Database) {
	return (limit: number = 50): Response => {
		const requests = db
			.query(
				`
				SELECT r.*, a.name as account_name
				FROM requests r
				LEFT JOIN accounts a ON r.account_used = a.id
				ORDER BY r.timestamp DESC
				LIMIT ?1
			`,
			)
			.all(limit) as Array<{
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
			prompt_tokens: number | null;
			completion_tokens: number | null;
			total_tokens: number | null;
			input_tokens: number | null;
			cache_read_input_tokens: number | null;
			cache_creation_input_tokens: number | null;
			output_tokens: number | null;
			cost_usd: number | null;
		}>;

		const response: RequestResponse[] = requests.map((request) => ({
			id: request.id,
			timestamp: new Date(request.timestamp).toISOString(),
			method: request.method,
			path: request.path,
			accountUsed: request.account_name || request.account_used,
			statusCode: request.status_code,
			success: request.success === 1,
			errorMessage: request.error_message,
			responseTimeMs: request.response_time_ms,
			failoverAttempts: request.failover_attempts,
			model: request.model || undefined,
			promptTokens: request.prompt_tokens || undefined,
			completionTokens: request.completion_tokens || undefined,
			totalTokens: request.total_tokens || undefined,
			inputTokens: request.input_tokens || undefined,
			cacheReadInputTokens: request.cache_read_input_tokens || undefined,
			cacheCreationInputTokens:
				request.cache_creation_input_tokens || undefined,
			outputTokens: request.output_tokens || undefined,
			costUsd: request.cost_usd || undefined,
		}));

		return new Response(JSON.stringify(response), {
			headers: { "Content-Type": "application/json" },
		});
	};
}

/**
 * Create a lightweight requests summary handler for initial page load
 */
export function createRequestsDetailHandler(dbOps: DatabaseOperations) {
	return (limit = 100): Response => {
		const db = dbOps.getDatabase();

		// Get only summary data from requests table (no JSON parsing needed)
		const summaries = db
			.query(
				`
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
				LIMIT ?1
			`,
			)
			.all(limit) as Array<{
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

		// Transform to the expected format without full payload data
		const response = summaries.map((summary) => ({
			id: summary.id,
			meta: {
				timestamp: summary.timestamp,
				accountId: summary.account_used,
				accountName: summary.account_name,
				success: summary.success === 1,
				retry: summary.failover_attempts,
				rateLimited: false, // This would need to be calculated if needed
			},
			response: summary.status_code ? { status: summary.status_code } : null,
			error: summary.error_message || undefined,
			summary: {
				id: summary.id,
				model: summary.model || undefined,
				inputTokens: summary.input_tokens || undefined,
				outputTokens: summary.output_tokens || undefined,
				totalTokens: summary.total_tokens || undefined,
				cacheReadInputTokens: summary.cache_read_input_tokens || undefined,
				cacheCreationInputTokens: summary.cache_creation_input_tokens || undefined,
				costUsd: summary.cost_usd || undefined,
				responseTimeMs: summary.response_time_ms || undefined,
			},
		}));

		return new Response(JSON.stringify(response), {
			headers: { "Content-Type": "application/json" },
		});
	};
}

/**
 * Create a handler for getting individual request payload details
 */
export function createRequestPayloadHandler(dbOps: DatabaseOperations) {
	return (requestId: string): Response => {
		const payload = dbOps.getRequestPayload(requestId);

		if (!payload) {
			return new Response(JSON.stringify({ error: "Request not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			});
		}

		return new Response(JSON.stringify(payload), {
			headers: { "Content-Type": "application/json" },
		});
	};
}


