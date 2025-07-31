import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { RuntimeConfig } from "@ccflare/config";
import { DrizzleDatabaseOperations } from "../drizzle-database-operations";
import { DatabaseOperations } from "../database-operations";
import { DrizzleAccountRepository } from "../repositories/drizzle-account.repository";

/**
 * Backward compatibility tests to ensure existing SQLite installations work seamlessly
 */
describe('Backward Compatibility Tests', () => {
	let testDir: string;
	let legacyDbPath: string;
	let legacyDb: Database;

	beforeEach(() => {
		// Create temporary directory for test databases
		testDir = join(tmpdir(), `ccflare-compat-test-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });
		legacyDbPath = join(testDir, 'legacy.db');
		
		// Create legacy database with existing schema
		legacyDb = new Database(legacyDbPath, { create: true });
		createLegacySchema();
		populateLegacyData();
	});

	afterEach(() => {
		if (legacyDb) {
			legacyDb.close();
		}
		// Clean up test directory
		try {
			rmSync(testDir, { recursive: true, force: true });
		} catch (error) {
			// Ignore cleanup errors
		}
	});

	function createLegacySchema() {
		// Create the exact schema that existing installations have
		const migrations = [
			`CREATE TABLE accounts (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				provider TEXT DEFAULT 'anthropic',
				api_key TEXT,
				refresh_token TEXT NOT NULL,
				access_token TEXT,
				expires_at INTEGER,
				created_at INTEGER NOT NULL,
				last_used INTEGER,
				request_count INTEGER DEFAULT 0,
				total_requests INTEGER DEFAULT 0,
				account_tier INTEGER DEFAULT 1,
				rate_limited_until INTEGER,
				session_start INTEGER,
				session_request_count INTEGER DEFAULT 0,
				paused INTEGER DEFAULT 0,
				rate_limit_reset INTEGER,
				rate_limit_status TEXT,
				rate_limit_remaining INTEGER
			)`,
			
			`CREATE TABLE requests (
				id TEXT PRIMARY KEY,
				timestamp INTEGER NOT NULL,
				method TEXT NOT NULL,
				path TEXT NOT NULL,
				account_used TEXT,
				status_code INTEGER,
				success INTEGER,
				error_message TEXT,
				response_time_ms INTEGER,
				failover_attempts INTEGER DEFAULT 0,
				model TEXT,
				prompt_tokens INTEGER DEFAULT 0,
				completion_tokens INTEGER DEFAULT 0,
				total_tokens INTEGER DEFAULT 0,
				cost_usd REAL DEFAULT 0,
				output_tokens_per_second REAL,
				input_tokens INTEGER DEFAULT 0,
				cache_read_input_tokens INTEGER DEFAULT 0,
				cache_creation_input_tokens INTEGER DEFAULT 0,
				output_tokens INTEGER DEFAULT 0,
				agent_used TEXT,
				FOREIGN KEY (account_used) REFERENCES accounts(id)
			)`,
			
			`CREATE TABLE request_payloads (
				id TEXT PRIMARY KEY,
				json TEXT NOT NULL,
				FOREIGN KEY (id) REFERENCES requests(id) ON DELETE CASCADE
			)`,
			
			`CREATE TABLE oauth_sessions (
				id TEXT PRIMARY KEY,
				account_name TEXT NOT NULL,
				verifier TEXT NOT NULL,
				mode TEXT NOT NULL,
				tier INTEGER DEFAULT 1,
				created_at INTEGER NOT NULL,
				expires_at INTEGER NOT NULL
			)`,
			
			`CREATE TABLE agent_preferences (
				agent_id TEXT PRIMARY KEY,
				model TEXT NOT NULL,
				updated_at INTEGER NOT NULL
			)`,
			
			// Note: strategies table was referenced but not created in original schema
			// This tests that our new system can handle missing tables gracefully
			
			// Create indexes
			`CREATE INDEX idx_requests_timestamp ON requests(timestamp DESC)`,
			`CREATE INDEX idx_requests_account_used ON requests(account_used)`,
			`CREATE INDEX idx_requests_timestamp_account ON requests(timestamp DESC, account_used)`,
			`CREATE INDEX idx_oauth_sessions_expires ON oauth_sessions(expires_at)`,
		];

		for (const migration of migrations) {
			legacyDb.run(migration);
		}
	}

	function populateLegacyData() {
		const now = Date.now();
		
		// Insert legacy account data with all required fields
		legacyDb.run(`
			INSERT INTO accounts (
				id, name, provider, refresh_token, created_at, request_count, total_requests, account_tier, session_request_count, paused
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, ['legacy-account-1', 'Legacy Account 1', 'anthropic', 'legacy-refresh-token', now, 5, 10, 1, 0, 0]);

		legacyDb.run(`
			INSERT INTO accounts (
				id, name, provider, refresh_token, created_at, request_count, total_requests, account_tier, session_request_count, paused
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, ['legacy-account-2', 'Legacy Account 2', 'anthropic', 'legacy-refresh-token-2', now, 0, 0, 1, 0, 1]);

		// Insert legacy request data
		legacyDb.run(`
			INSERT INTO requests (
				id, timestamp, method, path, account_used, status_code, success, response_time_ms
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`, ['legacy-request-1', now, 'POST', '/v1/messages', 'legacy-account-1', 200, 1, 1500]);

		// Insert legacy OAuth session
		legacyDb.run(`
			INSERT INTO oauth_sessions (
				id, account_name, verifier, mode, tier, created_at, expires_at
			) VALUES (?, ?, ?, ?, ?, ?, ?)
		`, ['legacy-session-1', 'Legacy Account 1', 'legacy-verifier', 'console', 1, now, now + 600000]);

		// Insert legacy agent preference
		legacyDb.run(`
			INSERT INTO agent_preferences (agent_id, model, updated_at)
			VALUES (?, ?, ?)
		`, ['legacy-agent-1', 'claude-3-sonnet-20240229', now]);
	}

	describe('Legacy Database Migration', () => {
		it('should read existing SQLite database without configuration changes', async () => {
			// Test that the new system can read legacy data with default SQLite configuration
			const config: RuntimeConfig = {
				clientId: 'test-client',
				retry: { attempts: 3, delayMs: 1000, backoff: 2 },
				sessionDurationMs: 18000000,
				port: 8080,
				database: {
					provider: 'sqlite', // Default provider
					// No URL specified, should use default path resolution
				}
			};

			// Override the database path to use our legacy database
			const dbConfig = {
				provider: 'sqlite' as const,
				dbPath: legacyDbPath,
				walMode: true,
				busyTimeoutMs: 10000,
			};

			const drizzleOps = new DrizzleDatabaseOperations(dbConfig, config);
			await drizzleOps.waitForInitialization();
			const connection = drizzleOps.getConnection();
			const accountRepo = new DrizzleAccountRepository(connection, 'sqlite');

			// Should be able to read legacy accounts
			const accounts = await accountRepo.findAll();
			expect(accounts).toHaveLength(2);
			
			const account1 = accounts.find(acc => acc.name === 'Legacy Account 1');
			expect(account1).toBeDefined();
			expect(account1?.request_count).toBe(5);
			expect(account1?.total_requests).toBe(10);
			expect(account1?.paused).toBe(false);

			const account2 = accounts.find(acc => acc.name === 'Legacy Account 2');
			expect(account2).toBeDefined();
			expect(account2?.paused).toBe(true);

			await drizzleOps.close();
		});

		it('should handle missing strategies table gracefully', async () => {
			// The legacy database doesn't have a strategies table
			// Our new system should handle this gracefully
			const dbConfig = {
				provider: 'sqlite' as const,
				dbPath: legacyDbPath,
			};

			const drizzleOps = new DrizzleDatabaseOperations(dbConfig);
			await drizzleOps.waitForInitialization();

			// Should not throw an error even though strategies table is missing
			const stats = await drizzleOps.getDatabaseStats();
			expect(stats.connectionStatus).toBe(true);
			expect(stats.provider).toBe('sqlite');

			await drizzleOps.close();
		});

		it('should maintain data integrity during operations', async () => {
			const dbConfig = {
				provider: 'sqlite' as const,
				dbPath: legacyDbPath,
			};

			const drizzleOps = new DrizzleDatabaseOperations(dbConfig);
			await drizzleOps.waitForInitialization();
			const connection = drizzleOps.getConnection();
			const accountRepo = new DrizzleAccountRepository(connection, 'sqlite');

			// Read existing account
			const existingAccount = await accountRepo.findByName('Legacy Account 1');
			expect(existingAccount).toBeDefined();
			expect(existingAccount?.request_count).toBe(5);

			// Update the account using new repository
			await accountRepo.incrementRequestCount(existingAccount!.id);

			// Verify the update worked
			const updatedAccount = await accountRepo.findById(existingAccount!.id);
			expect(updatedAccount?.request_count).toBe(6);
			expect(updatedAccount?.total_requests).toBe(11);

			await drizzleOps.close();
		});

		it('should work with legacy DatabaseOperations side by side', async () => {
			// Test that both old and new systems can coexist
			const legacyOps = new DatabaseOperations();
			
			// Override the database path for legacy operations
			const originalDbPath = process.env.ccflare_DB_PATH;
			process.env.ccflare_DB_PATH = legacyDbPath;
			
			try {
				// Legacy system should work
				const legacyAccounts = legacyOps.getAllAccounts?.() || [];
				expect(legacyAccounts.length).toBeGreaterThan(0);

				// New system should also work with the same database
				const dbConfig = {
					provider: 'sqlite' as const,
					dbPath: legacyDbPath,
				};

				const drizzleOps = new DrizzleDatabaseOperations(dbConfig);
				await drizzleOps.waitForInitialization();
				const connection = drizzleOps.getConnection();
				const accountRepo = new DrizzleAccountRepository(connection, 'sqlite');

				const drizzleAccounts = await accountRepo.findAll();
				expect(drizzleAccounts.length).toBe(legacyAccounts.length);

				await drizzleOps.close();
			} finally {
				// Restore original environment
				if (originalDbPath) {
					process.env.ccflare_DB_PATH = originalDbPath;
				} else {
					delete process.env.ccflare_DB_PATH;
				}
				legacyOps.dispose();
			}
		});
	});

	describe('Configuration Compatibility', () => {
		it('should use SQLite by default when no provider specified', async () => {
			const config: RuntimeConfig = {
				clientId: 'test-client',
				retry: { attempts: 3, delayMs: 1000, backoff: 2 },
				sessionDurationMs: 18000000,
				port: 8080,
				// No database configuration - should default to SQLite
			};

			const drizzleOps = new DrizzleDatabaseOperations(undefined, config);
			await drizzleOps.waitForInitialization();
			expect(drizzleOps.getProvider()).toBe('sqlite');

			const stats = await drizzleOps.getDatabaseStats();
			expect(stats.provider).toBe('sqlite');
			expect(stats.connectionStatus).toBe(true);

			await drizzleOps.close();
		});

		it('should respect existing database configuration options', async () => {
			const config: RuntimeConfig = {
				clientId: 'test-client',
				retry: { attempts: 3, delayMs: 1000, backoff: 2 },
				sessionDurationMs: 18000000,
				port: 8080,
				database: {
					walMode: false, // Existing SQLite configuration should be preserved
					busyTimeoutMs: 5000,
					cacheSize: -20000,
					synchronous: 'NORMAL',
				}
			};

			const dbConfig = {
				provider: 'sqlite' as const,
				dbPath: legacyDbPath,
				walMode: config.database?.walMode,
				busyTimeoutMs: config.database?.busyTimeoutMs,
				cacheSize: config.database?.cacheSize,
				synchronous: config.database?.synchronous,
			};

			const drizzleOps = new DrizzleDatabaseOperations(dbConfig, config);
			await drizzleOps.waitForInitialization();

			// Should work with existing configuration
			const stats = await drizzleOps.getDatabaseStats();
			expect(stats.connectionStatus).toBe(true);

			await drizzleOps.close();
		});
	});

	describe('Environment Variable Compatibility', () => {
		it('should respect existing ccflare_DB_PATH environment variable', async () => {
			const originalDbPath = process.env.ccflare_DB_PATH;
			process.env.ccflare_DB_PATH = legacyDbPath;

			try {
				// Should use the environment variable path
				const drizzleOps = new DrizzleDatabaseOperations();
				await drizzleOps.waitForInitialization();
				const stats = await drizzleOps.getDatabaseStats();
				expect(stats.connectionStatus).toBe(true);

				await drizzleOps.close();
			} finally {
				// Restore original environment
				if (originalDbPath) {
					process.env.ccflare_DB_PATH = originalDbPath;
				} else {
					delete process.env.ccflare_DB_PATH;
				}
			}
		});

		it('should ignore new DATABASE_* environment variables when not set', async () => {
			// Ensure new environment variables are not set
			const originalProvider = process.env.DATABASE_PROVIDER;
			const originalUrl = process.env.DATABASE_URL;
			
			delete process.env.DATABASE_PROVIDER;
			delete process.env.DATABASE_URL;

			try {
				const drizzleOps = new DrizzleDatabaseOperations();
				await drizzleOps.waitForInitialization();

				// Should default to SQLite
				expect(drizzleOps.getProvider()).toBe('sqlite');

				await drizzleOps.close();
			} finally {
				// Restore original environment
				if (originalProvider) process.env.DATABASE_PROVIDER = originalProvider;
				if (originalUrl) process.env.DATABASE_URL = originalUrl;
			}
		});
	});
});
