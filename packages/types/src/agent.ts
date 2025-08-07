import { CLAUDE_MODEL_IDS } from "@ccflare/core";

export type AgentSource = "global" | "workspace";

export type AgentTool =
	| "Bash"
	| "Glob"
	| "Grep"
	| "LS"
	| "Read"
	| "Edit"
	| "MultiEdit"
	| "Write"
	| "NotebookRead"
	| "NotebookEdit"
	| "WebFetch"
	| "TodoWrite"
	| "WebSearch";

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
	model: AllowedModel;
	systemPrompt: string;
	source: AgentSource;
	workspace?: string; // workspace path if source is "workspace"
	tools?: AgentTool[]; // parsed from tools: front-matter
	filePath: string; // absolute path of the markdown file
}

export type AgentResponse = Agent[];

export const ALLOWED_MODELS = [
	CLAUDE_MODEL_IDS.OPUS_4,
	CLAUDE_MODEL_IDS.OPUS_4_1,
	CLAUDE_MODEL_IDS.SONNET_4,
] as const;

export type AllowedModel = (typeof ALLOWED_MODELS)[number];
