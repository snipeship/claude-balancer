import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
	type Account,
	type AccountRow,
	type Disposable,
	type StrategyStore,
	toAccount,
} from "@ccflare/core";
import type { RuntimeConfig as ConfigRuntimeConfig } from "@ccflare/config";
import { ensureSchema, runMigrations } from "./migrations";
import { resolveDbPath } from "./paths";
import { withDatabaseRetry, withDatabaseRetrySync } from "./retry";

/**
 * Apply SQLite pragmas for optimal performance on distributed filesystems
 */
function configureSqlite(db: Database, config: DatabaseConfig): void {
	try {
		// Check database integrity first
		const integrityResult = db.query("PRAGMA integrity_check").get() as { integrity_check: string };
		if (integrityResult.integrity_check !== "ok") {
			throw new Error(`Database integrity check failed: ${integrityResult.integrity_check}`);
		}

		// Enable WAL mode for better concurrency (with error handling)
		if (config.walMode !== false) {
			try {
				const result = db.query("PRAGMA journal_mode = WAL").get() as { journal_mode: string };
				if (result.journal_mode !== "wal") {
					console.warn("Failed to enable WAL mode, falling back to DELETE mode");
					db.run("PRAGMA journal_mode = DELETE");
				}
			} catch (error) {
				console.warn("WAL mode failed, using DELETE mode:", error);
				db.run("PRAGMA journal_mode = DELETE");
			}
		}

		// Set busy timeout for lock handling
		if (config.busyTimeoutMs !== undefined) {
			db.run(`PRAGMA busy_timeout = ${config.busyTimeoutMs}`);
		}

		// Configure cache size
		if (config.cacheSize !== undefined) {
			db.run(`PRAGMA cache_size = ${config.cacheSize}`);
		}

		// Set synchronous mode (more conservative for distributed filesystems)
		const syncMode = config.synchronous || 'FULL'; // Default to FULL for safety
		db.run(`PRAGMA synchronous = ${syncMode}`);

		// Configure memory-mapped I/O (disable on distributed filesystems if problematic)
		if (config.mmapSize !== undefined && config.mmapSize > 0) {
			try {
				db.run(`PRAGMA mmap_size = ${config.mmapSize}`);
			} catch (error) {
				console.warn("Memory-mapped I/O failed, disabling:", error);
				db.run("PRAGMA mmap_size = 0");
			}
		}

		// Additional optimizations for distributed filesystems
		db.run("PRAGMA temp_store = MEMORY");
		db.run("PRAGMA foreign_keys = ON");

		// Add checkpoint interval for WAL mode
		db.run("PRAGMA wal_autocheckpoint = 1000");

	} catch (error) {
		console.error("Database configuration failed:", error);
		throw new Error(`Failed to configure SQLite database: ${error}`);
	}
}

export interface RuntimeConfig {
	sessionDurationMs?: number;
}

export interface DatabaseConfig {
	/** Enable WAL (Write-Ahead Logging) mode for better concurrency */
	walMode?: boolean;
	/** SQLite busy timeout in milliseconds */
	busyTimeoutMs?: number;
	/** Cache size in pages (negative value = KB) */
	cacheSize?: number;
	/** Synchronous mode: OFF, NORMAL, FULL */
	synchronous?: 'OFF' | 'NORMAL' | 'FULL';
	/** Memory-mapped I/O size in bytes */
	mmapSize?: number;
}

export interface DatabaseRetryConfig {
	/** Maximum number of retry attempts for database operations */
	attempts?: number;
	/** Initial delay between retries in milliseconds */
	delayMs?: number;
	/** Backoff multiplier for exponential backoff */
	backoff?: number;
	/** Maximum delay between retries in milliseconds */
	maxDelayMs?: number;
}

export class DatabaseOperations implements StrategyStore, Disposable {
	private db: Database;
	private runtime?: RuntimeConfig;
	private dbConfig: DatabaseConfig;
	private retryConfig: DatabaseRetryConfig;

	constructor(dbPath?: string, dbConfig?: DatabaseConfig, retryConfig?: DatabaseRetryConfig) {
		const resolvedPath = dbPath ?? resolveDbPath();

		// Default database configuration optimized for distributed filesystems
		// More conservative settings to prevent corruption on Rook Ceph
		this.dbConfig = {
			walMode: true,
			busyTimeoutMs: 10000, // Increased timeout for distributed storage
			cacheSize: -10000, // Reduced cache size (10MB) for stability
			synchronous: 'FULL', // Full synchronous mode for data safety
			mmapSize: 0, // Disable memory-mapped I/O on distributed filesystems
			...dbConfig
		};

		// Default retry configuration for database operations
		this.retryConfig = {
			attempts: 3,
			delayMs: 100,
			backoff: 2,
			maxDelayMs: 5000,
			...retryConfig
		};

		// Ensure the directory exists
		const dir = dirname(resolvedPath);
		mkdirSync(dir, { recursive: true });

		this.db = new Database(resolvedPath, { create: true });

		// Apply SQLite configuration for distributed filesystem optimization
		configureSqlite(this.db, this.dbConfig);

		ensureSchema(this.db);
		runMigrations(this.db);
	}

	setRuntimeConfig(runtime: ConfigRuntimeConfig): void {
		this.runtime = runtime as any; // Keep backward compatibility

		// Update retry config from runtime config if available
		if (runtime.database?.retry) {
			this.retryConfig = {
				...this.retryConfig,
				...runtime.database.retry
			};
		}
	}

	getDatabase(): Database {
		return this.db;
	}

	/**
	 * Get the current retry configuration
	 */
	getRetryConfig(): DatabaseRetryConfig {
		return this.retryConfig;
	}

	/**
	 * Execute a database operation with retry logic
	 */
	private async withRetry<T>(
		operation: () => T | Promise<T>,
		operationName: string
	): Promise<T> {
		return withDatabaseRetry(operation, this.retryConfig, operationName);
	}

	/**
	 * Execute a synchronous database operation with retry logic
	 */
	private withRetrySync<T>(
		operation: () => T,
		operationName: string
	): T {
		return withDatabaseRetrySync(operation, this.retryConfig, operationName);
	}

	getAllAccounts(): Account[] {
		return this.withRetrySync(() => {
			const rows = this.db
				.query<AccountRow, []>(`
	      SELECT
	        id,
	        name,
	        provider,
	        api_key,
	        refresh_token,
	        access_token,
	        expires_at,
	        created_at,
	        last_used,
	        request_count,
	        total_requests,
	        rate_limited_until,
	        session_start,
	        session_request_count,
	        COALESCE(account_tier, 1) as account_tier,
	        COALESCE(paused, 0) as paused,
	        rate_limit_reset,
	        rate_limit_status,
	        rate_limit_remaining
	      FROM accounts
	    `)
				.all();

			return rows.map(toAccount);
		}, "getAllAccounts");
	}

	updateAccountTokens(
		accountId: string,
		accessToken: string,
		expiresAt: number,
		refreshToken?: string,
	): void {
		this.withRetrySync(() => {
			if (refreshToken) {
				this.db.run(
					`UPDATE accounts SET access_token = ?, expires_at = ?, refresh_token = ? WHERE id = ?`,
					[accessToken, expiresAt, refreshToken, accountId],
				);
			} else {
				this.db.run(
					`UPDATE accounts SET access_token = ?, expires_at = ? WHERE id = ?`,
					[accessToken, expiresAt, accountId],
				);
			}
		}, "updateAccountTokens");
	}

	updateAccountUsage(accountId: string): void {
		const now = Date.now();
		const sessionDuration =
			this.runtime?.sessionDurationMs || 5 * 60 * 60 * 1000; // fallback to 5 hours

		this.db.run(
			`
      UPDATE accounts 
      SET 
        last_used = ?,
        request_count = request_count + 1,
        total_requests = total_requests + 1,
        session_start = CASE
          WHEN session_start IS NULL OR ? - session_start >= ? THEN ?
          ELSE session_start
        END,
        session_request_count = CASE
          WHEN session_start IS NULL OR ? - session_start >= ? THEN 1
          ELSE session_request_count + 1
        END
      WHERE id = ?
    `,
			[now, now, sessionDuration, now, now, sessionDuration, accountId],
		);
	}

	markAccountRateLimited(accountId: string, until: number): void {
		this.withRetrySync(() => {
			this.db.run(`UPDATE accounts SET rate_limited_until = ? WHERE id = ?`, [
				until,
				accountId,
			]);
		}, "markAccountRateLimited");
	}

	updateAccountRateLimitMeta(
		accountId: string,
		status: string,
		reset: number | null,
		remaining?: number | null,
	): void {
		this.db.run(
			`UPDATE accounts SET rate_limit_status = ?, rate_limit_reset = ?, rate_limit_remaining = ? WHERE id = ?`,
			[status, reset, remaining ?? null, accountId],
		);
	}

	updateAccountTier(accountId: string, tier: number): void {
		this.db.run(`UPDATE accounts SET account_tier = ? WHERE id = ?`, [
			tier,
			accountId,
		]);
	}

	saveRequestMeta(
		id: string,
		method: string,
		path: string,
		accountUsed: string | null,
		statusCode: number | null,
		timestamp?: number,
	): void {
		this.db.run(
			`
      INSERT INTO requests (
        id, timestamp, method, path, account_used, 
        status_code, success, error_message, response_time_ms, failover_attempts
      )
      VALUES (?, ?, ?, ?, ?, ?, 0, NULL, 0, 0)
    `,
			[id, timestamp || Date.now(), method, path, accountUsed, statusCode],
		);
	}

	saveRequest(
		id: string,
		method: string,
		path: string,
		accountUsed: string | null,
		statusCode: number | null,
		success: boolean,
		errorMessage: string | null,
		responseTime: number,
		failoverAttempts: number,
		usage?: {
			model?: string;
			promptTokens?: number;
			completionTokens?: number;
			totalTokens?: number;
			costUsd?: number;
			inputTokens?: number;
			cacheReadInputTokens?: number;
			cacheCreationInputTokens?: number;
			outputTokens?: number;
		},
	): void {
		this.db.run(
			`
      INSERT OR REPLACE INTO requests (
        id, timestamp, method, path, account_used, 
        status_code, success, error_message, response_time_ms, failover_attempts,
        model, prompt_tokens, completion_tokens, total_tokens, cost_usd,
        input_tokens, cache_read_input_tokens, cache_creation_input_tokens, output_tokens
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
			[
				id,
				Date.now(),
				method,
				path,
				accountUsed,
				statusCode,
				success ? 1 : 0,
				errorMessage,
				responseTime,
				failoverAttempts,
				usage?.model || null,
				usage?.promptTokens || null,
				usage?.completionTokens || null,
				usage?.totalTokens || null,
				usage?.costUsd || null,
				usage?.inputTokens || null,
				usage?.cacheReadInputTokens || null,
				usage?.cacheCreationInputTokens || null,
				usage?.outputTokens || null,
			],
		);
	}

	// StrategyStore implementation
	resetAccountSession(accountId: string, timestamp: number): void {
		this.db.run(
			`UPDATE accounts SET session_start = ?, session_request_count = 0 WHERE id = ?`,
			[timestamp, accountId],
		);
	}

	getAccount(accountId: string): Account | null {
		return this.withRetrySync(() => {
			const row = this.db
				.query<AccountRow, [string]>(`
					SELECT
						id,
						name,
						provider,
						api_key,
						refresh_token,
						access_token,
						expires_at,
						created_at,
						last_used,
						request_count,
						total_requests,
						rate_limited_until,
						session_start,
						session_request_count,
						COALESCE(account_tier, 1) as account_tier,
						COALESCE(paused, 0) as paused,
						rate_limit_reset,
						rate_limit_status,
						rate_limit_remaining
					FROM accounts
					WHERE id = ?
				`)
				.get(accountId);

			return row ? toAccount(row) : null;
		}, "getAccount");
	}

	updateAccountRequestCount(accountId: string, count: number): void {
		this.db.run(`UPDATE accounts SET session_request_count = ? WHERE id = ?`, [
			count,
			accountId,
		]);
	}

	// Request payload methods
	saveRequestPayload(id: string, data: unknown): void {
		const json = JSON.stringify(data);
		this.db.run(
			`INSERT OR REPLACE INTO request_payloads (id, json) VALUES (?, ?)`,
			[id, json],
		);
	}

	getRequestPayload(id: string): unknown | null {
		return this.withRetrySync(() => {
			const row = this.db
				.query<{ json: string }, [string]>(
					`SELECT json FROM request_payloads WHERE id = ?`,
				)
				.get(id);

			if (!row) return null;

			try {
				return JSON.parse(row.json);
			} catch {
				return null;
			}
		}, "getRequestPayload");
	}

	listRequestPayloads(limit = 50): Array<{ id: string; json: string }> {
		return this.withRetrySync(() => {
			return this.db
				.query<{ id: string; json: string }, [number]>(`
					SELECT rp.id, rp.json
					FROM request_payloads rp
					JOIN requests r ON rp.id = r.id
					ORDER BY r.timestamp DESC
					LIMIT ?
				`)
				.all(limit);
		}, "listRequestPayloads");
	}

	listRequestPayloadsWithAccountNames(
		limit = 50,
	): Array<{ id: string; json: string; account_name: string | null }> {
		return this.withRetrySync(() => {
			return this.db
				.query<
					{ id: string; json: string; account_name: string | null },
					[number]
				>(`
					SELECT rp.id, rp.json, a.name as account_name
					FROM request_payloads rp
					JOIN requests r ON rp.id = r.id
					LEFT JOIN accounts a ON r.account_used = a.id
					ORDER BY r.timestamp DESC
					LIMIT ?
				`)
				.all(limit);
		}, "listRequestPayloadsWithAccountNames");
	}

	pauseAccount(accountId: string): void {
		this.db.run(`UPDATE accounts SET paused = 1 WHERE id = ?`, [accountId]);
	}

	resumeAccount(accountId: string): void {
		this.db.run(`UPDATE accounts SET paused = 0 WHERE id = ?`, [accountId]);
	}

	updateRequestUsage(
		requestId: string,
		usage: {
			model?: string;
			promptTokens?: number;
			completionTokens?: number;
			totalTokens?: number;
			costUsd?: number;
			inputTokens?: number;
			cacheReadInputTokens?: number;
			cacheCreationInputTokens?: number;
			outputTokens?: number;
		},
	): void {
		this.db.run(
			`
			UPDATE requests
			SET 
				model = COALESCE(?, model),
				prompt_tokens = COALESCE(?, prompt_tokens),
				completion_tokens = COALESCE(?, completion_tokens),
				total_tokens = COALESCE(?, total_tokens),
				cost_usd = COALESCE(?, cost_usd),
				input_tokens = COALESCE(?, input_tokens),
				cache_read_input_tokens = COALESCE(?, cache_read_input_tokens),
				cache_creation_input_tokens = COALESCE(?, cache_creation_input_tokens),
				output_tokens = COALESCE(?, output_tokens)
			WHERE id = ?
			`,
			[
				usage.model || null,
				usage.promptTokens || null,
				usage.completionTokens || null,
				usage.totalTokens || null,
				usage.costUsd || null,
				usage.inputTokens || null,
				usage.cacheReadInputTokens || null,
				usage.cacheCreationInputTokens || null,
				usage.outputTokens || null,
				requestId,
			],
		);
	}

	close(): void {
		this.db.close();
	}

	dispose(): void {
		this.close();
	}
}

export { AsyncDbWriter } from "./async-writer";
export { DatabaseFactory } from "./factory";
// Re-export migrations for convenience
export { ensureSchema, runMigrations } from "./migrations";
export { resolveDbPath } from "./paths";
// Re-export retry utilities for external use
export { withDatabaseRetry, withDatabaseRetrySync } from "./retry";
