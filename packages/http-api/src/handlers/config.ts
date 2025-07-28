import type { Config } from "@ccflare/config";
import { isValidStrategy, STRATEGIES } from "@ccflare/core";
import type { ConfigResponse, StrategyUpdateRequest } from "../types";
import { BadRequest, jsonResponse } from "../utils/http-error";

/**
 * Create config handlers
 */
export function createConfigHandlers(config: Config) {
	return {
		/**
		 * Get all configuration settings
		 */
		getConfig: (): Response => {
			const settings = config.getAllSettings();
			const response: ConfigResponse = {
				lb_strategy: (settings.lb_strategy as string) || "round_robin",
				port: (settings.port as number) || 8080,
				sessionDurationMs: (settings.sessionDurationMs as number) || 3600000,
			};
			return jsonResponse(response);
		},

		/**
		 * Get current strategy
		 */
		getStrategy: (): Response => {
			const strategy = config.getStrategy();
			return jsonResponse({ strategy });
		},

		/**
		 * Update strategy
		 */
		setStrategy: async (req: Request): Promise<Response> => {
			const body = (await req.json()) as StrategyUpdateRequest;
			const { strategy } = body;

			if (!strategy || !isValidStrategy(strategy)) {
				throw BadRequest("Invalid strategy");
			}

			config.setStrategy(strategy);

			return jsonResponse({ success: true, strategy });
		},

		/**
		 * Get available strategies
		 */
		getStrategies: (): Response => {
			return jsonResponse(STRATEGIES);
		},
	};
}
