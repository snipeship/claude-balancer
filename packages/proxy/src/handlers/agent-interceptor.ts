import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { agentRegistry } from "@ccflare/agents";
import type { DatabaseOperations } from "@ccflare/database";
import { Logger } from "@ccflare/logger";
import type { Agent } from "@ccflare/types";

const log = new Logger("AgentInterceptor");

export interface AgentInterceptResult {
	modifiedBody: ArrayBuffer | null;
	agentUsed: string | null;
	originalModel: string | null;
	appliedModel: string | null;
}

/**
 * Detects agent usage and modifies the request body to use the preferred model
 * @param requestBodyBuffer - The buffered request body
 * @param dbOps - Database operations instance
 * @returns Modified request body and agent detection information
 */
export async function interceptAndModifyRequest(
	requestBodyBuffer: ArrayBuffer | null,
	dbOps: DatabaseOperations,
): Promise<AgentInterceptResult> {
	// If no body, nothing to intercept
	if (!requestBodyBuffer) {
		return {
			modifiedBody: null,
			agentUsed: null,
			originalModel: null,
			appliedModel: null,
		};
	}

	try {
		// Parse the request body
		const bodyText = new TextDecoder().decode(requestBodyBuffer);
		const requestBody = JSON.parse(bodyText);

		// Extract original model
		const originalModel = requestBody.model || null;

		// Extract system prompt to detect agent usage
		const systemPrompt = extractSystemPrompt(requestBody);
		if (!systemPrompt) {
			// No system prompt, no agent detection possible
			log.info("No system prompt found in request");
			return {
				modifiedBody: requestBodyBuffer,
				agentUsed: null,
				originalModel,
				appliedModel: originalModel,
			};
		}

		// Register additional agent directories from system prompt
		log.info(`System prompt length: ${systemPrompt.length} chars`);
		if (systemPrompt.includes("CLAUDE.md")) {
			log.info("System prompt contains CLAUDE.md reference");

			// Look specifically for the Contents pattern
			if (systemPrompt.includes("Contents of")) {
				const contentsIndex = systemPrompt.indexOf("Contents of");
				const start = contentsIndex;
				const end = Math.min(systemPrompt.length, contentsIndex + 200);
				const sample = systemPrompt.substring(start, end);
				log.info(`Found 'Contents of' pattern: ${sample}`);
			} else {
				log.info("System prompt does NOT contain 'Contents of' pattern");
				// Show a sample of what we do have
				const claudeIndex = systemPrompt.indexOf("CLAUDE.md");
				const start = Math.max(0, claudeIndex - 50);
				const end = Math.min(systemPrompt.length, claudeIndex + 50);
				const sample = systemPrompt.substring(start, end);
				log.info(`Sample around CLAUDE.md: ...${sample}...`);
			}

			// Count all CLAUDE.md occurrences
			const matches = systemPrompt.match(/CLAUDE\.md/g);
			log.info(`Total CLAUDE.md occurrences: ${matches ? matches.length : 0}`);
		}

		const extraDirs = extractAgentDirectories(systemPrompt);
		log.info(
			`Found ${extraDirs.length} potential agent directories in system prompt`,
		);

		for (const dir of extraDirs) {
			log.info(`Checking potential workspace from agents directory: ${dir}`);
			// Extract workspace path from agents directory
			// Convert /path/to/project/.claude/agents to /path/to/project
			const workspacePath = dir.replace(/\/.claude\/agents$/, "");

			// Only register if the workspace exists
			if (existsSync(workspacePath)) {
				await agentRegistry.registerWorkspace(workspacePath);
				log.info(`Registered workspace: ${workspacePath}`);
			} else {
				log.info(`Workspace path does not exist: ${workspacePath}`);
			}
		}

		// Detect agent usage
		const agents = await agentRegistry.getAgents();
		const detectedAgent = agents.find((agent: Agent) =>
			systemPrompt.includes(agent.systemPrompt.trim()),
		);

		if (!detectedAgent) {
			// No agent detected
			return {
				modifiedBody: requestBodyBuffer,
				agentUsed: null,
				originalModel,
				appliedModel: originalModel,
			};
		}

		log.info(
			`Detected agent usage: ${detectedAgent.name} (${detectedAgent.id})`,
		);

		// Look up model preference
		const preference = dbOps.getAgentPreference(detectedAgent.id);
		const preferredModel = preference?.model || detectedAgent.model;

		// If the preferred model is the same as original, no modification needed
		if (preferredModel === originalModel) {
			return {
				modifiedBody: requestBodyBuffer,
				agentUsed: detectedAgent.id,
				originalModel,
				appliedModel: originalModel,
			};
		}

		// Modify the request body with the preferred model
		log.info(`Modifying model from ${originalModel} to ${preferredModel}`);
		requestBody.model = preferredModel;

		// Convert back to buffer
		const modifiedBodyText = JSON.stringify(requestBody);
		const encodedData = new TextEncoder().encode(modifiedBodyText);
		// Create a new ArrayBuffer to ensure compatibility
		const modifiedBody = new ArrayBuffer(encodedData.byteLength);
		new Uint8Array(modifiedBody).set(encodedData);

		return {
			modifiedBody,
			agentUsed: detectedAgent.id,
			originalModel,
			appliedModel: preferredModel,
		};
	} catch (error) {
		log.error("Failed to intercept/modify request:", error);
		// On error, return original body unmodified
		return {
			modifiedBody: requestBodyBuffer,
			agentUsed: null,
			originalModel: null,
			appliedModel: null,
		};
	}
}

interface MessageContent {
	type?: string;
	text?: string;
}

interface Message {
	role?: string;
	content?: string | MessageContent[];
}

interface SystemMessage {
	type: string;
	text: string;
	cache_control?: {
		type: string;
	};
}

interface RequestBody {
	messages?: Message[];
	model?: string;
	system?: string | SystemMessage[];
}

/**
 * Extracts system prompt from request body
 * This will extract system messages and user messages that contain system-like content
 * @param requestBody - Parsed request body
 * @returns System prompt string or null
 */
function extractSystemPrompt(requestBody: RequestBody): string | null {
	const extractLog = new Logger("ExtractSystemPrompt");
	const allSystemContent: string[] = [];

	// First check for system field at root level (Claude Code pattern)
	if (requestBody.system) {
		extractLog.info("Found system field at root level");
		if (typeof requestBody.system === "string") {
			extractLog.info(
				`System field is string, length: ${requestBody.system.length}`,
			);
			allSystemContent.push(requestBody.system);
		}
		if (Array.isArray(requestBody.system)) {
			extractLog.info(
				`System field is array with ${requestBody.system.length} items`,
			);
			// Concatenate all text from system messages
			const systemText = requestBody.system
				.filter(
					(item): item is SystemMessage => item.type === "text" && !!item.text,
				)
				.map((item) => item.text)
				.join("\n");
			extractLog.info(`Extracted system text length: ${systemText.length}`);
			if (systemText) {
				allSystemContent.push(systemText);
			}
		}
	}

	// Then check messages array
	if (requestBody.messages && Array.isArray(requestBody.messages)) {
		extractLog.info(
			`Checking messages array with ${requestBody.messages.length} messages`,
		);

		// Look for system messages
		const systemMessage = requestBody.messages.find(
			(msg) => msg.role === "system",
		);

		if (systemMessage) {
			extractLog.info("Found system role message");
			if (typeof systemMessage.content === "string") {
				extractLog.info(
					`System message content is string, length: ${systemMessage.content.length}`,
				);
				allSystemContent.push(systemMessage.content);
			}
			if (Array.isArray(systemMessage.content)) {
				extractLog.info(
					`System message content is array with ${systemMessage.content.length} items`,
				);
				const systemText = systemMessage.content
					.filter(
						(item): item is MessageContent & { text: string } =>
							item.type === "text" && !!item.text,
					)
					.map((item) => item.text)
					.join("\n");
				extractLog.info(
					`Extracted system message text length: ${systemText.length}`,
				);
				if (systemText) {
					allSystemContent.push(systemText);
				}
			}
		} else {
			extractLog.info("No system role message found, checking user messages");
		}

		// Also check for system prompt in user messages
		const userMessage = requestBody.messages.find((msg) => msg.role === "user");

		if (userMessage && Array.isArray(userMessage.content)) {
			// Concatenate all text content from the user message
			const textContents = userMessage.content.filter(
				(item): item is MessageContent & { text: string } =>
					item.type === "text" && !!item.text,
			);

			extractLog.info(
				`Found ${textContents.length} text content items in user message`,
			);

			const allUserText = textContents.map((item) => item.text).join("\n");

			if (
				allUserText.includes("Contents of") &&
				allUserText.includes("CLAUDE.md")
			) {
				extractLog.info(
					"User message contains 'Contents of' and 'CLAUDE.md' - including in system prompt",
				);
				allSystemContent.push(allUserText);
			}
		} else if (userMessage && typeof userMessage.content === "string") {
			if (
				userMessage.content.includes("Contents of") &&
				userMessage.content.includes("CLAUDE.md")
			) {
				extractLog.info(
					"User message string contains 'Contents of' and 'CLAUDE.md' - including in system prompt",
				);
				allSystemContent.push(userMessage.content);
			}
		}
	}

	// Combine all system content
	if (allSystemContent.length > 0) {
		const combined = allSystemContent.join("\n\n");
		extractLog.info(
			`Combined system prompt length: ${combined.length} from ${allSystemContent.length} sources`,
		);
		return combined;
	}

	return null;
}

/**
 * Extracts agent directories from system prompt
 * @param systemPrompt - The system prompt text
 * @returns Array of agent directory paths
 */
function extractAgentDirectories(systemPrompt: string): string[] {
	const extractDirLog = new Logger("ExtractAgentDirs");
	const directories = new Set<string>();

	// Regex #1: Look for explicit /.claude/agents paths
	const agentPathRegex = /([\\/][\w\-. ]*?\/.claude\/agents)(?=[\s"'\]])/g;
	let match: RegExpExecArray | null;

	match = agentPathRegex.exec(systemPrompt);
	while (match !== null) {
		const dir = resolve(match[1]);
		directories.add(dir);
		match = agentPathRegex.exec(systemPrompt);
	}

	// Regex #2: Look for repo root pattern "Contents of (.*?)/CLAUDE.md"
	const repoRootRegex = /Contents of ([^\n]+?)\/CLAUDE\.md/g;

	let matchCount = 0;
	match = repoRootRegex.exec(systemPrompt);
	while (match !== null) {
		matchCount++;
		const repoRoot = match[1];
		extractDirLog.info(
			`Found CLAUDE.md path match ${matchCount}: "${match[0]}"`,
		);
		extractDirLog.info(`Extracted repo root: "${repoRoot}"`);

		// Clean up any escaped slashes
		const cleanedRoot = repoRoot.replace(/\\\//g, "/");
		const agentsDir = join(cleanedRoot, ".claude", "agents");
		const resolvedDir = resolve(agentsDir);

		extractDirLog.info(`Resolved agents dir: "${resolvedDir}"`);
		directories.add(resolvedDir);
		match = repoRootRegex.exec(systemPrompt);
	}

	if (matchCount === 0 && systemPrompt.includes("CLAUDE.md")) {
		extractDirLog.info(
			"No CLAUDE.md path matches found despite CLAUDE.md being in prompt",
		);
	}

	return Array.from(directories);
}
