import { TIME_CONSTANTS } from "@ccflare/core";

/**
 * Format duration in milliseconds to human-readable string
 */
export function formatDuration(ms: number): string {
	if (ms < TIME_CONSTANTS.SECOND) return `${ms}ms`;
	if (ms < TIME_CONSTANTS.MINUTE)
		return `${(ms / TIME_CONSTANTS.SECOND).toFixed(1)}s`;
	if (ms < TIME_CONSTANTS.HOUR)
		return `${(ms / TIME_CONSTANTS.MINUTE).toFixed(1)}m`;
	return `${(ms / TIME_CONSTANTS.HOUR).toFixed(1)}h`;
}

/**
 * Format tokens with locale-aware thousands separator
 */
export function formatTokens(tokens?: number): string {
	if (!tokens || tokens === 0) return "0";
	return tokens.toLocaleString();
}

/**
 * Format USD cost with 4 decimal places
 */
export function formatCost(cost?: number): string {
	if (!cost || cost === 0) return "$0.0000";
	return `$${cost.toFixed(4)}`;
}

/**
 * Format percentage with specified decimal places
 */
export function formatPercentage(value: number, decimals = 1): string {
	return `${value.toFixed(decimals)}%`;
}

/**
 * Format number with locale-aware thousands separator
 */
export function formatNumber(value: number): string {
	return value.toLocaleString();
}

/**
 * Format timestamp to locale string
 */
export function formatTimestamp(timestamp: number | string): string {
	const date =
		typeof timestamp === "string" ? new Date(timestamp) : new Date(timestamp);
	return date.toLocaleString();
}

/**
 * Format tokens per second with 1 decimal place
 */
export function formatTokensPerSecond(tokensPerSecond?: number | null): string {
	if (!tokensPerSecond || tokensPerSecond === 0) return "0 tok/s";
	return `${tokensPerSecond.toFixed(1)} tok/s`;
}
