import { eq } from "drizzle-orm";
import type { DatabaseConnection } from "../providers/database-provider";
import type { DatabaseProvider } from "@ccflare/config";
import { DrizzleBaseRepository } from "./drizzle-base.repository";
import { getStrategiesTable } from "../schema/strategies";

// NOTE: Strategies table is intentionally not included in main schema migrations
// This follows the upstream maintainer's decision not to implement this table
// The code remains available for future use or manual table creation

export interface StrategyData {
	name: string;
	config: Record<string, unknown>;
	updatedAt: number;
}

export class DrizzleStrategyRepository extends DrizzleBaseRepository<StrategyData> {
	constructor(connection: DatabaseConnection, provider: DatabaseProvider) {
		super(connection, provider);
	}

	async getStrategy(name: string): Promise<StrategyData | null> {
		try {
			const strategiesTable = getStrategiesTable(this.provider);

			const rows = await (this.db as any)
				.select()
				.from(strategiesTable)
				.where(eq(strategiesTable.name, name))
				.limit(1);

			if (rows.length === 0) return null;

			const row = rows[0];
			try {
				return {
					name: row.name,
					config: JSON.parse(row.config),
					updatedAt: row.updatedAt,
				};
			} catch (error) {
				console.error(`Failed to parse strategy config for "${name}":`, error);
				throw new Error(`Invalid strategy configuration for "${name}"`);
			}
		} catch (error: any) {
			// Handle case where strategies table doesn't exist (legacy databases)
			if (error.message?.includes('no such table: strategies')) {
				console.warn("Strategies table not found - this is expected for legacy databases");
				return null;
			}
			throw error;
		}
	}

	async setStrategy(name: string, config: Record<string, unknown>): Promise<void> {
		const strategiesTable = getStrategiesTable(this.provider);
		const now = this.getTimestamp();
		const configJson = JSON.stringify(config);

		// Use DrizzleORM's onConflictDoUpdate for upsert operations
		if (this.provider === 'sqlite') {
			await (this.db as any)
				.insert(strategiesTable)
				.values({
					name: name,
					config: configJson,
					updatedAt: now,
				})
				.onConflictDoUpdate({
					target: strategiesTable.name,
					set: {
						config: configJson,
						updatedAt: now,
					},
				});
		} else if (this.provider === 'postgresql') {
			await (this.db as any)
				.insert(strategiesTable)
				.values({
					name: name,
					config: configJson,
					updatedAt: now,
				})
				.onConflictDoUpdate({
					target: strategiesTable.name,
					set: {
						config: configJson,
						updatedAt: now,
					},
				});
		} else if (this.provider === 'mysql') {
			await (this.db as any)
				.insert(strategiesTable)
				.values({
					name: name,
					config: configJson,
					updatedAt: now,
				})
				.onDuplicateKeyUpdate({
					config: configJson,
					updatedAt: now,
				});
		}
	}

	async listStrategies(): Promise<StrategyData[]> {
		try {
			const strategiesTable = getStrategiesTable(this.provider);

			const rows = await (this.db as any)
				.select()
				.from(strategiesTable)
				.orderBy(strategiesTable.name);

			const strategies: StrategyData[] = [];
			for (const row of rows) {
				try {
					strategies.push({
						name: row.name,
						config: JSON.parse(row.config),
						updatedAt: row.updatedAt,
					});
				} catch (error) {
					console.error(`Failed to parse strategy config for "${row.name}":`, error);
					// Skip malformed entries but continue processing others
				}
			}
			return strategies;
		} catch (error: any) {
			// Handle case where strategies table doesn't exist (legacy databases)
			if (error.message?.includes('no such table: strategies')) {
				console.warn("Strategies table not found - returning empty list for legacy database");
				return [];
			}
			throw error;
		}
	}

	async deleteStrategy(name: string): Promise<boolean> {
		const strategiesTable = getStrategiesTable(this.provider);
		
		const result = await (this.db as any)
			.delete(strategiesTable)
			.where(eq(strategiesTable.name, name));

		return result.changes > 0;
	}
}
