import { BUFFER_SIZES } from "@ccflare/core";
import { sanitizeProxyHeaders } from "@ccflare/http-common";
import { Logger } from "@ccflare/logger";
import type { Account } from "@ccflare/types";
import { BaseProvider } from "../../base";
import type { RateLimitInfo, TokenRefreshResult } from "../../types";

// Hard rate limit statuses that should block account usage
const HARD_LIMIT_STATUSES = new Set([
	"rate_limited",
	"blocked",
	"queueing_hard",
	"payment_required",
]);

// Soft warning statuses that should not block account usage
const _SOFT_WARNING_STATUSES = new Set(["allowed_warning", "queueing_soft"]);

const log = new Logger("AnthropicProvider");

export class AnthropicProvider extends BaseProvider {
	name = "anthropic";

	canHandle(_path: string): boolean {
		// Handle all paths for now since this is Anthropic-specific
		return true;
	}

	async refreshToken(
		account: Account,
		clientId: string,
	): Promise<TokenRefreshResult> {
		if (!account.refresh_token) {
			throw new Error(`No refresh token available for account ${account.name}`);
		}

		log.info(
			`Refreshing token for account ${account.name} with client ID: ${clientId}`,
		);

		const response = await fetch(
			"https://console.anthropic.com/v1/oauth/token",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					grant_type: "refresh_token",
					refresh_token: account.refresh_token,
					client_id: clientId,
				}),
			},
		);

		if (!response.ok) {
			let errorMessage = response.statusText;
			let errorData: unknown = null;
			try {
				errorData = await response.json();
				const errorObj = errorData as { error?: string; message?: string };
				errorMessage = errorObj.error || errorObj.message || errorMessage;
			} catch {
				// If we can't parse the error response, use the status text
			}
			log.error(
				`Token refresh failed for ${account.name}: Status ${response.status}, Error: ${errorMessage}`,
				errorData,
			);
			throw new Error(
				`Failed to refresh token for account ${account.name}: ${errorMessage}`,
			);
		}

		const json = (await response.json()) as {
			access_token: string;
			expires_in: number;
			refresh_token?: string;
		};

		log.info(
			`Token refresh successful for ${account.name}, new refresh token: ${json.refresh_token ? "provided" : "not provided"}`,
		);

		return {
			accessToken: json.access_token,
			expiresAt: Date.now() + json.expires_in * 1000,
			refreshToken: json.refresh_token,
		};
	}

	buildUrl(path: string, query: string): string {
		return `https://api.anthropic.com${path}${query}`;
	}

	prepareHeaders(headers: Headers, accessToken?: string): Headers {
		const newHeaders = super.prepareHeaders(headers, accessToken);
		// Remove compression headers to avoid decompression issues
		newHeaders.delete("accept-encoding");
		newHeaders.delete("content-encoding");
		return newHeaders;
	}

	parseRateLimit(response: Response): RateLimitInfo {
		// Check for unified rate limit headers
		const statusHeader = response.headers.get(
			"anthropic-ratelimit-unified-status",
		);
		const resetHeader = response.headers.get(
			"anthropic-ratelimit-unified-reset",
		);
		const remainingHeader = response.headers.get(
			"anthropic-ratelimit-unified-remaining",
		);

		if (statusHeader || resetHeader) {
			const resetTime = resetHeader ? Number(resetHeader) * 1000 : undefined; // Convert to ms
			const remaining = remainingHeader ? Number(remainingHeader) : undefined;

			// Only mark as rate limited for hard limit statuses or 429
			const isRateLimited =
				HARD_LIMIT_STATUSES.has(statusHeader || "") || response.status === 429;

			return {
				isRateLimited,
				resetTime,
				statusHeader: statusHeader || undefined,
				remaining,
			};
		}

		// Fall back to 429 status with x-ratelimit-reset header
		if (response.status !== 429) {
			return { isRateLimited: false };
		}

		const rateLimitReset = response.headers.get("x-ratelimit-reset");
		const resetTime = rateLimitReset
			? parseInt(rateLimitReset) * 1000
			: Date.now() + 60000; // Default to 1 minute

		return {
			isRateLimited: true,
			resetTime,
		};
	}

	async processResponse(
		response: Response,
		_account: Account | null,
	): Promise<Response> {
		// Sanitize headers by removing hop-by-hop headers
		const headers = sanitizeProxyHeaders(response.headers);

		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers,
		});
	}

	async extractTierInfo(response: Response): Promise<number | null> {
		try {
			const clone = response.clone();
			const json = (await clone.json()) as {
				type?: string;
				usage?: {
					rate_limit_tokens?: number;
				};
			};

			// Check for tier information in response
			if (json.type === "message" && json.usage?.rate_limit_tokens) {
				const rateLimit = json.usage.rate_limit_tokens;
				if (rateLimit >= 800000) return 20;
				if (rateLimit >= 200000) return 5;
				return 1;
			}
		} catch {
			// Ignore JSON parsing errors
		}

		return null;
	}

	async extractUsageInfo(response: Response): Promise<{
		model?: string;
		promptTokens?: number;
		completionTokens?: number;
		totalTokens?: number;
		costUsd?: number;
		inputTokens?: number;
		cacheReadInputTokens?: number;
		cacheCreationInputTokens?: number;
		outputTokens?: number;
	} | null> {
		try {
			const clone = response.clone();
			const contentType = response.headers.get("content-type");

			// Handle streaming responses (SSE)
			if (contentType?.includes("text/event-stream")) {
				// Use bounded reader to avoid consuming entire stream
				const reader = clone.body?.getReader();
				if (!reader) return null;

				let buffered = "";
				const maxBytes = BUFFER_SIZES.ANTHROPIC_STREAM_CAP_BYTES;
				const decoder = new TextDecoder();
				let foundMessageStart = false;

				try {
					while (buffered.length < maxBytes) {
						const { value, done } = await reader.read();
						if (done) break;

						buffered += decoder.decode(value, { stream: true });

						// Check if we have the message_start event
						if (buffered.includes("event: message_start")) {
							foundMessageStart = true;
							// Read a bit more to ensure we get the data line
							const { value: nextValue, done: nextDone } = await reader.read();
							if (!nextDone && nextValue) {
								buffered += decoder.decode(nextValue, { stream: true });
							}
							break;
						}
					}
				} finally {
					// Cancel the reader to prevent hanging
					reader.cancel().catch(() => {});
				}

				if (!foundMessageStart) return null;

				// Parse the buffered content
				const lines = buffered.split("\n");

				// Parse SSE events
				for (let i = 0; i < lines.length; i++) {
					const line = lines[i];
					if (line.startsWith("event: message_start")) {
						// Next line should be the data
						const dataLine = lines[i + 1];
						if (dataLine?.startsWith("data: ")) {
							try {
								const jsonStr = dataLine.slice(6); // Remove "data: " prefix
								const data = JSON.parse(jsonStr) as {
									message?: {
										model?: string;
										usage?: {
											input_tokens?: number;
											output_tokens?: number;
											cache_creation_input_tokens?: number;
											cache_read_input_tokens?: number;
										};
									};
								};

								if (data.message?.usage) {
									const usage = data.message.usage;
									const inputTokens = usage.input_tokens || 0;
									const cacheCreationInputTokens =
										usage.cache_creation_input_tokens || 0;
									const cacheReadInputTokens =
										usage.cache_read_input_tokens || 0;
									const outputTokens = usage.output_tokens || 0;
									const promptTokens =
										inputTokens +
										cacheCreationInputTokens +
										cacheReadInputTokens;
									const completionTokens = outputTokens;
									const totalTokens = promptTokens + completionTokens;

									// Extract cost from header if available
									const costHeader = response.headers.get(
										"anthropic-billing-cost",
									);
									const costUsd = costHeader
										? parseFloat(costHeader)
										: undefined;

									return {
										model: data.message.model,
										promptTokens,
										completionTokens,
										totalTokens,
										costUsd,
										inputTokens,
										cacheReadInputTokens,
										cacheCreationInputTokens,
										outputTokens,
									};
								}
							} catch {
								// Ignore parse errors
							}
						}
					}
				}

				// For streaming responses, we only extract initial usage
				// Output tokens will be accumulated during streaming but we can't capture that here
				return null;
			} else {
				// Handle non-streaming JSON responses
				const json = (await clone.json()) as {
					model?: string;
					usage?: {
						input_tokens?: number;
						output_tokens?: number;
						cache_creation_input_tokens?: number;
						cache_read_input_tokens?: number;
					};
				};

				if (!json.usage) return null;

				const inputTokens = json.usage.input_tokens || 0;
				const cacheCreationInputTokens =
					json.usage.cache_creation_input_tokens || 0;
				const cacheReadInputTokens = json.usage.cache_read_input_tokens || 0;
				const outputTokens = json.usage.output_tokens || 0;
				const promptTokens =
					inputTokens + cacheCreationInputTokens + cacheReadInputTokens;
				const completionTokens = outputTokens;
				const totalTokens = promptTokens + completionTokens;

				// Extract cost from header if available
				const costHeader = response.headers.get("anthropic-billing-cost");
				const costUsd = costHeader ? parseFloat(costHeader) : undefined;

				return {
					model: json.model,
					promptTokens,
					completionTokens,
					totalTokens,
					costUsd,
					inputTokens,
					cacheReadInputTokens,
					cacheCreationInputTokens,
					outputTokens,
				};
			}
		} catch {
			// Ignore parsing errors
			return null;
		}
	}

	/**
	 * Check if this provider supports OAuth
	 */
	supportsOAuth(): boolean {
		return true;
	}

	/**
	 * Get the OAuth provider for this provider
	 */
	getOAuthProvider() {
		// Lazy load to avoid circular dependencies
		const { AnthropicOAuthProvider } = require("./oauth.js");
		return new AnthropicOAuthProvider();
	}
}
