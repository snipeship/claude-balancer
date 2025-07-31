import { requestEvents, ServiceUnavailableError } from "@ccflare/core";
import { Logger } from "@ccflare/logger";
import {
	createRequestMetadata,
	ERROR_MESSAGES,
	interceptAndModifyRequest,
	type ProxyContext,
	prepareRequestBody,
	proxyUnauthenticated,
	proxyWithAccount,
	selectAccountsForRequest,
	TIMING,
	validateProviderPath,
} from "./handlers";
import type { ControlMessage, OutgoingWorkerMessage } from "./worker-messages";

export type { ProxyContext } from "./handlers";

const log = new Logger("Proxy");

// ===== WORKER MANAGEMENT =====

// Create usage worker instance
let usageWorkerInstance: Worker | null = null;

/**
 * Gets or creates the usage worker instance
 * @returns The usage worker instance
 */
export function getUsageWorker(): Worker {
	if (!usageWorkerInstance) {
		usageWorkerInstance = new Worker(
			new URL("./post-processor.worker.ts", import.meta.url).href,
			{ smol: true },
		);
		// Bun extends Worker with unref method
		if (
			"unref" in usageWorkerInstance &&
			typeof usageWorkerInstance.unref === "function"
		) {
			usageWorkerInstance.unref(); // Don't keep process alive
		}

		// Listen for summary messages from worker
		usageWorkerInstance.onmessage = (ev) => {
			const data = ev.data as OutgoingWorkerMessage;
			if (data.type === "summary") {
				requestEvents.emit("event", { type: "summary", payload: data.summary });
			}
		};
	}
	return usageWorkerInstance;
}

/**
 * Gracefully terminates the usage worker
 */
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
		}, TIMING.WORKER_SHUTDOWN_DELAY);
	}
}

// ===== MAIN HANDLER =====

/**
 * Main proxy handler - orchestrates the entire proxy flow
 *
 * This function coordinates the proxy process by:
 * 1. Creating request metadata for tracking
 * 2. Validating the provider can handle the path
 * 3. Preparing the request body for reuse
 * 4. Selecting accounts based on load balancing strategy
 * 5. Attempting to proxy with each account in order
 * 6. Falling back to unauthenticated proxy if no accounts available
 *
 * @param req - The incoming request
 * @param url - The parsed URL
 * @param ctx - The proxy context containing strategy, database, and provider
 * @returns Promise resolving to the proxied response
 * @throws {ValidationError} If the provider cannot handle the path
 * @throws {ServiceUnavailableError} If all accounts fail to proxy the request
 * @throws {ProviderError} If unauthenticated proxy fails
 */
export async function handleProxy(
	req: Request,
	url: URL,
	ctx: ProxyContext,
): Promise<Response> {
	// 1. Validate provider can handle path
	validateProviderPath(ctx.provider, url.pathname);

	// 2. Prepare request body
	const { buffer: requestBodyBuffer } = await prepareRequestBody(req);

	// 3. Intercept and modify request for agent model preferences
	const { modifiedBody, agentUsed, originalModel, appliedModel } =
		await interceptAndModifyRequest(requestBodyBuffer, ctx.dbOps);

	// Use modified body if available
	const finalBodyBuffer = modifiedBody || requestBodyBuffer;
	const finalCreateBodyStream = () => {
		if (!finalBodyBuffer) return undefined;
		return new Response(finalBodyBuffer).body ?? undefined;
	};

	if (agentUsed && originalModel !== appliedModel) {
		log.info(
			`Agent ${agentUsed} detected, model changed from ${originalModel} to ${appliedModel}`,
		);
	}

	// 4. Create request metadata with agent info
	const requestMeta = createRequestMetadata(req, url);
	requestMeta.agentUsed = agentUsed;

	// 5. Select accounts
	const accounts = selectAccountsForRequest(requestMeta, ctx);

	// 6. Handle no accounts case
	if (accounts.length === 0) {
		return proxyUnauthenticated(
			req,
			url,
			requestMeta,
			finalBodyBuffer,
			finalCreateBodyStream,
			ctx,
		);
	}

	// 7. Log selected accounts
	log.info(
		`Selected ${accounts.length} accounts: ${accounts.map((a) => a.name).join(", ")}`,
	);
	log.info(`Request: ${req.method} ${url.pathname}`);

	// 8. Try each account
	for (let i = 0; i < accounts.length; i++) {
		const response = await proxyWithAccount(
			req,
			url,
			accounts[i],
			requestMeta,
			finalBodyBuffer,
			finalCreateBodyStream,
			i,
			ctx,
		);

		if (response) {
			return response;
		}
	}

	// 9. All accounts failed
	throw new ServiceUnavailableError(
		`${ERROR_MESSAGES.ALL_ACCOUNTS_FAILED} (${accounts.length} attempted)`,
		ctx.provider.name,
	);
}
