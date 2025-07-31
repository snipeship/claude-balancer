import type { DatabaseConnection } from "../providers/database-provider";
import type { DatabaseProvider } from "@ccflare/config";
import { Logger } from "@ccflare/logger";

const log = new Logger("MigrationCompatibility");

/**
 * Handles migration compatibility between old SQLite system and new Drizzle system
 * This ensures existing databases work with the new Drizzle ORM implementation
 */
export class MigrationCompatibility {
	
	/**
	 * Check if database has existing schema from old migration system
	 * A legacy database is one that:
	 * 1. Has tables but NO Drizzle migration tracking table
	 * 2. Is missing columns that should exist in the current schema
	 */
	static async hasLegacySchema(connection: DatabaseConnection, provider: DatabaseProvider): Promise<boolean> {
		try {
			if (provider !== 'sqlite') {
				// For non-SQLite providers, assume no legacy schema for now
				// TODO: Implement legacy detection for PostgreSQL/MySQL if needed
				return false;
			}

			// Check if Drizzle migrations table exists
			const drizzleMigrations = await connection.query(
				"SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'"
			);

			// If Drizzle migrations table exists, this is a Drizzle-managed database
			if (drizzleMigrations.length > 0) {
				log.info("Drizzle migrations table found - this is a Drizzle-managed database");
				return false;
			}

			// Check if accounts table exists (indicating some schema exists)
			const accountsTable = await connection.query(
				"SELECT name FROM sqlite_master WHERE type='table' AND name='accounts'"
			);

			if (accountsTable.length === 0) {
				log.info("No accounts table found - this is a fresh database");
				return false;
			}

			// If accounts table exists but no Drizzle migrations table, it's legacy
			log.info("Found accounts table but no Drizzle migrations table - this is a legacy database");
			return true;

		} catch (error) {
			log.warn("Error checking for legacy schema:", error);
			return false;
		}
	}
	
	/**
	 * Apply any missing migrations from the old system to ensure compatibility
	 */
	static async applyLegacyMigrations(connection: DatabaseConnection, provider: DatabaseProvider): Promise<void> {
		if (provider !== 'sqlite') {
			return; // Only SQLite needs legacy migration compatibility
		}
		
		log.info("Applying legacy migration compatibility for SQLite");
		
		try {
			// Get current table structure
			const accountsColumns = await connection.query("PRAGMA table_info(accounts)");
			const accountsColumnNames = accountsColumns.map((col: any) => col.name);
			
			const requestsColumns = await connection.query("PRAGMA table_info(requests)");
			const requestsColumnNames = requestsColumns.map((col: any) => col.name);
			
			// Apply missing columns that were added in the old migration system
			const accountMigrations = [
				{ column: 'rate_limited_until', sql: 'ALTER TABLE accounts ADD COLUMN rate_limited_until INTEGER' },
				{ column: 'session_start', sql: 'ALTER TABLE accounts ADD COLUMN session_start INTEGER' },
				{ column: 'session_request_count', sql: 'ALTER TABLE accounts ADD COLUMN session_request_count INTEGER DEFAULT 0' },
				{ column: 'account_tier', sql: 'ALTER TABLE accounts ADD COLUMN account_tier INTEGER DEFAULT 1' },
				{ column: 'paused', sql: 'ALTER TABLE accounts ADD COLUMN paused INTEGER DEFAULT 0' },
				{ column: 'rate_limit_reset', sql: 'ALTER TABLE accounts ADD COLUMN rate_limit_reset INTEGER' },
				{ column: 'rate_limit_status', sql: 'ALTER TABLE accounts ADD COLUMN rate_limit_status TEXT' },
				{ column: 'rate_limit_remaining', sql: 'ALTER TABLE accounts ADD COLUMN rate_limit_remaining INTEGER' },
			];
			
			for (const migration of accountMigrations) {
				if (!accountsColumnNames.includes(migration.column)) {
					await connection.run(migration.sql);
					log.info(`Added missing column: accounts.${migration.column}`);
				}
			}
			
			const requestMigrations = [
				{ column: 'model', sql: 'ALTER TABLE requests ADD COLUMN model TEXT' },
				{ column: 'prompt_tokens', sql: 'ALTER TABLE requests ADD COLUMN prompt_tokens INTEGER DEFAULT 0' },
				{ column: 'completion_tokens', sql: 'ALTER TABLE requests ADD COLUMN completion_tokens INTEGER DEFAULT 0' },
				{ column: 'total_tokens', sql: 'ALTER TABLE requests ADD COLUMN total_tokens INTEGER DEFAULT 0' },
				{ column: 'cost_usd', sql: 'ALTER TABLE requests ADD COLUMN cost_usd REAL DEFAULT 0' },
				{ column: 'input_tokens', sql: 'ALTER TABLE requests ADD COLUMN input_tokens INTEGER DEFAULT 0' },
				{ column: 'cache_read_input_tokens', sql: 'ALTER TABLE requests ADD COLUMN cache_read_input_tokens INTEGER DEFAULT 0' },
				{ column: 'cache_creation_input_tokens', sql: 'ALTER TABLE requests ADD COLUMN cache_creation_input_tokens INTEGER DEFAULT 0' },
				{ column: 'output_tokens', sql: 'ALTER TABLE requests ADD COLUMN output_tokens INTEGER DEFAULT 0' },
				{ column: 'agent_used', sql: 'ALTER TABLE requests ADD COLUMN agent_used TEXT' },
				{ column: 'output_tokens_per_second', sql: 'ALTER TABLE requests ADD COLUMN output_tokens_per_second REAL' },
			];
			
			for (const migration of requestMigrations) {
				if (!requestsColumnNames.includes(migration.column)) {
					await connection.run(migration.sql);
					log.info(`Added missing column: requests.${migration.column}`);
				}
			}
			
			// Ensure missing tables exist
			await this.ensureMissingTables(connection);
			
			log.info("Legacy migration compatibility completed");
			
		} catch (error) {
			log.error("Error applying legacy migrations:", error);
			throw error;
		}
	}
	
	/**
	 * Ensure tables that might be missing from old schema exist
	 */
	private static async ensureMissingTables(connection: DatabaseConnection): Promise<void> {
		// Check and create request_payloads table if missing
		const payloadsExists = await connection.query("SELECT name FROM sqlite_master WHERE type='table' AND name='request_payloads'");
		if (payloadsExists.length === 0) {
			await connection.run(`
				CREATE TABLE request_payloads (
					id TEXT PRIMARY KEY,
					json TEXT NOT NULL,
					FOREIGN KEY (id) REFERENCES requests(id) ON DELETE CASCADE
				)
			`);
			log.info("Created missing table: request_payloads");
		}
		
		// Check and create oauth_sessions table if missing
		const oauthExists = await connection.query("SELECT name FROM sqlite_master WHERE type='table' AND name='oauth_sessions'");
		if (oauthExists.length === 0) {
			await connection.run(`
				CREATE TABLE oauth_sessions (
					id TEXT PRIMARY KEY,
					account_name TEXT NOT NULL,
					verifier TEXT NOT NULL,
					mode TEXT NOT NULL,
					tier INTEGER DEFAULT 1,
					created_at INTEGER NOT NULL,
					expires_at INTEGER NOT NULL
				)
			`);
			await connection.run(`CREATE INDEX IF NOT EXISTS idx_oauth_sessions_expires ON oauth_sessions(expires_at)`);
			log.info("Created missing table: oauth_sessions");
		}
		
		// Check and create agent_preferences table if missing
		const agentPrefExists = await connection.query("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_preferences'");
		if (agentPrefExists.length === 0) {
			await connection.run(`
				CREATE TABLE agent_preferences (
					agent_id TEXT PRIMARY KEY,
					model TEXT NOT NULL,
					updated_at INTEGER NOT NULL
				)
			`);
			log.info("Created missing table: agent_preferences");
		}
		
		// NOTE: Strategies table is intentionally NOT created
		// Following the upstream maintainer's decision not to implement this table
		// The strategies functionality code remains available but the table is not created
		log.info("Strategies table intentionally not created - following upstream maintainer's decision");
	}
}
