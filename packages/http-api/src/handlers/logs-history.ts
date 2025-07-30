import {
	errorResponse,
	InternalServerError,
	jsonResponse,
} from "@ccflare/http-common";
import { logFileWriter } from "@ccflare/logger";

/**
 * Create a logs history handler to fetch past logs
 */
export function createLogsHistoryHandler() {
	return async (): Promise<Response> => {
		try {
			// Get the last 1000 logs by default
			const logs = await logFileWriter.readLogs(1000);

			return jsonResponse(logs);
		} catch (_error) {
			return errorResponse(InternalServerError("Failed to fetch log history"));
		}
	};
}
