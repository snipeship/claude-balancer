
import type { DatabaseOperations } from "@ccflare/database";
import { validateString } from "@ccflare/core";
import { jsonResponse } from "@ccflare/http-common";
import type { RequestResponse } from "../types";

/**
 * Create a requests summary handler (updated to use repository pattern)
 */
export function createRequestsSummaryHandler(dbOps: DatabaseOperations) {
	return async (limit: number = 50): Promise<Response> => {
		try {
			// Use async method if available (new DrizzleDatabaseOperations)
			let requests: Array<{
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
			agent_used: string | null;
			output_tokens_per_second: number | null;
		}>;

		// Since we updated the factory to always use DrizzleDatabaseOperations,
		// we can directly use the async repository method
		requests = await (dbOps as any).getRequestsWithAccountNamesAsync(limit);

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
			agentUsed: request.agent_used || undefined,
			tokensPerSecond: request.output_tokens_per_second || undefined,
		}));

		return jsonResponse(response);
		} catch (error) {
			console.error("Error fetching requests:", error);
			return jsonResponse({ error: "Failed to fetch requests" }, 500);
		}
	};
}

/**
 * Create a detailed requests handler with full payload data
 */
export function createRequestsDetailHandler(dbOps: DatabaseOperations) {
	return async (limit = 100): Promise<Response> => {
		try {
			// Use async method if available (DrizzleDatabaseOperations)
			let rows: Array<{ id: string; json: string; account_name: string | null }>;

			if ('listRequestPayloadsWithAccountNamesAsync' in dbOps) {
				rows = await (dbOps as any).listRequestPayloadsWithAccountNamesAsync(limit);
			} else {
				// Fallback to sync method for legacy DatabaseOperations
				rows = dbOps.listRequestPayloadsWithAccountNames(limit);
			}

			const parsed = rows.map((r) => {
				try {
					const data = JSON.parse(r.json);
					// Add account name to the meta field if available
					if (r.account_name && data.meta) {
						data.meta.accountName = r.account_name;
					}
					return { id: r.id, ...data };
				} catch {
					return { id: r.id, error: "Failed to parse payload" };
				}
			});

			return jsonResponse(parsed);
		} catch (error) {
			return jsonResponse({
				error: `Failed to retrieve request details: ${error instanceof Error ? error.message : 'Unknown error'}`
			}, 500);
		}
	};
}

/**
 * Create a handler for individual request payload retrieval
 */
export function createRequestPayloadHandler(dbOps: DatabaseOperations) {
	return async (requestId: string): Promise<Response> => {
		// Validate requestId parameter
		try {
			validateString(requestId, 'requestId', {
				required: true,
				minLength: 1,
				maxLength: 255,
				pattern: /^[a-zA-Z0-9\-_]+$/
			});
		} catch (error) {
			return jsonResponse(
				{ error: 'Invalid request ID format' },
				400
			);
		}

		try {
			let payload: unknown | null;

			// Use async method if available (DrizzleDatabaseOperations)
			if ('getRequestPayloadAsync' in dbOps) {
				payload = await (dbOps as any).getRequestPayloadAsync(requestId);
			} else {
				// Fallback to sync method for legacy DatabaseOperations
				payload = dbOps.getRequestPayload(requestId);
			}

			if (!payload) {
				return jsonResponse(
					{ error: 'Request not found' },
					404
				);
			}

			// The payload is already parsed by the repository, return it directly
			return jsonResponse(payload);
		} catch (error) {
			return jsonResponse({
				error: `Failed to retrieve request payload: ${error instanceof Error ? error.message : 'Unknown error'}`
			}, 500);
		}
	};
}
