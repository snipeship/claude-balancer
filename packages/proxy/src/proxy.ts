import crypto from "node:crypto";
import type { RuntimeConfig } from "@ccflare/config";
import type {
	Account,
	LoadBalancingStrategy,
	RequestMeta,
} from "@ccflare/core";
import type { AsyncDbWriter, DatabaseOperations } from "@ccflare/database";
import { Logger } from "@ccflare/logger";
import type { Provider, TokenRefreshResult } from "@ccflare/providers";
import { forwardToClient } from "./response-handler";
import type { ControlMessage } from "./worker-messages";

export interface ProxyContext {
	strategy: LoadBalancingStrategy;
	dbOps: DatabaseOperations;
	runtime: RuntimeConfig;
	provider: Provider;
	refreshInFlight: Map<string, Promise<string>>;
	asyncWriter: AsyncDbWriter;
	usageWorker: Worker;
}

const log = new Logger("Proxy");

// Create usage worker instance
let usageWorkerInstance: Worker | null = null;

export function getUsageWorker(): Worker {
	if (!usageWorkerInstance) {
		usageWorkerInstance = new Worker(
			new URL("./post-processor.worker.ts", import.meta.url).href,
			{ smol: true },
		);
		// @ts-ignore - Bun extends Worker with unref
		usageWorkerInstance.unref(); // Don't keep process alive
	}
	return usageWorkerInstance;
}

export function terminateUsageWorker(): void {
	if (usageWorkerInstance) {
		// Send shutdown message to allow worker to flush
		const shutdownMsg: ControlMessage = { type: "shutdown" };
		usageWorkerInstance.postMessage(shutdownMsg);
		// Give worker time to flush before terminating
		setTimeout(() => {
			if (usageWorkerInstance) {
				usageWorkerInstance.terminate();
				usageWorkerInstance = null;
			}
		}, 100);
	}
}

async function refreshAccessTokenSafe(
	account: Account,
	ctx: ProxyContext,
): Promise<string> {
	// Check if a refresh is already in progress for this account
	if (!ctx.refreshInFlight.has(account.id)) {
		// Create a new refresh promise and store it
		const refreshPromise = ctx.provider
			.refreshToken(account, ctx.runtime.clientId)
			.then((result: TokenRefreshResult) => {
				ctx.asyncWriter.enqueue(() =>
					ctx.dbOps.updateAccountTokens(
						account.id,
						result.accessToken,
						result.expiresAt,
						result.refreshToken,
					),
				);
				return result.accessToken;
			})
			.finally(() => {
				// Clean up the map when done (success or failure)
				ctx.refreshInFlight.delete(account.id);
			});
		ctx.refreshInFlight.set(account.id, refreshPromise);
	}

	// Return the existing or new refresh promise
	const promise = ctx.refreshInFlight.get(account.id);
	if (!promise) {
		throw new Error(`Refresh promise not found for account ${account.id}`);
	}
	return promise;
}

async function getValidAccessToken(
	account: Account,
	ctx: ProxyContext,
): Promise<string> {
	if (
		account.access_token &&
		account.expires_at &&
		account.expires_at > Date.now()
	) {
		return account.access_token;
	}
	log.info(`Token expired or missing for account: ${account.name}`);
	return await refreshAccessTokenSafe(account, ctx);
}

function getOrderedAccounts(meta: RequestMeta, ctx: ProxyContext): Account[] {
	const allAccounts = ctx.dbOps.getAllAccounts();
	// Filter accounts by provider
	const providerAccounts = allAccounts.filter(
		(account) =>
			account.provider === ctx.provider.name || account.provider === null,
	);
	return ctx.strategy.select(providerAccounts, meta);
}

export async function handleProxy(
	req: Request,
	url: URL,
	ctx: ProxyContext,
): Promise<Response> {
	const requestMeta: RequestMeta = {
		id: crypto.randomUUID(),
		method: req.method,
		path: url.pathname,
		timestamp: Date.now(),
	};

	// Check if provider can handle this request
	if (!ctx.provider.canHandle(url.pathname)) {
		return new Response(
			JSON.stringify({ error: "Provider cannot handle this request path" }),
			{
				status: 400,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	// Capture request body for analytics while preserving streaming
	let requestBodyBuffer: ArrayBuffer | null = null;

	if (req.body) {
		// Read the entire body into a buffer for storage
		requestBodyBuffer = await req.arrayBuffer();
	}

	// Helper to create a fresh body stream for each fetch attempt
	const createBodyStream = () => {
		if (!requestBodyBuffer) return undefined;
		return new Response(requestBodyBuffer).body ?? undefined;
	};

	const accounts = getOrderedAccounts(requestMeta, ctx);
	const fallbackUnauthenticated = accounts.length === 0;

	if (fallbackUnauthenticated) {
		log.warn(
			"No active accounts available - forwarding request without authentication",
		);
	} else {
		log.info(
			`Selected ${accounts.length} accounts for request: ${accounts.map((a) => a.name).join(", ")}`,
		);
		log.info(`Request: ${req.method} ${url.pathname}`);
	}

	// Handle unauthenticated fallback
	if (fallbackUnauthenticated) {
		const targetUrl = ctx.provider.buildUrl(url.pathname, url.search);
		const headers = ctx.provider.prepareHeaders(req.headers); // No access token

		try {
			const response = await fetch(targetUrl, {
				method: req.method,
				headers: headers,
				body: createBodyStream(),
				// @ts-ignore - Bun supports duplex
				duplex: "half",
			});

			// Use unified response handler
			return forwardToClient(
				{
					requestId: requestMeta.id,
					method: req.method,
					path: url.pathname,
					account: null,
					requestHeaders: req.headers,
					requestBody: requestBodyBuffer,
					response,
					timestamp: requestMeta.timestamp,
					retryAttempt: 0,
					failoverAttempts: 0,
				},
				ctx,
			);
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			log.error("Error forwarding unauthenticated request:", error);

			// Return error response
			return new Response(JSON.stringify({ error: errorMessage }), {
				status: 502,
				headers: { "Content-Type": "application/json" },
			});
		}
	}

	// Try each account in order
	for (const account of accounts) {
		try {
			log.info(`Attempting request with account: ${account.name}`);

			const accessToken = await getValidAccessToken(account, ctx);
			const headers = ctx.provider.prepareHeaders(req.headers, accessToken);
			const targetUrl = ctx.provider.buildUrl(url.pathname, url.search);

			const response = await fetch(targetUrl, {
				method: req.method,
				headers,
				body: createBodyStream(),
				// @ts-ignore - Bun supports duplex
				duplex: "half",
			});

			const isStream = ctx.provider.isStreamingResponse?.(response) ?? false;

			// Parse rate-limit information
			const rateLimitInfo = ctx.provider.parseRateLimit(response);

			// Hard rate-limit ⇒ mark account + try next one
			if (!isStream && rateLimitInfo.isRateLimited && rateLimitInfo.resetTime) {
				log.warn(
					`Account ${account.name} rate-limited until ${new Date(
						rateLimitInfo.resetTime,
					).toISOString()}`,
				);
				const resetTime = rateLimitInfo.resetTime; // Capture for closure
				ctx.asyncWriter.enqueue(() =>
					ctx.dbOps.markAccountRateLimited(account.id, resetTime),
				);
				continue; // try next account
			}

			// Update basic account metadata (non-blocking)
			ctx.asyncWriter.enqueue(() => ctx.dbOps.updateAccountUsage(account.id));

			// Extract tier info if provider supports it (background)
			if (ctx.provider.extractTierInfo) {
				const extractTierInfo = ctx.provider.extractTierInfo.bind(ctx.provider);
				(async () => {
					const tier = await extractTierInfo(response.clone() as Response);
					if (tier && tier !== account.account_tier) {
						log.info(
							`Updating account ${account.name} tier from ${account.account_tier} to ${tier}`,
						);
						ctx.asyncWriter.enqueue(() =>
							ctx.dbOps.updateAccountTier(account.id, tier),
						);
					}
				})();
			}

			// Pass straight through to client with background analytics
			return forwardToClient(
				{
					requestId: requestMeta.id,
					method: req.method,
					path: url.pathname,
					account,
					requestHeaders: req.headers,
					requestBody: requestBodyBuffer,
					response,
					timestamp: requestMeta.timestamp,
					retryAttempt: 0, // No retry loop anymore
					failoverAttempts: accounts.indexOf(account),
				},
				ctx,
			);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			log.error(`Error with account ${account.name}: ${msg}`);
		}
	}

	// All accounts failed
	return new Response(
		JSON.stringify({
			error: "All accounts failed to proxy the request",
			attempts: accounts.length,
		}),
		{
			status: 503,
			headers: { "Content-Type": "application/json" },
		},
	);
}
