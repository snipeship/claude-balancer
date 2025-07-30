import {
	formatCost,
	formatDuration,
	formatTokens,
	formatTokensPerSecond,
} from "../formatters";

/**
 * Token usage data structure
 */
export interface TokenUsageData {
	inputTokens?: number;
	outputTokens?: number;
	cacheReadInputTokens?: number;
	cacheCreationInputTokens?: number;
	totalTokens?: number;
	costUsd?: number;
	responseTimeMs?: number;
	tokensPerSecond?: number;
}

/**
 * Processed token usage information for display
 */
export interface TokenUsageInfo {
	hasData: boolean;
	sections: {
		inputTokens?: { label: string; value: string };
		outputTokens?: { label: string; value: string };
		cacheReadTokens?: { label: string; value: string };
		cacheCreationTokens?: { label: string; value: string };
		totalTokens?: { label: string; value: string };
		cost?: { label: string; value: string };
		responseTime?: { label: string; value: string };
		tokensPerSecond?: { label: string; value: string };
	};
}

/**
 * Process token usage data for display
 * This contains the shared business logic for both dashboard and TUI
 */
export function processTokenUsage(
	data: TokenUsageData | undefined,
): TokenUsageInfo {
	if (!data || (!data.inputTokens && !data.outputTokens)) {
		return {
			hasData: false,
			sections: {},
		};
	}

	const sections: TokenUsageInfo["sections"] = {};

	// Input tokens
	if (data.inputTokens !== undefined) {
		sections.inputTokens = {
			label: "Input Tokens",
			value: formatTokens(data.inputTokens),
		};
	}

	// Output tokens
	if (data.outputTokens !== undefined) {
		sections.outputTokens = {
			label: "Output Tokens",
			value: formatTokens(data.outputTokens),
		};
	}

	// Cache read tokens
	if (
		data.cacheReadInputTokens !== undefined &&
		data.cacheReadInputTokens > 0
	) {
		sections.cacheReadTokens = {
			label: "Cache Read Tokens",
			value: formatTokens(data.cacheReadInputTokens),
		};
	}

	// Cache creation tokens
	if (
		data.cacheCreationInputTokens !== undefined &&
		data.cacheCreationInputTokens > 0
	) {
		sections.cacheCreationTokens = {
			label: "Cache Creation Tokens",
			value: formatTokens(data.cacheCreationInputTokens),
		};
	}

	// Total tokens
	if (data.totalTokens !== undefined) {
		sections.totalTokens = {
			label: "Total Tokens",
			value: formatTokens(data.totalTokens),
		};
	}

	// Cost
	if (data.costUsd !== undefined && data.costUsd > 0) {
		sections.cost = {
			label: "Cost",
			value: formatCost(data.costUsd),
		};
	}

	// Response time
	if (data.responseTimeMs !== undefined) {
		sections.responseTime = {
			label: "Response Time",
			value: formatDuration(data.responseTimeMs),
		};
	}

	// Tokens per second
	if (data.tokensPerSecond !== undefined && data.tokensPerSecond > 0) {
		sections.tokensPerSecond = {
			label: "Speed",
			value: formatTokensPerSecond(data.tokensPerSecond),
		};
	}

	return {
		hasData: true,
		sections,
	};
}

/**
 * Helper to determine if there are cache tokens to display
 */
export function hasCacheTokens(data: TokenUsageData | undefined): boolean {
	if (!data) return false;
	return (
		(data.cacheReadInputTokens !== undefined &&
			data.cacheReadInputTokens > 0) ||
		(data.cacheCreationInputTokens !== undefined &&
			data.cacheCreationInputTokens > 0)
	);
}
