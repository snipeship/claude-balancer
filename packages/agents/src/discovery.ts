import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { Logger } from "@ccflare/logger";
import type { Agent, AgentWorkspace, AllowedModel } from "@ccflare/types";
import { getAgentsDirectory } from "./paths";
import { workspacePersistence } from "./workspace-persistence";

interface AgentCache {
	agents: Agent[];
	timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_COLOR = "gray";
const DEFAULT_MODEL: AllowedModel = "claude-sonnet-4-20250514";

const log = new Logger("AgentRegistry");

export class AgentRegistry {
	private cache: AgentCache | null = null;
	private workspaces: Map<string, AgentWorkspace> = new Map();
	private initialized = false;

	// Initialize the registry (load persisted workspaces)
	async initialize(): Promise<void> {
		if (this.initialized) return;

		try {
			const savedWorkspaces = await workspacePersistence.loadWorkspaces();
			for (const workspace of savedWorkspaces) {
				this.workspaces.set(workspace.path, workspace);
			}
			log.info(
				`Initialized with ${savedWorkspaces.length} persisted workspaces`,
			);
			this.initialized = true;

			// Load agents from all workspaces
			if (savedWorkspaces.length > 0) {
				await this.loadAgents();
			}
		} catch (error) {
			log.error("Failed to initialize agent registry:", error);
			this.initialized = true; // Mark as initialized even on error
		}
	}

	private isValidModel(model: string): model is AllowedModel {
		const allowedModels: AllowedModel[] = [
			"claude-opus-4-20250514",
			"claude-sonnet-4-20250514",
		];
		return allowedModels.includes(model as AllowedModel);
	}

	private async loadAgentFromFile(
		filePath: string,
		source: "global" | "workspace",
		workspace?: string,
	): Promise<Agent | null> {
		try {
			const content = await readFile(filePath, "utf-8");

			// Extract frontmatter manually using regex
			const frontmatterMatch = content.match(
				/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/,
			);
			if (!frontmatterMatch) {
				log.error(`No valid frontmatter found in ${filePath}`);
				return null;
			}

			const frontmatterContent = frontmatterMatch[1];
			const systemPrompt = frontmatterMatch[2];

			// Parse frontmatter line by line for simple key-value pairs
			const data: {
				name?: string;
				description?: string;
				color?: string;
				model?: string;
				[key: string]: string | undefined;
			} = {};

			const lines = frontmatterContent.split("\n");
			for (const line of lines) {
				const match = line.match(/^(\w+):\s*(.*)$/);
				if (match) {
					const [, key, value] = match;
					// Handle quoted strings and trim
					data[key] = value.replace(/^["']|["']$/g, "").trim();
				}
			}

			// Validate required fields
			if (!data.name || !data.description) {
				log.warn(
					`Agent file ${filePath} missing required fields (name, description)`,
				);
				return null;
			}

			// Extract and validate model (now optional - will use UI preference)
			const model = data.model || DEFAULT_MODEL;
			if (data.model && !this.isValidModel(model)) {
				log.warn(
					`Agent file ${filePath} has invalid model: ${model}. Using default.`,
				);
			}

			const id = basename(filePath, ".md");

			return {
				id,
				name: data.name,
				description: data.description,
				color: data.color || DEFAULT_COLOR,
				model: DEFAULT_MODEL, // Always use default, UI will override
				systemPrompt: systemPrompt.trim(),
				source,
				workspace,
			};
		} catch (error) {
			log.error(`Error loading agent from ${filePath}:`, error);
			return null;
		}
	}

	async loadAgents(): Promise<void> {
		const agents: Agent[] = [];
		const seenIds = new Set<string>();

		// Load global agents
		const globalDir = getAgentsDirectory();
		if (existsSync(globalDir)) {
			try {
				const files = await readdir(globalDir);
				const mdFiles = files.filter((file) => file.endsWith(".md"));

				for (const file of mdFiles) {
					const filePath = join(globalDir, file);
					const agent = await this.loadAgentFromFile(filePath, "global");

					if (agent) {
						if (seenIds.has(agent.id)) {
							log.warn(
								`Duplicate agent id ${agent.id} found in ${filePath} - keeping first occurrence`,
							);
							continue;
						}

						seenIds.add(agent.id);
						agents.push(agent);
					}
				}

				log.info(`Loaded ${mdFiles.length} global agents from ${globalDir}`);
			} catch (error) {
				log.error(`Error loading global agents from ${globalDir}:`, error);
			}
		}

		// Load workspace agents
		for (const [workspacePath, workspace] of this.workspaces) {
			const workspaceAgentsDir = join(workspacePath, ".claude", "agents");

			if (!existsSync(workspaceAgentsDir)) {
				log.debug(
					`Workspace agents directory does not exist: ${workspaceAgentsDir}`,
				);
				continue;
			}

			try {
				const files = await readdir(workspaceAgentsDir);
				const mdFiles = files.filter((file) => file.endsWith(".md"));

				for (const file of mdFiles) {
					const filePath = join(workspaceAgentsDir, file);
					const agent = await this.loadAgentFromFile(
						filePath,
						"workspace",
						workspacePath,
					);

					if (agent) {
						// For workspace agents, prefix the ID with workspace path to ensure uniqueness
						const workspaceAgentId = `${workspace.name}:${agent.id}`;

						if (seenIds.has(workspaceAgentId)) {
							log.warn(
								`Duplicate agent id ${workspaceAgentId} found in ${filePath} - keeping first occurrence`,
							);
							continue;
						}

						// Update the agent ID to include workspace prefix
						agent.id = workspaceAgentId;
						seenIds.add(workspaceAgentId);
						agents.push(agent);
					}
				}

				log.info(
					`Loaded ${mdFiles.length} agents from workspace ${workspace.name} (${workspacePath})`,
				);
			} catch (error) {
				log.error(
					`Error loading agents from workspace ${workspacePath}:`,
					error,
				);
			}
		}

		this.cache = { agents, timestamp: Date.now() };
		log.info(
			`Total agents loaded: ${agents.length} (${agents.filter((a) => a.source === "global").length} global, ${agents.filter((a) => a.source === "workspace").length} workspace)`,
		);
	}

	async getAgents(): Promise<Agent[]> {
		// Ensure we're initialized
		await this.initialize();

		// Check if cache is valid
		if (this.cache && Date.now() - this.cache.timestamp < CACHE_TTL_MS) {
			return this.cache.agents;
		}

		// Reload agents
		await this.loadAgents();
		return this.cache?.agents || [];
	}

	async findAgentByPrompt(systemPrompt: string): Promise<Agent | undefined> {
		const agents = await this.getAgents();

		// Normalize the prompt for comparison
		const normalizedPrompt = systemPrompt.trim();

		return agents.find((agent) => {
			// Check if the agent's system prompt is contained within the provided prompt
			// This handles cases where the agent prompt is part of a larger system prompt
			return normalizedPrompt.includes(agent.systemPrompt);
		});
	}

	// Force reload agents (useful for testing or manual refresh)
	async refresh(): Promise<void> {
		this.cache = null;
		await this.loadAgents();
	}

	// Register a workspace
	async registerWorkspace(workspacePath: string): Promise<void> {
		const normalizedPath = resolve(workspacePath);

		// Check if this workspace is already registered
		if (this.workspaces.has(normalizedPath)) {
			// Update last seen time
			const workspace = this.workspaces.get(normalizedPath);
			if (workspace) {
				workspace.lastSeen = Date.now();
			}
			return;
		}

		// Extract workspace name from path
		const pathParts = normalizedPath.split("/");
		const workspaceName = pathParts[pathParts.length - 1] || "workspace";

		// Create new workspace entry
		const workspace: AgentWorkspace = {
			path: normalizedPath,
			name: workspaceName,
			lastSeen: Date.now(),
		};

		this.workspaces.set(normalizedPath, workspace);
		log.info(`Registered workspace: ${workspaceName} at ${normalizedPath}`);

		// Save workspaces to disk
		await this.saveWorkspaces();

		// Refresh to load agents from the new workspace
		await this.refresh();
	}

	// Get current workspaces
	getWorkspaces(): AgentWorkspace[] {
		return Array.from(this.workspaces.values());
	}

	// Save workspaces to disk
	private async saveWorkspaces(): Promise<void> {
		try {
			await workspacePersistence.saveWorkspaces(this.getWorkspaces());
		} catch (error) {
			log.error("Failed to save workspaces:", error);
		}
	}

	// Clear all workspaces (useful for testing)
	async clearWorkspaces(): Promise<void> {
		this.workspaces.clear();
		this.cache = null;
		await this.saveWorkspaces();
		log.info("Cleared all workspaces");
	}

	// Remove old workspaces that haven't been seen recently (e.g., 7 days)
	async pruneOldWorkspaces(
		maxAgeMs: number = 7 * 24 * 60 * 60 * 1000,
	): Promise<void> {
		const now = Date.now();
		const toRemove: string[] = [];

		for (const [path, workspace] of this.workspaces) {
			if (now - workspace.lastSeen > maxAgeMs) {
				toRemove.push(path);
			}
		}

		for (const path of toRemove) {
			this.workspaces.delete(path);
			log.info(`Removed stale workspace: ${path}`);
		}

		if (toRemove.length > 0) {
			this.cache = null; // Clear cache to force reload
			await this.saveWorkspaces();
		}
	}
}

// Create singleton instance
export const agentRegistry = new AgentRegistry();
