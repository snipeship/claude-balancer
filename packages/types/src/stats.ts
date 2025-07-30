// Stats types
export interface Stats {
	totalRequests: number;
	successRate: number;
	activeAccounts: number;
	avgResponseTime: number;
	totalTokens: number;
	totalCostUsd: number;
	topModels: Array<{ model: string; count: number }>;
	avgTokensPerSecond: number | null;
}

export interface StatsResponse {
	totalRequests: number;
	successRate: number;
	activeAccounts: number;
	avgResponseTime: number;
	totalTokens: number;
	totalCostUsd: number;
	topModels: Array<{ model: string; count: number }>;
	avgTokensPerSecond: number | null;
}

export interface StatsWithAccounts extends Stats {
	accounts: Array<{
		name: string;
		requestCount: number;
		successRate: number;
	}>;
	recentErrors: string[];
}

// Analytics types
export interface TimePoint {
	ts: number; // period start (ms)
	model?: string; // Optional model name for per-model time series
	requests: number;
	tokens: number;
	costUsd: number;
	successRate: number; // 0-100
	errorRate: number; // 0-100
	cacheHitRate: number; // 0-100
	avgResponseTime: number; // ms
	avgTokensPerSecond: number | null;
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
	avgTokensPerSecond: number | null;
	minTokensPerSecond: number | null;
	maxTokensPerSecond: number | null;
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
		avgTokensPerSecond: number | null;
	};
	timeSeries: TimePoint[];
	tokenBreakdown: TokenBreakdown;
	modelDistribution: Array<{ model: string; count: number }>;
	accountPerformance: Array<{
		name: string;
		requests: number;
		successRate: number;
	}>;
	costByModel: Array<{
		model: string;
		costUsd: number;
		requests: number;
		totalTokens?: number;
	}>;
	modelPerformance: ModelPerformance[];
}

// Health check response
export interface HealthResponse {
	status: string;
	accounts: number;
	timestamp: string;
	strategy: string;
}

// Config types
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
