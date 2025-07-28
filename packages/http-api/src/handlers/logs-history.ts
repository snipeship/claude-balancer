import { logFileWriter } from "@ccflare/logger";

/**
 * Create a logs history handler to fetch past logs
 */
export function createLogsHistoryHandler() {
	return async (): Promise<Response> => {
		try {
			// Get the last 1000 logs by default
			const logs = await logFileWriter.readLogs(1000);

			return new Response(JSON.stringify(logs), {
				headers: { "Content-Type": "application/json" },
			});
		} catch (_error) {
			return new Response(
				JSON.stringify({ error: "Failed to fetch log history" }),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				},
			);
		}
	};
}
