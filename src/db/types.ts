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
};

// Type mapper functions
import type { Account } from "../strategy";

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
	};
}

export function toRequest(row: RequestRow) {
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
	};
}
