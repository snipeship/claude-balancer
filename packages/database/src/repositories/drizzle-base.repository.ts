import { randomUUID } from "node:crypto";
import type { DatabaseProvider } from "@ccflare/config";
import type { DatabaseConnection } from "../providers/database-provider";

/**
 * Base repository class for Drizzle ORM operations
 * This provides a common interface for database operations across different providers
 */
export abstract class DrizzleBaseRepository<T> {
	protected db: any; // DrizzleORM database instance

	constructor(
		protected connection: DatabaseConnection,
		protected provider: DatabaseProvider
	) {
		this.db = connection.getDrizzle();
	}

	/**
	 * Execute a query and return all results
	 */
	protected async query<R = T>(sql: string, params: any[] = []): Promise<R[]> {
		return this.connection.query<R>(sql, params);
	}

	/**
	 * Execute a query and return the first result
	 */
	protected async get<R = T>(sql: string, params: any[] = []): Promise<R | null> {
		return this.connection.get<R>(sql, params);
	}

	/**
	 * Execute a statement (INSERT, UPDATE, DELETE)
	 */
	protected async run(sql: string, params: any[] = []): Promise<{ changes: number; lastInsertRowid?: number }> {
		return this.connection.run(sql, params);
	}

	/**
	 * Execute a statement and return the number of affected rows
	 */
	protected async runWithChanges(sql: string, params: any[] = []): Promise<number> {
		const result = await this.connection.run(sql, params);
		return result.changes;
	}

	/**
	 * Begin a transaction
	 */
	protected async beginTransaction(): Promise<void> {
		await this.connection.beginTransaction();
	}

	/**
	 * Commit a transaction
	 */
	protected async commit(): Promise<void> {
		await this.connection.commit();
	}

	/**
	 * Rollback a transaction
	 */
	protected async rollback(): Promise<void> {
		await this.connection.rollback();
	}

	/**
	 * Execute a function within a transaction
	 */
	protected async withTransaction<R>(fn: () => Promise<R>): Promise<R> {
		await this.beginTransaction();
		try {
			const result = await fn();
			await this.commit();
			return result;
		} catch (originalError) {
			try {
				await this.rollback();
			} catch (rollbackError) {
				// Log rollback error but preserve original error
				console.error("Rollback failed:", rollbackError);
			}
			throw originalError;
		}
	}

	/**
	 * Get the database provider type
	 */
	protected getProvider(): DatabaseProvider {
		return this.provider;
	}

	/**
	 * Helper method to adapt SQL queries for different database providers
	 * This handles basic differences like parameter placeholders
	 */
	protected adaptSql(sql: string, params: any[]): { sql: string; params: any[] } {
		switch (this.provider) {
			case 'sqlite':
				// SQLite uses ? placeholders
				return { sql, params };
			
			case 'postgresql':
				// PostgreSQL uses $1, $2, etc. placeholders
				let pgSql = sql;
				let paramIndex = 1;
				pgSql = pgSql.replace(/\?/g, () => `$${paramIndex++}`);
				return { sql: pgSql, params };
			
			case 'mysql':
				// MySQL uses ? placeholders (same as SQLite)
				return { sql, params };
			
			default:
				return { sql, params };
		}
	}

	/**
	 * Helper method to handle timestamp differences between databases
	 */
	protected getTimestamp(): any {
		switch (this.provider) {
			case 'sqlite':
				return Date.now(); // Unix timestamp in milliseconds
			case 'postgresql':
			case 'mysql':
				return new Date(); // ISO timestamp
			default:
				return Date.now();
		}
	}

	/**
	 * Helper method to handle boolean values across databases
	 */
	protected adaptBoolean(value: boolean): any {
		switch (this.provider) {
			case 'sqlite':
				return value ? 1 : 0; // SQLite uses integers for booleans
			case 'postgresql':
			case 'mysql':
				return value; // Native boolean support
			default:
				return value;
		}
	}

	/**
	 * Helper method to handle UUID generation
	 */
	protected generateId(): string {
		return randomUUID();
	}
}
