import type { Account } from "@ccflare/types";
import type { Provider, RateLimitInfo, TokenRefreshResult } from "./types";

export abstract class BaseProvider implements Provider {
	abstract name: string;

	/**
	 * Check if this provider can handle the given request path
	 * Default implementation: handle all paths
	 */
	canHandle(_path: string): boolean {
		return true;
	}

	/**
	 * Refresh the access token for an account
	 * Must be implemented by each provider
	 */
	abstract refreshToken(
		account: Account,
		clientId: string,
	): Promise<TokenRefreshResult>;

	/**
	 * Build the target URL for the provider
	 * Must be implemented by each provider
	 */
	abstract buildUrl(path: string, query: string): string;

	/**
	 * Prepare headers for the provider request
	 * Default implementation: Add Bearer token (if provided) and remove host header
	 */
	prepareHeaders(headers: Headers, accessToken?: string): Headers {
		const newHeaders = new Headers(headers);
		if (accessToken) {
			newHeaders.set("Authorization", `Bearer ${accessToken}`);
		}
		newHeaders.delete("host");
		return newHeaders;
	}

	/**
	 * Parse rate limit information from response
	 * Default implementation: Check unified headers first, then fall back to 429 status
	 *
	 * Note: The default implementation considers any unified status other than "allowed"
	 * to be a hard rate limit. Providers should override this method if they need to
	 * distinguish between soft warnings (e.g., "allowed_warning") and hard limits.
	 */
	parseRateLimit(response: Response): RateLimitInfo {
		// Check for unified rate limit headers (used by Anthropic and others)
		const statusHeader = response.headers.get(
			"anthropic-ratelimit-unified-status",
		);
		const resetHeader = response.headers.get(
			"anthropic-ratelimit-unified-reset",
		);

		if (statusHeader || resetHeader) {
			const resetTime = resetHeader ? Number(resetHeader) * 1000 : undefined; // Convert to ms
			return {
				isRateLimited: statusHeader !== "allowed",
				resetTime,
				statusHeader: statusHeader || undefined,
			};
		}

		// Fall back to traditional 429 check
		if (response.status !== 429) {
			return { isRateLimited: false };
		}

		// Try to extract reset time from headers
		const retryAfter = response.headers.get("retry-after");
		let resetTime: number | undefined;

		if (retryAfter) {
			// Retry-After can be seconds or HTTP date
			const seconds = Number(retryAfter);
			if (!Number.isNaN(seconds)) {
				resetTime = Date.now() + seconds * 1000;
			} else {
				resetTime = new Date(retryAfter).getTime();
			}
		}

		return { isRateLimited: true, resetTime };
	}

	/**
	 * Process the response before returning to client
	 * Default implementation: Return response as-is
	 */
	async processResponse(
		response: Response,
		_account: Account | null,
	): Promise<Response> {
		return response;
	}

	/**
	 * Extract tier information from response if available
	 * Default implementation: Return null (no tier info)
	 */
	async extractTierInfo?(_response: Response): Promise<number | null> {
		return null;
	}

	/**
	 * Extract usage information from response if available
	 * Default implementation: Return null (no usage info)
	 */
	async extractUsageInfo?(_response: Response): Promise<{
		model?: string;
		promptTokens?: number;
		completionTokens?: number;
		totalTokens?: number;
		costUsd?: number;
	} | null> {
		return null;
	}

	/**
	 * Check if the response is a streaming response
	 * Default implementation: Check for text/event-stream or stream in content-type
	 */
	isStreamingResponse?(response: Response): boolean {
		const contentType = response.headers.get("content-type") ?? "";
		return (
			contentType.includes("text/event-stream") ||
			contentType.includes("stream")
		);
	}
}
