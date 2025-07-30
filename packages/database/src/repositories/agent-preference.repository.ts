import { BaseRepository } from "./base.repository";

export interface AgentPreference {
	agentId: string;
	model: string;
	updatedAt: number;
}

export class AgentPreferenceRepository extends BaseRepository<AgentPreference> {
	/**
	 * Get model preference for a specific agent
	 */
	getPreference(agentId: string): { model: string } | null {
		const row = this.get<{ model: string }>(
			`SELECT model FROM agent_preferences WHERE agent_id = ?`,
			[agentId],
		);
		return row;
	}

	/**
	 * Get all agent preferences
	 */
	getAllPreferences(): Array<{ agent_id: string; model: string }> {
		return this.query<{ agent_id: string; model: string }>(
			`SELECT agent_id, model FROM agent_preferences`,
		);
	}

	/**
	 * Set model preference for an agent
	 */
	setPreference(agentId: string, model: string): void {
		this.run(
			`INSERT OR REPLACE INTO agent_preferences (agent_id, model, updated_at) VALUES (?, ?, ?)`,
			[agentId, model, Date.now()],
		);
	}

	/**
	 * Delete preference for an agent
	 */
	deletePreference(agentId: string): boolean {
		const changes = this.runWithChanges(
			`DELETE FROM agent_preferences WHERE agent_id = ?`,
			[agentId],
		);
		return changes > 0;
	}
}
