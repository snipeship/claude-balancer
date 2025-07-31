import { type RequestEvt, requestEvents } from "@ccflare/core";

export function createRequestsStreamHandler() {
	return (): Response => {
		// Store the write handler outside to access it in cancel
		let writeHandler: ((data: RequestEvt) => void) | null = null;

		const stream = new ReadableStream({
			start(controller) {
				const encoder = new TextEncoder();

				// Helper to send SSE formatted data
				writeHandler = (data: RequestEvt) => {
					const message = `data: ${JSON.stringify(data)}\n\n`;
					controller.enqueue(encoder.encode(message));
				};

				// Send initial connection message
				const connectMsg = `event: connected\ndata: ok\n\n`;
				controller.enqueue(encoder.encode(connectMsg));

				// Listen for events
				requestEvents.on("event", writeHandler);
			},
			cancel() {
				// Cleanup only this specific listener
				if (writeHandler) {
					requestEvents.off("event", writeHandler);
					writeHandler = null;
				}
			},
		});

		return new Response(stream, {
			headers: {
				"Content-Type": "text/event-stream",
				Connection: "keep-alive",
				"Cache-Control": "no-cache",
			},
		});
	};
}
