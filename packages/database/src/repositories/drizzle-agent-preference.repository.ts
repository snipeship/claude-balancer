import { eq } from "drizzle-orm";
import type { DatabaseConnection } from "../providers/database-provider";
import type { DatabaseProvider } from "@ccflare/config";
import { DrizzleBaseRepository } from "./drizzle-base.repository";
import { getAgentPreferencesTable } from "../schema/agent-preferences";

export interface AgentPreference {
	agentId: string;
	model: string;
	updatedAt: number;
}

export class DrizzleAgentPreferenceRepository extends DrizzleBaseRepository<AgentPreference> {
	constructor(connection: DatabaseConnection, provider: DatabaseProvider) {
		super(connection, provider);
	}

	/**
	 * Get model preference for a specific agent
	 */
	async getPreference(agentId: string): Promise<{ model: string } | null> {
		const agentPreferencesTable = getAgentPreferencesTable(this.provider);
		
		const rows = await (this.db as any)
			.select({
				model: agentPreferencesTable.model
			})
			.from(agentPreferencesTable)
			.where(eq(agentPreferencesTable.agentId, agentId))
			.limit(1);

		return rows.length > 0 ? { model: rows[0].model } : null;
	}

	/**
	 * Set model preference for a specific agent
	 */
	async setPreference(agentId: string, model: string): Promise<void> {
		const agentPreferencesTable = getAgentPreferencesTable(this.provider);
		const now = this.getTimestamp();

		// Use DrizzleORM's onConflictDoUpdate for upsert operations
		if (this.provider === 'sqlite') {
			await (this.db as any)
				.insert(agentPreferencesTable)
				.values({
					agentId: agentId,
					model: model,
					updatedAt: now,
				})
				.onConflictDoUpdate({
					target: agentPreferencesTable.agentId,
					set: {
						model: model,
						updatedAt: now,
					},
				});
		} else if (this.provider === 'postgresql') {
			await (this.db as any)
				.insert(agentPreferencesTable)
				.values({
					agentId: agentId,
					model: model,
					updatedAt: now,
				})
				.onConflictDoUpdate({
					target: agentPreferencesTable.agentId,
					set: {
						model: model,
						updatedAt: now,
					},
				});
		} else if (this.provider === 'mysql') {
			await (this.db as any)
				.insert(agentPreferencesTable)
				.values({
					agentId: agentId,
					model: model,
					updatedAt: now,
				})
				.onDuplicateKeyUpdate({
					model: model,
					updatedAt: now,
				});
		}
	}

	/**
	 * Delete preference for a specific agent
	 */
	async deletePreference(agentId: string): Promise<boolean> {
		const agentPreferencesTable = getAgentPreferencesTable(this.provider);
		
		const result = await (this.db as any)
			.delete(agentPreferencesTable)
			.where(eq(agentPreferencesTable.agentId, agentId));

		return result.changes > 0;
	}

	/**
	 * List all agent preferences
	 */
	async listPreferences(): Promise<AgentPreference[]> {
		const agentPreferencesTable = getAgentPreferencesTable(this.provider);
		
		const rows = await (this.db as any)
			.select()
			.from(agentPreferencesTable)
			.orderBy(agentPreferencesTable.agentId);

		return rows.map((row: any) => ({
			agentId: row.agentId,
			model: row.model,
			updatedAt: row.updatedAt,
		}));
	}
}
