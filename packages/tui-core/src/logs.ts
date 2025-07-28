import { logBus, logFileWriter } from "@ccflare/logger";
import type { LogEvent } from "@ccflare/types";

export function streamLogs(callback: (log: LogEvent) => void): () => void {
	const listener = (event: LogEvent) => {
		callback(event);
	};

	logBus.on("log", listener);

	// Return unsubscribe function
	return () => {
		logBus.off("log", listener);
	};
}

export async function getLogHistory(limit = 1000): Promise<LogEvent[]> {
	try {
		return await logFileWriter.readLogs(limit);
	} catch (error) {
		console.error("Failed to read log history:", error);
		return [];
	}
}
