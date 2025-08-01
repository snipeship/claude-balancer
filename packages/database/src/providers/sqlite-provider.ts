import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { DatabaseProvider } from "@ccflare/config";
import type { DatabaseConnection, DatabaseConnectionConfig } from "./database-provider";
import { resolveDbPath } from "../paths";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";

/**
 * SQLite database provider using Bun's native SQLite implementation
 */
export class SQLiteProvider implements DatabaseConnection {
	private db: Database;
	private drizzleDb: BunSQLiteDatabase;
	private inTransaction = false;

	constructor(config: DatabaseConnectionConfig) {
		const dbPath = config.dbPath ?? resolveDbPath();

		// Ensure the directory exists (but not for in-memory databases)
		if (dbPath !== ':memory:') {
			const dir = dirname(dbPath);
			mkdirSync(dir, { recursive: true });
		}

		this.db = new Database(dbPath, { create: true });
		this.drizzleDb = drizzle(this.db);
		this.configureSQLite(config);
	}

	private configureSQLite(config: DatabaseConnectionConfig): void {
		try {
			// Enable WAL mode for better concurrency (with error handling)
			if (config.walMode !== false) {
				try {
					const result = this.db.query("PRAGMA journal_mode = WAL").get() as { journal_mode: string };
					if (result.journal_mode !== "wal") {
						console.warn("Failed to enable WAL mode, falling back to DELETE mode");
						this.db.run("PRAGMA journal_mode = DELETE");
					}
				} catch (error) {
					console.warn("WAL mode failed, using DELETE mode:", error);
					this.db.run("PRAGMA journal_mode = DELETE");
				}
			}

			// Set busy timeout for lock handling
			if (config.busyTimeoutMs !== undefined) {
				this.db.run(`PRAGMA busy_timeout = ${config.busyTimeoutMs}`);
			}

			// Configure cache size
			if (config.cacheSize !== undefined) {
				this.db.run(`PRAGMA cache_size = ${config.cacheSize}`);
			}

			// Set synchronous mode (more conservative for distributed filesystems)
			const syncMode = config.synchronous || 'FULL'; // Default to FULL for safety
			this.db.run(`PRAGMA synchronous = ${syncMode}`);

			// Configure memory-mapped I/O (disable on distributed filesystems if problematic)
			if (config.mmapSize !== undefined && config.mmapSize > 0) {
				try {
					this.db.run(`PRAGMA mmap_size = ${config.mmapSize}`);
				} catch (error) {
					console.warn("Memory-mapped I/O failed, disabling:", error);
					this.db.run("PRAGMA mmap_size = 0");
				}
			}

			// Additional optimizations for distributed filesystems
			this.db.run("PRAGMA temp_store = MEMORY");
			this.db.run("PRAGMA foreign_keys = ON");

			// Add checkpoint interval for WAL mode
			this.db.run("PRAGMA wal_autocheckpoint = 1000");

		} catch (error) {
			console.error("Database configuration failed:", error);
			throw new Error("Failed to configure SQLite database");
		}
	}

	async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
		return this.db.query<T, any[]>(sql).all(...params) as T[];
	}

	async get<T = any>(sql: string, params: any[] = []): Promise<T | null> {
		const result = this.db.query<T, any[]>(sql).get(...params);
		return result as T | null;
	}

	async run(sql: string, params: any[] = []): Promise<{ changes: number; lastInsertRowid?: number }> {
		const result = this.db.run(sql, params);
		return {
			changes: result.changes,
			lastInsertRowid: result.lastInsertRowid as number | undefined
		};
	}

	async beginTransaction(): Promise<void> {
		if (this.inTransaction) {
			throw new Error("Transaction already in progress");
		}
		try {
			this.db.run("BEGIN TRANSACTION");
			this.inTransaction = true;
		} catch (error) {
			// Ensure state remains consistent
			this.inTransaction = false;
			throw error;
		}
	}

	async commit(): Promise<void> {
		if (!this.inTransaction) {
			throw new Error("No transaction in progress");
		}
		try {
			this.db.run("COMMIT");
			this.inTransaction = false;
		} catch (error) {
			// Transaction state is uncertain, but we'll assume it failed
			this.inTransaction = false;
			throw error;
		}
	}

	async rollback(): Promise<void> {
		if (!this.inTransaction) {
			throw new Error("No transaction in progress");
		}
		try {
			this.db.run("ROLLBACK");
			this.inTransaction = false;
		} catch (error) {
			// Even if rollback fails, transaction is no longer active
			this.inTransaction = false;
			throw error;
		}
	}

	async close(): Promise<void> {
		// Reset transaction state before closing
		this.inTransaction = false;
		this.db.close();
	}

	getProvider(): DatabaseProvider {
		return 'sqlite';
	}

	getDrizzle(): BunSQLiteDatabase {
		return this.drizzleDb;
	}

	/**
	 * Get the underlying Bun SQLite database instance for compatibility
	 * @deprecated Use the DatabaseConnection interface methods instead
	 */
	getDatabase(): Database {
		return this.db;
	}
}
