import type { Account } from "@ccflare/core";
import type { ProxyContext } from "./proxy";
import type { ChunkMessage, EndMessage, StartMessage } from "./worker-messages";

export interface ResponseHandlerOptions {
	requestId: string;
	method: string;
	path: string;
	account: Account | null;
	requestHeaders: Headers;
	requestBody: ArrayBuffer | null;
	response: Response;
	timestamp: number;
	retryAttempt: number;
	failoverAttempts: number;
}

/**
 * Unified response handler that immediately streams responses
 * while forwarding data to worker for async processing
 */
// Forward response to client while streaming analytics to worker
export async function forwardToClient(
	options: ResponseHandlerOptions,
	ctx: ProxyContext,
): Promise<Response> {
	const {
		requestId,
		method,
		path,
		account,
		requestHeaders,
		requestBody,
		response,
		timestamp,
		retryAttempt, // Always 0 in new flow, but kept for message compatibility
		failoverAttempts,
	} = options;

	// Prepare objects once for serialisation
	const requestHeadersObj = Object.fromEntries(requestHeaders.entries());
	const responseHeadersObj = Object.fromEntries(response.headers.entries());

	const isStream = ctx.provider.isStreamingResponse?.(response) ?? false;

	// Send START message immediately
	const startMessage: StartMessage = {
		type: "start",
		requestId,
		accountId: account?.id || null,
		method,
		path,
		timestamp,
		requestHeaders: requestHeadersObj,
		requestBody: requestBody
			? Buffer.from(requestBody).toString("base64")
			: null,
		responseStatus: response.status,
		responseHeaders: responseHeadersObj,
		isStream,
		providerName: ctx.provider.name,
		retryAttempt,
		failoverAttempts,
	};
	ctx.usageWorker.postMessage(startMessage);

	/*********************************************************************
	 *  STREAMING RESPONSES — tee with Response.clone() and send chunks
	 *********************************************************************/
	if (isStream && response.body) {
		// Clone response once for background consumption.
		const analyticsClone = response.clone();

		(async () => {
			try {
				const reader = analyticsClone.body?.getReader();
				if (!reader) return; // Safety check
				// eslint-disable-next-line no-constant-condition
				while (true) {
					const { value, done } = await reader.read();
					if (done) break;
					if (value) {
						const chunkMsg: ChunkMessage = {
							type: "chunk",
							requestId,
							data: value,
						};
						ctx.usageWorker.postMessage(chunkMsg);
					}
				}
				// Finished without errors
				const endMsg: EndMessage = {
					type: "end",
					requestId,
					success: analyticsClone.ok,
				};
				ctx.usageWorker.postMessage(endMsg);
			} catch (err) {
				const endMsg: EndMessage = {
					type: "end",
					requestId,
					success: false,
					error: (err as Error).message,
				};
				ctx.usageWorker.postMessage(endMsg);
			}
		})();

		// Return the ORIGINAL response untouched
		return response;
	}

	/*********************************************************************
	 *  NON-STREAMING RESPONSES — read body in background, send END once
	 *********************************************************************/
	(async () => {
		try {
			const clone = response.clone();
			const bodyBuf = await clone.arrayBuffer();
			const endMsg: EndMessage = {
				type: "end",
				requestId,
				responseBody:
					bodyBuf.byteLength > 0
						? Buffer.from(bodyBuf).toString("base64")
						: null,
				success: clone.ok,
			};
			ctx.usageWorker.postMessage(endMsg);
		} catch (err) {
			const endMsg: EndMessage = {
				type: "end",
				requestId,
				success: false,
				error: (err as Error).message,
			};
			ctx.usageWorker.postMessage(endMsg);
		}
	})();

	// Immediately return original response (no header/body changes)
	return response;
}
