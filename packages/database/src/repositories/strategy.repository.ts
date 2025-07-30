import { BaseRepository } from "./base.repository";

export interface StrategyData {
	name: string;
	config: Record<string, unknown>;
	updatedAt: number;
}

export class StrategyRepository extends BaseRepository<StrategyData> {
	getStrategy(name: string): StrategyData | null {
		const row = super.get<{ name: string; config: string; updated_at: number }>(
			`SELECT name, config, updated_at FROM strategies WHERE name = ?`,
			[name],
		);

		if (!row) return null;

		return {
			name: row.name,
			config: JSON.parse(row.config),
			updatedAt: row.updated_at,
		};
	}

	set(name: string, config: Record<string, unknown>): void {
		const now = Date.now();
		const configJson = JSON.stringify(config);

		this.run(
			`INSERT OR REPLACE INTO strategies (name, config, updated_at) VALUES (?, ?, ?)`,
			[name, configJson, now],
		);
	}

	list(): StrategyData[] {
		const rows = this.query<{
			name: string;
			config: string;
			updated_at: number;
		}>(`SELECT name, config, updated_at FROM strategies ORDER BY name`);

		return rows.map((row) => ({
			name: row.name,
			config: JSON.parse(row.config),
			updatedAt: row.updated_at,
		}));
	}

	delete(name: string): boolean {
		const changes = this.runWithChanges(
			`DELETE FROM strategies WHERE name = ?`,
			[name],
		);
		return changes > 0;
	}
}
