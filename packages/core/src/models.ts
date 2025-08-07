/**
 * Centralized model definitions and constants
 * All Claude model IDs and metadata should be defined here
 */

// Full model IDs as used by the Anthropic API
export const CLAUDE_MODEL_IDS = {
	// Claude 3.5 models
	HAIKU_3_5: "claude-3-5-haiku-20241022",
	SONNET_3_5: "claude-3-5-sonnet-20241022",

	// Claude 4 models
	SONNET_4: "claude-sonnet-4-20250514",
	OPUS_4: "claude-opus-4-20250514",
	OPUS_4_1: "claude-opus-4-1-20250805",

	// Legacy Claude 3 models (for documentation/API examples)
	OPUS_3: "claude-3-opus-20240229",
	SONNET_3: "claude-3-sonnet-20240229",
} as const;

// Model display names
export const MODEL_DISPLAY_NAMES: Record<string, string> = {
	[CLAUDE_MODEL_IDS.HAIKU_3_5]: "Claude Haiku 3.5",
	[CLAUDE_MODEL_IDS.SONNET_3_5]: "Claude Sonnet 3.5 v2",
	[CLAUDE_MODEL_IDS.SONNET_4]: "Claude Sonnet 4",
	[CLAUDE_MODEL_IDS.OPUS_4]: "Claude Opus 4",
	[CLAUDE_MODEL_IDS.OPUS_4_1]: "Claude Opus 4.1",
	[CLAUDE_MODEL_IDS.OPUS_3]: "Claude Opus 3",
	[CLAUDE_MODEL_IDS.SONNET_3]: "Claude Sonnet 3",
};

// Short model names used in UI (for color mapping, etc.)
export const MODEL_SHORT_NAMES: Record<string, string> = {
	[CLAUDE_MODEL_IDS.HAIKU_3_5]: "claude-3.5-haiku",
	[CLAUDE_MODEL_IDS.SONNET_3_5]: "claude-3.5-sonnet",
	[CLAUDE_MODEL_IDS.SONNET_4]: "claude-sonnet-4",
	[CLAUDE_MODEL_IDS.OPUS_4]: "claude-opus-4",
	[CLAUDE_MODEL_IDS.OPUS_4_1]: "claude-opus-4.1",
	[CLAUDE_MODEL_IDS.OPUS_3]: "claude-3-opus",
	[CLAUDE_MODEL_IDS.SONNET_3]: "claude-3-sonnet",
};

// Default model for various contexts
export const DEFAULT_MODEL = CLAUDE_MODEL_IDS.SONNET_4;
export const DEFAULT_AGENT_MODEL = CLAUDE_MODEL_IDS.SONNET_4;

// Type for all valid model IDs
export type ClaudeModelId =
	(typeof CLAUDE_MODEL_IDS)[keyof typeof CLAUDE_MODEL_IDS];

// Helper function to get short name from full model ID
export function getModelShortName(modelId: string): string {
	return MODEL_SHORT_NAMES[modelId] || modelId;
}

// Helper function to get display name from model ID
export function getModelDisplayName(modelId: string): string {
	return MODEL_DISPLAY_NAMES[modelId] || modelId;
}

// Helper function to validate if a string is a valid model ID
export function isValidModelId(modelId: string): modelId is ClaudeModelId {
	return Object.values(CLAUDE_MODEL_IDS).includes(modelId as ClaudeModelId);
}
