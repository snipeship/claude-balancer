declare var self: Worker;

import { estimateCostUSD, NO_ACCOUNT_ID } from "@ccflare/core";
import { AsyncDbWriter, DatabaseOperations } from "@ccflare/database";
import { Logger } from "@ccflare/logger";
import { combineChunks } from "./stream-tee";
import type {
	ChunkMessage,
	EndMessage,
	StartMessage,
	WorkerMessage,
} from "./worker-messages";

interface RequestState {
	startMessage: StartMessage;
	buffer: string;
	chunks: Uint8Array[];
	usage: {
		model?: string;
		inputTokens?: number;
		cacheReadInputTokens?: number;
		cacheCreationInputTokens?: number;
		outputTokens?: number;
		totalTokens?: number;
		costUsd?: number;
	};
	lastActivity: number;
}

const log = new Logger("PostProcessor");
const requests = new Map<string, RequestState>();

// Initialize database connection for worker
const dbOps = new DatabaseOperations();
const asyncWriter = new AsyncDbWriter();

// Environment variables
const MAX_BUFFER_SIZE =
	Number(process.env.CF_STREAM_USAGE_BUFFER_KB || 64) * 1024;
const TIMEOUT_MS = Number(process.env.CF_STREAM_TIMEOUT_MS || 1000 * 60 * 1); // 1 minute default

// Parse SSE lines to extract usage (reuse existing logic)
function parseSSELine(line: string): { event?: string; data?: string } {
	if (line.startsWith("event: ")) {
		return { event: line.slice(7).trim() };
	}
	if (line.startsWith("data: ")) {
		return { data: line.slice(6).trim() };
	}
	return {};
}

function extractUsageFromData(data: string, state: RequestState): void {
	try {
		const parsed = JSON.parse(data);

		// Handle message_start
		if (parsed.type === "message_start" && parsed.message?.usage) {
			const usage = parsed.message.usage;
			state.usage.inputTokens = usage.input_tokens || 0;
			state.usage.cacheReadInputTokens = usage.cache_read_input_tokens || 0;
			state.usage.cacheCreationInputTokens =
				usage.cache_creation_input_tokens || 0;
			state.usage.outputTokens = usage.output_tokens || 0;
			if (parsed.message?.model) {
				state.usage.model = parsed.message.model;
			}
		}

		// Handle message_delta
		if (parsed.type === "message_delta" && parsed.usage) {
			state.usage.outputTokens =
				parsed.usage.output_tokens || state.usage.outputTokens || 0;
		}

		// Handle any usage field in the data
		if (parsed.usage) {
			if (parsed.usage.input_tokens !== undefined) {
				state.usage.inputTokens = parsed.usage.input_tokens;
			}
			if (parsed.usage.output_tokens !== undefined) {
				state.usage.outputTokens = parsed.usage.output_tokens;
			}
			if (parsed.usage.cache_read_input_tokens !== undefined) {
				state.usage.cacheReadInputTokens = parsed.usage.cache_read_input_tokens;
			}
			if (parsed.usage.cache_creation_input_tokens !== undefined) {
				state.usage.cacheCreationInputTokens =
					parsed.usage.cache_creation_input_tokens;
			}
		}
	} catch {
		// Silent fail for non-JSON lines
	}
}

function processStreamChunk(chunk: Uint8Array, state: RequestState): void {
	const text = new TextDecoder().decode(chunk);
	state.buffer += text;
	state.lastActivity = Date.now();

	// Limit buffer size
	if (state.buffer.length > MAX_BUFFER_SIZE) {
		state.buffer = state.buffer.slice(-MAX_BUFFER_SIZE);
	}

	// Process complete lines
	const lines = state.buffer.split("\n");
	state.buffer = lines.pop() || "";

	let currentEvent = "";
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		const parsed = parseSSELine(trimmed);
		if (parsed.event) {
			currentEvent = parsed.event;
		} else if (parsed.data && currentEvent) {
			extractUsageFromData(parsed.data, state);
		}
	}
}

async function handleStart(msg: StartMessage): Promise<void> {
	// Create request state
	const state: RequestState = {
		startMessage: msg,
		buffer: "",
		chunks: [],
		usage: {},
		lastActivity: Date.now(),
	};
	requests.set(msg.requestId, state);

	// Save minimal request info immediately
	asyncWriter.enqueue(() =>
		dbOps.saveRequestMeta(
			msg.requestId,
			msg.method,
			msg.path,
			msg.accountId,
			msg.responseStatus,
			msg.timestamp,
		),
	);

	// Update account usage if authenticated
	if (msg.accountId && msg.accountId !== NO_ACCOUNT_ID) {
		const accountId = msg.accountId; // Capture for closure
		asyncWriter.enqueue(() => dbOps.updateAccountUsage(accountId));
	}
}

function handleChunk(msg: ChunkMessage): void {
	const state = requests.get(msg.requestId);
	if (!state) {
		log.warn(`No state found for request ${msg.requestId}`);
		return;
	}

	// Store chunk for later payload saving
	state.chunks.push(msg.data);

	// Process for usage extraction
	processStreamChunk(msg.data, state);
}

async function handleEnd(msg: EndMessage): Promise<void> {
	const state = requests.get(msg.requestId);
	if (!state) {
		log.warn(`No state found for request ${msg.requestId}`);
		return;
	}

	const { startMessage } = state;
	const responseTime = Date.now() - startMessage.timestamp;

	// Calculate total tokens and cost
	if (state.usage.model) {
		state.usage.totalTokens =
			(state.usage.inputTokens || 0) +
			(state.usage.outputTokens || 0) +
			(state.usage.cacheReadInputTokens || 0) +
			(state.usage.cacheCreationInputTokens || 0);

		state.usage.costUsd = await estimateCostUSD(state.usage.model, {
			inputTokens: state.usage.inputTokens,
			outputTokens: state.usage.outputTokens,
			cacheReadInputTokens: state.usage.cacheReadInputTokens,
			cacheCreationInputTokens: state.usage.cacheCreationInputTokens,
		});
	}

	// Update request with final data
	asyncWriter.enqueue(() =>
		dbOps.saveRequest(
			startMessage.requestId,
			startMessage.method,
			startMessage.path,
			startMessage.accountId,
			startMessage.responseStatus,
			msg.success,
			msg.error || null,
			responseTime,
			startMessage.failoverAttempts,
			state.usage.model
				? {
						model: state.usage.model,
						promptTokens:
							(state.usage.inputTokens || 0) +
							(state.usage.cacheReadInputTokens || 0) +
							(state.usage.cacheCreationInputTokens || 0),
						completionTokens: state.usage.outputTokens,
						totalTokens: state.usage.totalTokens,
						costUsd: state.usage.costUsd,
						// Keep original breakdown for payload
						inputTokens: state.usage.inputTokens,
						outputTokens: state.usage.outputTokens,
						cacheReadInputTokens: state.usage.cacheReadInputTokens,
						cacheCreationInputTokens: state.usage.cacheCreationInputTokens,
					}
				: undefined,
		),
	);

	// Save payload
	let responseBody: string | null = null;

	if (msg.responseBody) {
		// Non-streaming response
		responseBody = msg.responseBody;
	} else if (state.chunks.length > 0) {
		// Streaming response - combine chunks
		const combined = combineChunks(state.chunks);
		if (combined.length > 0) {
			responseBody = combined.toString("base64");
		}
	}

	const payload = {
		request: {
			headers: startMessage.requestHeaders,
			body: startMessage.requestBody,
		},
		response: {
			status: startMessage.responseStatus,
			headers: startMessage.responseHeaders,
			body: responseBody,
		},
		meta: {
			accountId: startMessage.accountId || NO_ACCOUNT_ID,
			timestamp: startMessage.timestamp,
			success: msg.success,
			isStream: startMessage.isStream,
			retry: startMessage.retryAttempt,
		},
	};

	asyncWriter.enqueue(() =>
		dbOps.saveRequestPayload(startMessage.requestId, payload),
	);

	// Log if we have usage
	if (state.usage.model && startMessage.accountId !== NO_ACCOUNT_ID) {
		log.info(
			`Usage for request ${startMessage.requestId}: Model: ${state.usage.model}, ` +
				`Tokens: ${state.usage.totalTokens || 0}, Cost: ${state.usage.costUsd?.toFixed(4) || "0"}`,
		);
	}

	// Clean up
	requests.delete(msg.requestId);
}

async function handleShutdown(): Promise<void> {
	log.info("Worker shutting down, flushing async writer...");
	await asyncWriter.dispose();
	dbOps.close();
	// Worker will be terminated by main thread
}

// Periodic cleanup of stale requests (safety net for orphaned requests)
// This should rarely trigger as the main app handles timeouts
setInterval(() => {
	const now = Date.now();
	for (const [id, state] of requests) {
		if (now - state.lastActivity > TIMEOUT_MS) {
			log.warn(
				`Request ${id} appears orphaned (no activity for ${TIMEOUT_MS}ms), cleaning up...`,
			);
			handleEnd({
				type: "end",
				requestId: id,
				success: false,
				error: "Request orphaned - no activity",
			});
		}
	}
}, TIMEOUT_MS); // Check every TIMEOUT_MS

// Message handler
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
	const msg = event.data;

	switch (msg.type) {
		case "start":
			await handleStart(msg);
			break;
		case "chunk":
			handleChunk(msg);
			break;
		case "end":
			await handleEnd(msg);
			break;
		case "shutdown":
			await handleShutdown();
			break;
		default:
			log.warn(`Unknown message type: ${(msg as { type: string }).type}`);
	}
};
