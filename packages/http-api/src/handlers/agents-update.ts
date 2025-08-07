import { agentRegistry } from "@ccflare/agents";
import type { DatabaseOperations } from "@ccflare/database";
import { errorResponse, jsonResponse } from "@ccflare/http-common";
import type { AgentTool, AllowedModel } from "@ccflare/types";
import { ALLOWED_MODELS, TOOL_PRESETS } from "@ccflare/types";

type ToolMode = keyof typeof TOOL_PRESETS | "custom";

interface AgentUpdateRequest {
	description?: string;
	model?: AllowedModel;
	tools?: AgentTool[];
	color?: string;
	systemPrompt?: string;
	mode?: ToolMode;
}

export function createAgentUpdateHandler(dbOps: DatabaseOperations) {
	return async (req: Request, agentId: string): Promise<Response> => {
		try {
			const body = (await req.json()) as AgentUpdateRequest;

			// Validate individual pieces
			const updates: Partial<{
				description: string;
				model: AllowedModel;
				tools: AgentTool[];
				color: string;
				systemPrompt: string;
			}> = {};

			if (body.description !== undefined) {
				if (typeof body.description !== "string") {
					return errorResponse("Description must be a string");
				}
				updates.description = body.description;
			}

			if (body.model !== undefined) {
				if (!ALLOWED_MODELS.includes(body.model)) {
					return errorResponse(
						`Model must be one of: ${ALLOWED_MODELS.join(", ")}`,
					);
				}
				updates.model = body.model;
			}

			if (body.color !== undefined) {
				if (typeof body.color !== "string") {
					return errorResponse("Color must be a string");
				}
				updates.color = body.color;
			}

			if (body.systemPrompt !== undefined) {
				if (typeof body.systemPrompt !== "string") {
					return errorResponse("System prompt must be a string");
				}
				updates.systemPrompt = body.systemPrompt;
			}

			// Handle tools - either from mode or explicit tools array
			if (body.mode !== undefined) {
				if (body.mode === "custom") {
					if (!body.tools || !Array.isArray(body.tools)) {
						return errorResponse(
							"Tools array is required when mode is 'custom'",
						);
					}
					updates.tools = body.tools;
				} else if (body.mode in TOOL_PRESETS) {
					updates.tools = TOOL_PRESETS[body.mode];
				} else {
					return errorResponse(
						`Invalid mode. Must be one of: ${Object.keys(TOOL_PRESETS).join(", ")}, custom`,
					);
				}
			} else if (body.tools !== undefined) {
				if (!Array.isArray(body.tools)) {
					return errorResponse("Tools must be an array");
				}
				updates.tools = body.tools;
			}

			// Update agent using the registry
			const updated = await agentRegistry.updateAgent(agentId, updates, {
				deleteAgentPreference: (id: string) => dbOps.deleteAgentPreference(id),
			});

			return jsonResponse({ success: true, agent: updated });
		} catch (error) {
			if (error instanceof Error && error.message.includes("not found")) {
				return errorResponse(`Agent with id ${agentId} not found`);
			}
			console.error("Error updating agent:", error);
			return errorResponse("Failed to update agent");
		}
	};
}
