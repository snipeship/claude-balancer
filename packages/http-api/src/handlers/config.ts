import type { Config } from "@ccflare/config";
import {
	DEFAULT_AGENT_MODEL,
	NETWORK,
	STRATEGIES,
	type StrategyName,
	TIME_CONSTANTS,
	validateString,
} from "@ccflare/core";
import { BadRequest, errorResponse, jsonResponse } from "@ccflare/http-common";
import type { ConfigResponse } from "../types";

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
				port: (settings.port as number) || NETWORK.DEFAULT_PORT,
				sessionDurationMs:
					(settings.sessionDurationMs as number) ||
					TIME_CONSTANTS.SESSION_DURATION_FALLBACK,
				default_agent_model:
					(settings.default_agent_model as string) || DEFAULT_AGENT_MODEL,
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
			const body = await req.json();

			// Validate strategy input
			const strategyValidation = validateString(body.strategy, "strategy", {
				required: true,
				allowedValues: STRATEGIES,
			});

			if (!strategyValidation) {
				return errorResponse(BadRequest("Strategy is required"));
			}

			const strategy = strategyValidation as StrategyName;
			config.setStrategy(strategy);

			return jsonResponse({ success: true, strategy });
		},

		/**
		 * Get available strategies
		 */
		getStrategies: (): Response => {
			return jsonResponse(STRATEGIES);
		},

		/**
		 * Get default agent model
		 */
		getDefaultAgentModel: (): Response => {
			const model = config.getDefaultAgentModel();
			return jsonResponse({ model });
		},

		/**
		 * Set default agent model
		 */
		setDefaultAgentModel: async (req: Request): Promise<Response> => {
			const body = await req.json();

			// Validate model input
			const modelValidation = validateString(body.model, "model", {
				required: true,
			});

			if (!modelValidation) {
				return errorResponse(BadRequest("Model is required"));
			}

			config.setDefaultAgentModel(modelValidation);

			return jsonResponse({ success: true, model: modelValidation });
		},
	};
}
