import { CLAUDE_MODEL_IDS } from "@ccflare/core";

export type AgentSource = "global" | "workspace";

export interface AgentWorkspace {
	path: string;
	name: string;
	lastSeen: number; // timestamp
}

export interface Agent {
	id: string;
	name: string;
	description: string;
	color: string;
	model: string;
	systemPrompt: string;
	source: AgentSource;
	workspace?: string; // workspace path if source is "workspace"
}

export type AgentResponse = Agent[];

export const ALLOWED_MODELS = [
	CLAUDE_MODEL_IDS.OPUS_4,
	CLAUDE_MODEL_IDS.SONNET_4,
] as const;

export type AllowedModel = (typeof ALLOWED_MODELS)[number];
