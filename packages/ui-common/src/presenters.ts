import type {
	Account,
	AccountDisplay,
	AccountResponse,
	Request,
	RequestResponse,
	StatsResponse,
	StatsWithAccounts,
} from "@ccflare/types";
import {
	formatCost,
	formatDuration,
	formatPercentage,
	formatTimestamp,
	formatTokens,
} from "./formatters";

/**
 * Account presenter - formats account data for display
 */
export class AccountPresenter {
	constructor(private account: Account | AccountResponse | AccountDisplay) {}

	get tierDisplay(): string {
		let tier: number | undefined;
		if ("tier" in this.account) {
			tier = this.account.tier;
		} else if ("account_tier" in this.account) {
			tier = this.account.account_tier;
		}
		return `Tier ${tier || 1}`;
	}

	get tokenStatus(): "valid" | "expired" {
		if ("tokenStatus" in this.account) {
			return this.account.tokenStatus;
		}
		if ("access_token" in this.account) {
			return this.account.access_token ? "valid" : "expired";
		}
		return "expired";
	}

	get rateLimitStatus(): string {
		if ("rateLimitStatus" in this.account) {
			return this.account.rateLimitStatus;
		}

		if (
			"rate_limited_until" in this.account &&
			this.account.rate_limited_until
		) {
			const isRateLimited = this.account.rate_limited_until > Date.now();
			return isRateLimited
				? `Rate limited until ${formatTimestamp(this.account.rate_limited_until)}`
				: "OK";
		}
		return "OK";
	}

	get sessionInfo(): string {
		if ("sessionInfo" in this.account) {
			return this.account.sessionInfo;
		}

		if ("session_start" in this.account && this.account.session_start) {
			const count =
				"session_request_count" in this.account
					? this.account.session_request_count
					: 0;
			return `Session: ${count} requests`;
		}
		return "No active session";
	}

	get requestCount(): number {
		return "requestCount" in this.account
			? this.account.requestCount
			: this.account.request_count;
	}

	get totalRequests(): number {
		return "totalRequests" in this.account
			? this.account.totalRequests
			: this.account.total_requests;
	}

	get isPaused(): boolean {
		if ("paused" in this.account) {
			return this.account.paused;
		}
		return false;
	}

	get isRateLimited(): boolean {
		if ("rate_limited_until" in this.account) {
			return Boolean(
				this.account.rate_limited_until &&
					this.account.rate_limited_until > Date.now(),
			);
		}
		const status = this.rateLimitStatus.toLowerCase();
		return status !== "ok" && !status.startsWith("allowed");
	}
}

/**
 * Request presenter - formats request data for display
 */
export class RequestPresenter {
	constructor(private request: Request | RequestResponse) {}

	get statusDisplay(): string {
		const code = this.request.statusCode;
		if (!code) return "N/A";
		return code.toString();
	}

	get responseTimeDisplay(): string {
		const time = this.request.responseTimeMs;
		if (!time) return "N/A";
		return formatDuration(time);
	}

	get tokensDisplay(): string {
		return formatTokens(this.request.totalTokens);
	}

	get costDisplay(): string {
		return formatCost(this.request.costUsd);
	}

	get isSuccess(): boolean {
		return this.request.success;
	}

	get hasTokenUsage(): boolean {
		return Boolean(this.request.inputTokens || this.request.outputTokens);
	}
}

/**
 * Stats presenter - formats stats data for display
 */
export class StatsPresenter {
	constructor(private stats: StatsResponse | StatsWithAccounts) {}

	get successRateDisplay(): string {
		return formatPercentage(this.stats.successRate);
	}

	get avgResponseTimeDisplay(): string {
		return formatDuration(this.stats.avgResponseTime);
	}

	get totalTokensDisplay(): string {
		return formatTokens(this.stats.totalTokens);
	}

	get totalCostDisplay(): string {
		return formatCost(this.stats.totalCostUsd);
	}

	get topModel(): string | null {
		if (!this.stats.topModels || this.stats.topModels.length === 0) {
			return null;
		}
		return this.stats.topModels[0].model;
	}

	get hasAccounts(): boolean {
		return "accounts" in this.stats && this.stats.accounts.length > 0;
	}
}
