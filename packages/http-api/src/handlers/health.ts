import type { Database } from "bun:sqlite";
import type { Config } from "@ccflare/config";
import type { HealthResponse } from "../types";

/**
 * Create a health check handler
 */
export function createHealthHandler(db: Database, config: Config) {
	return (): Response => {
		const accountCount = db
			.query("SELECT COUNT(*) as count FROM accounts")
			.get() as { count: number } | undefined;

		const response: HealthResponse = {
			status: "ok",
			accounts: accountCount?.count || 0,
			timestamp: new Date().toISOString(),
			strategy: config.getStrategy(),
		};

		return new Response(JSON.stringify(response), {
			headers: { "Content-Type": "application/json" },
		});
	};
}
