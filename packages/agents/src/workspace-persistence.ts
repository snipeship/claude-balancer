import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { Logger } from "@ccflare/logger";
import type { AgentWorkspace } from "@ccflare/types";

const log = new Logger("WorkspacePersistence");

const WORKSPACES_FILE = join(homedir(), ".ccflare", "workspaces.json");

interface WorkspacesData {
	version: number;
	workspaces: AgentWorkspace[];
}

export class WorkspacePersistence {
	async loadWorkspaces(): Promise<AgentWorkspace[]> {
		try {
			if (!existsSync(WORKSPACES_FILE)) {
				log.debug("No workspaces file found");
				return [];
			}

			const content = await readFile(WORKSPACES_FILE, "utf-8");
			const data: WorkspacesData = JSON.parse(content);

			if (data.version !== 1) {
				log.warn(`Unknown workspaces file version: ${data.version}`);
				return [];
			}

			log.info(`Loaded ${data.workspaces.length} workspaces from disk`);
			return data.workspaces;
		} catch (error) {
			log.error("Failed to load workspaces:", error);
			return [];
		}
	}

	async saveWorkspaces(workspaces: AgentWorkspace[]): Promise<void> {
		try {
			const data: WorkspacesData = {
				version: 1,
				workspaces,
			};

			const content = JSON.stringify(data, null, 2);

			// Ensure directory exists
			const dir = join(homedir(), ".ccflare");
			if (!existsSync(dir)) {
				const { mkdir } = await import("node:fs/promises");
				await mkdir(dir, { recursive: true });
			}

			await writeFile(WORKSPACES_FILE, content, "utf-8");
			log.info(`Saved ${workspaces.length} workspaces to disk`);
		} catch (error) {
			log.error("Failed to save workspaces:", error);
		}
	}
}

export const workspacePersistence = new WorkspacePersistence();
