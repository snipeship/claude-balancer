import type { AnalyticsResponse } from "@ccflare/http-api";

export interface Account {
	id: string;
	name: string;
	provider: string;
	requestCount: number;
	totalRequests: number;
	lastUsed: string | null;
	created: string;
	tier: number;
	paused: boolean;
	tokenStatus: string;
	rateLimitStatus: string;
	rateLimitReset: string | null;
	rateLimitRemaining: number | null;
	sessionInfo: string | null;
}

export interface Stats {
	totalRequests: number;
	successRate: number;
	activeAccounts: number;
	avgResponseTime: number;
	totalTokens: number;
	totalCostUsd: number;
	topModels: Array<{ model: string; count: number }>;
	accounts: Array<{
		name: string;
		requestCount: number;
		successRate: number;
	}>;
	recentErrors: string[];
}

export interface LogEntry {
	ts: number;
	level: string;
	msg: string;
}

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
	costUsd?: number;
	inputTokens?: number;
	cacheReadInputTokens?: number;
	cacheCreationInputTokens?: number;
	outputTokens?: number;
}

class API {
	private baseUrl = "";

	async getStats(): Promise<Stats> {
		const res = await fetch(`${this.baseUrl}/api/stats`);
		if (!res.ok) throw new Error("Failed to fetch stats");
		return res.json() as Promise<Stats>;
	}

	async getAccounts(): Promise<Account[]> {
		const res = await fetch(`${this.baseUrl}/api/accounts`);
		if (!res.ok) throw new Error("Failed to fetch accounts");
		return res.json() as Promise<Account[]>;
	}

	async initAddAccount(data: {
		name: string;
		mode: "max" | "console";
		tier: number;
	}): Promise<{ authUrl: string }> {
		const res = await fetch(`${this.baseUrl}/api/accounts`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ ...data, step: "init" }),
		});
		if (!res.ok) {
			const error = (await res.json()) as { error?: string };
			throw new Error(error.error || "Failed to initialize account");
		}
		return res.json() as Promise<{ authUrl: string }>;
	}

	async completeAddAccount(data: {
		name: string;
		code: string;
	}): Promise<{ message: string; mode: string; tier: number }> {
		const res = await fetch(`${this.baseUrl}/api/accounts`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ ...data, step: "callback" }),
		});
		if (!res.ok) {
			const error = (await res.json()) as { error?: string };
			throw new Error(error.error || "Failed to complete account setup");
		}
		return res.json() as Promise<{
			message: string;
			mode: string;
			tier: number;
		}>;
	}

	async removeAccount(name: string, confirm: string): Promise<void> {
		const res = await fetch(`${this.baseUrl}/api/accounts/${name}`, {
			method: "DELETE",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ confirm }),
		});
		if (!res.ok) {
			const error = (await res.json()) as {
				error?: string;
				confirmationRequired?: boolean;
			};
			throw new Error(error.error || "Failed to remove account");
		}
	}

	async resetStats(): Promise<void> {
		const res = await fetch(`${this.baseUrl}/api/stats/reset`, {
			method: "POST",
		});
		if (!res.ok) throw new Error("Failed to reset stats");
	}

	async getLogHistory(): Promise<LogEntry[]> {
		const res = await fetch(`${this.baseUrl}/api/logs/history`);
		if (!res.ok) throw new Error("Failed to fetch log history");
		return res.json() as Promise<LogEntry[]>;
	}

	streamLogs(onLog: (log: LogEntry) => void): EventSource {
		const eventSource = new EventSource(`${this.baseUrl}/api/logs/stream`);
		eventSource.addEventListener("message", (event) => {
			try {
				const data = JSON.parse(event.data);
				// Skip non-log messages (like the initial "connected" message)
				if (data.ts && data.level && data.msg) {
					onLog(data as LogEntry);
				}
			} catch (e) {
				console.error("Error parsing log event:", e);
			}
		});
		return eventSource;
	}

	async getRequestsDetail(limit = 100): Promise<RequestPayload[]> {
		const res = await fetch(
			`${this.baseUrl}/api/requests/detail?limit=${limit}`,
		);
		if (!res.ok) throw new Error("Failed to fetch detailed requests");
		return res.json() as Promise<RequestPayload[]>;
	}

	async getRequestsSummary(limit = 50): Promise<RequestSummary[]> {
		const res = await fetch(`${this.baseUrl}/api/requests?limit=${limit}`);
		if (!res.ok) throw new Error("Failed to fetch request summaries");
		return res.json() as Promise<RequestSummary[]>;
	}

	async getRequestPayload(requestId: string): Promise<RequestPayload> {
		const res = await fetch(`${this.baseUrl}/api/requests/payload/${requestId}`);
		if (!res.ok) throw new Error("Failed to fetch request payload");
		return res.json() as Promise<RequestPayload>;
	}

	async getAnalytics(
		range = "24h",
		filters?: {
			accounts?: string[];
			models?: string[];
			status?: "all" | "success" | "error";
		},
		mode: "normal" | "cumulative" = "normal",
	): Promise<AnalyticsResponse> {
		const params = new URLSearchParams({ range });

		if (filters?.accounts?.length) {
			params.append("accounts", filters.accounts.join(","));
		}
		if (filters?.models?.length) {
			params.append("models", filters.models.join(","));
		}
		if (filters?.status && filters.status !== "all") {
			params.append("status", filters.status);
		}
		if (mode === "cumulative") {
			params.append("mode", "cumulative");
		}

		const res = await fetch(`${this.baseUrl}/api/analytics?${params}`);
		if (!res.ok) throw new Error("Failed to fetch analytics data");
		return res.json() as Promise<AnalyticsResponse>;
	}

	async pauseAccount(accountId: string): Promise<void> {
		const res = await fetch(`${this.baseUrl}/api/accounts/${accountId}/pause`, {
			method: "POST",
		});
		if (!res.ok) {
			const error = (await res.json()) as { error?: string };
			throw new Error(error.error || "Failed to pause account");
		}
	}

	async resumeAccount(accountId: string): Promise<void> {
		const res = await fetch(
			`${this.baseUrl}/api/accounts/${accountId}/resume`,
			{
				method: "POST",
			},
		);
		if (!res.ok) {
			const error = (await res.json()) as { error?: string };
			throw new Error(error.error || "Failed to resume account");
		}
	}

	async getStrategy(): Promise<string> {
		const res = await fetch(`${this.baseUrl}/api/config/strategy`);
		if (!res.ok) throw new Error("Failed to fetch strategy");
		const data = (await res.json()) as { strategy: string };
		return data.strategy;
	}

	async listStrategies(): Promise<string[]> {
		const res = await fetch(`${this.baseUrl}/api/strategies`);
		if (!res.ok) throw new Error("Failed to list strategies");
		return res.json() as Promise<string[]>;
	}

	async setStrategy(strategy: string): Promise<void> {
		const res = await fetch(`${this.baseUrl}/api/config/strategy`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ strategy }),
		});
		if (!res.ok) {
			const error = (await res.json()) as { error?: string };
			throw new Error(error.error || "Failed to set strategy");
		}
	}
}

export const api = new API();
