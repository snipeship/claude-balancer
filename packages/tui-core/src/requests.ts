import { DatabaseFactory } from "@ccflare/database";
import type { RequestPayload } from "@ccflare/types";

export type { RequestPayload };

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

	// Use proper type checking instead of casting
	let rows;
	if ('listRequestPayloadsWithAccountNamesAsync' in dbOps) {
		rows = await dbOps.listRequestPayloadsWithAccountNamesAsync(limit);
	} else {
		// Fallback for legacy DatabaseOperations
		rows = dbOps.listRequestPayloadsWithAccountNames(limit);
	}

	const parsed = rows.map((r: { id: string; json: string; account_name: string | null }) => {
		try {
			const data = JSON.parse(r.json);
			// Add account name from the JOIN result (no additional query needed)
			if (r.account_name && data.meta) {
				data.meta.accountName = r.account_name;
			}
			return { id: r.id, ...data } as RequestPayload;
		} catch {
			return {
				id: r.id,
				error: "Failed to parse payload",
				request: { headers: {}, body: null },
				response: null,
				meta: { timestamp: Date.now() },
			} as RequestPayload;
		}
	});

	return parsed;
}

/**
 * Get full request payload data for a specific request (for detailed view)
 */
export async function getRequestPayload(requestId: string): Promise<RequestPayload | null> {
	const dbOps = DatabaseFactory.getInstance();

	// Use proper type checking instead of casting
	if ('getRequestPayloadAsync' in dbOps) {
		const payload = await dbOps.getRequestPayloadAsync(requestId);
		return payload as RequestPayload | null;
	} else {
		// Fallback for legacy DatabaseOperations
		const payload = dbOps.getRequestPayload(requestId);
		return payload as RequestPayload | null;
	}
}

export async function getRequestSummaries(
	limit = 100,
): Promise<Map<string, RequestSummary>> {
	const dbOps = DatabaseFactory.getInstance();

	// Use proper type checking instead of casting
	let summaries: any[];
	if ('getRequestSummariesAsync' in dbOps) {
		summaries = await dbOps.getRequestSummariesAsync(limit);
	} else {
		// Legacy DatabaseOperations doesn't have this method, return empty array
		summaries = [];
	}

	const summaryMap = new Map<string, RequestSummary>();
	summaries.forEach((summary: any) => {
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
