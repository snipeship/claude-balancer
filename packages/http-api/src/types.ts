import type { Database } from "bun:sqlite";
import type { Config } from "@ccflare/config";
import type { DatabaseOperations } from "@ccflare/database";

export interface APIContext {
	db: Database;
	config: Config;
	dbOps: DatabaseOperations;
}

export interface HealthResponse {
	status: string;
	accounts: number;
	timestamp: string;
	strategy: string;
}

export interface StatsResponse {
	totalRequests: number;
	successRate: number;
	activeAccounts: number;
	avgResponseTime: number;
	totalTokens: number;
	totalCostUsd: number;
	topModels: Array<{ model: string; count: number }>;
}

export interface AccountResponse {
	id: string;
	name: string;
	provider: string;
	requestCount: number;
	totalRequests: number;
	lastUsed: string | null;
	created: string;
	tier: number;
	paused: boolean;
	tokenStatus: "valid" | "expired";
	rateLimitStatus: string;
	rateLimitReset: string | null;
	rateLimitRemaining: number | null;
	sessionInfo: string;
}

export interface RequestResponse {
	id: string;
	timestamp: string;
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
	inputTokens?: number;
	cacheReadInputTokens?: number;
	cacheCreationInputTokens?: number;
	outputTokens?: number;
	costUsd?: number;
}

export interface ConfigResponse {
	lb_strategy: string;
	port: number;
	sessionDurationMs: number;
}

export interface StrategyUpdateRequest {
	strategy: string;
}

export interface TierUpdateRequest {
	tier: number;
}

export interface AccountDeleteRequest {
	confirm: string;
}

export interface TimePoint {
	ts: number; // period start (ms)
	requests: number;
	tokens: number;
	costUsd: number;
	successRate: number; // 0-100
	errorRate: number; // 0-100
	cacheHitRate: number; // 0-100
	avgResponseTime: number; // ms
}

export interface TokenBreakdown {
	inputTokens: number;
	cacheReadInputTokens: number;
	cacheCreationInputTokens: number;
	outputTokens: number;
}

export interface ModelPerformance {
	model: string;
	avgResponseTime: number;
	p95ResponseTime: number;
	errorRate: number;
}

export interface AnalyticsResponse {
	meta?: {
		range: string;
		bucket: string;
		cumulative?: boolean;
	};
	totals: {
		requests: number;
		successRate: number;
		activeAccounts: number;
		avgResponseTime: number;
		totalTokens: number;
		totalCostUsd: number;
	};
	timeSeries: TimePoint[];
	tokenBreakdown: TokenBreakdown;
	modelDistribution: Array<{ model: string; count: number }>;
	accountPerformance: Array<{
		name: string;
		requests: number;
		successRate: number;
	}>;
	costByModel: Array<{ model: string; costUsd: number; requests: number }>;
	modelPerformance: ModelPerformance[];
}
