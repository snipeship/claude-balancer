import type { RequestMeta, StrategyStore } from "@ccflare/types";

// Database row types that match the actual database schema
export type AccountRow = {
	id: string;
	name: string;
	provider: string | null;
	api_key: string | null;
	refresh_token: string;
	access_token: string | null;
	expires_at: number | null;
	created_at: number;
	last_used: number | null;
	request_count: number;
	total_requests: number;
	rate_limited_until?: number | null;
	session_start?: number | null;
	session_request_count?: number;
	account_tier: number;
	paused?: 0 | 1;
	rate_limit_reset?: number | null;
	rate_limit_status?: string | null;
	rate_limit_remaining?: number | null;
};

export type RequestRow = {
	id: string;
	timestamp: number;
	method: string;
	path: string;
	account_used: string | null;
	status_code: number | null;
	success: 0 | 1;
	error_message: string | null;
	response_time_ms: number | null;
	failover_attempts: number;
	model: string | null;
	prompt_tokens: number | null;
	completion_tokens: number | null;
	total_tokens: number | null;
	cost_usd: number | null;
	input_tokens: number | null;
	cache_read_input_tokens: number | null;
	cache_creation_input_tokens: number | null;
	output_tokens: number | null;
};

// Application-level types
export interface Account {
	id: string;
	name: string;
	provider: string;
	api_key: string | null;
	refresh_token: string;
	access_token: string | null;
	expires_at: number | null;
	request_count: number;
	total_requests: number;
	last_used: number | null;
	created_at: number;
	rate_limited_until: number | null;
	session_start: number | null;
	session_request_count: number;
	account_tier: number; // 1, 5, or 20
	paused: boolean;
	rate_limit_reset: number | null;
	rate_limit_status: string | null;
	rate_limit_remaining: number | null;
}

export interface Request {
	id: string;
	timestamp: number;
	method: string;
	path: string;
	accountUsed: string | null;
	statusCode: number | null;
	success: boolean;
	errorMessage: string | null;
	responseTimeMs: number | null;
	failoverAttempts: number;
	model?: string;
	promptTokens?: number;
	completionTokens?: number;
	totalTokens?: number;
	costUsd?: number;
	inputTokens?: number;
	cacheReadInputTokens?: number;
	cacheCreationInputTokens?: number;
	outputTokens?: number;
}

export interface LoadBalancingStrategy {
	/**
	 * Return a filtered & ordered list of candidate accounts.
	 * Accounts that are rate-limited should be filtered out.
	 * The first account in the list should be tried first.
	 */
	select(accounts: Account[], meta: RequestMeta): Account[];

	/**
	 * Optional initialization method to inject dependencies
	 * Used for strategies that need access to a StrategyStore
	 */
	initialize?(store: StrategyStore): void;
}

// Type mapper functions
export function toAccount(row: AccountRow): Account {
	return {
		id: row.id,
		name: row.name,
		provider: row.provider || "anthropic",
		api_key: row.api_key,
		refresh_token: row.refresh_token,
		access_token: row.access_token,
		expires_at: row.expires_at,
		created_at: row.created_at,
		last_used: row.last_used,
		request_count: row.request_count,
		total_requests: row.total_requests,
		rate_limited_until: row.rate_limited_until || null,
		session_start: row.session_start || null,
		session_request_count: row.session_request_count || 0,
		account_tier: row.account_tier || 1,
		paused: row.paused === 1,
		rate_limit_reset: row.rate_limit_reset || null,
		rate_limit_status: row.rate_limit_status || null,
		rate_limit_remaining: row.rate_limit_remaining || null,
	};
}

export function toRequest(row: RequestRow): Request {
	return {
		id: row.id,
		timestamp: row.timestamp,
		method: row.method,
		path: row.path,
		accountUsed: row.account_used,
		statusCode: row.status_code,
		success: row.success === 1,
		errorMessage: row.error_message,
		responseTimeMs: row.response_time_ms,
		failoverAttempts: row.failover_attempts,
		model: row.model || undefined,
		promptTokens: row.prompt_tokens || undefined,
		completionTokens: row.completion_tokens || undefined,
		totalTokens: row.total_tokens || undefined,
		costUsd: row.cost_usd || undefined,
		inputTokens: row.input_tokens || undefined,
		cacheReadInputTokens: row.cache_read_input_tokens || undefined,
		cacheCreationInputTokens: row.cache_creation_input_tokens || undefined,
		outputTokens: row.output_tokens || undefined,
	};
}

// Special account ID for requests without an account
export const NO_ACCOUNT_ID = "no_account";

// Re-export from types package for backwards compatibility
export type { LogEvent, RequestMeta } from "@ccflare/types";
