import { sseResponse } from "@ccflare/http-common";
import { Logger, logBus } from "@ccflare/logger";
import type { LogEvent } from "@ccflare/types";

const log = new Logger("LogsHandler");

/**
 * Create a logs stream handler using Server-Sent Events
 */
export function createLogsStreamHandler() {
	return (): Response => {
		// Use TransformStream for better Bun compatibility
		const { readable, writable } = new TransformStream();
		const writer = writable.getWriter();
		const encoder = new TextEncoder();
		let closed = false;

		// Send initial connection message
		(async () => {
			try {
				const initialData = `data: ${JSON.stringify({ connected: true })}\n\n`;
				await writer.write(encoder.encode(initialData));
			} catch (e) {
				log.error("Error sending initial message:", e);
			}
		})();

		// Listen for log events
		const handleLogEvent = async (event: LogEvent) => {
			if (closed) return;

			try {
				const data = `data: ${JSON.stringify(event)}\n\n`;
				await writer.write(encoder.encode(data));
			} catch (_error) {
				// Stream closed
				closed = true;
				logBus.off("log", handleLogEvent);
				try {
					await writer.close();
				} catch {}
			}
		};

		// Subscribe to log events
		logBus.on("log", handleLogEvent);

		// Clean up on request abort
		setTimeout(() => {
			// ReadableStream doesn't have a standard 'closed' property
			// This is a workaround for stream closure detection
			if (!closed) {
				// Just rely on the error handling in handleLogEvent
				// to detect when the stream is closed
			}
		}, 0);

		return sseResponse(readable);
	};
}
