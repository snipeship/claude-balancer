import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { randomUUID } from "crypto";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { DatabaseProvider } from "@ccflare/config";
import type { DatabaseConnection } from "../providers/database-provider";
import { DatabaseProviderFactory } from "../providers/database-factory";
import { runDrizzleMigrations, createInitialSchema } from "../migrations/drizzle-migrations";
import { MigrationCompatibility } from "../migrations/migration-compatibility";
import { ensureSchema, runMigrations } from "../migrations";

describe("Migration System Tests", () => {
	let testDbPath: string;
	let connection: DatabaseConnection;

	beforeEach(() => {
		testDbPath = join(tmpdir(), `test-migration-${randomUUID()}.db`);
	});

	afterEach(async () => {
		if (connection) {
			await connection.close();
		}
		try {
			await unlink(testDbPath);
		} catch {
			// Ignore if file doesn't exist
		}
	});

	describe("Fresh Database Creation", () => {
		it("should create fresh schema using Drizzle migrations", async () => {
			// Create fresh database connection
			connection = DatabaseProviderFactory.createConnection({
				provider: 'sqlite',
				dbPath: testDbPath,
			});

			// Run Drizzle migrations
			await runDrizzleMigrations(connection, 'sqlite');

			// Verify all tables exist
			const tables = await connection.query("SELECT name FROM sqlite_master WHERE type='table'");
			const tableNames = tables.map((t: any) => t.name);

			expect(tableNames).toContain('accounts');
			expect(tableNames).toContain('requests');
			expect(tableNames).toContain('oauth_sessions');
			expect(tableNames).toContain('agent_preferences');
			expect(tableNames).toContain('request_payloads');

			// NOTE: strategies table is intentionally excluded following upstream maintainer's decision
			expect(tableNames).not.toContain('strategies');

			// Verify accounts table structure
			const accountsColumns = await connection.query("PRAGMA table_info(accounts)");
			const accountsColumnNames = accountsColumns.map((col: any) => col.name);

			expect(accountsColumnNames).toContain('id');
			expect(accountsColumnNames).toContain('name');
			expect(accountsColumnNames).toContain('provider');
			expect(accountsColumnNames).toContain('rate_limited_until');
			expect(accountsColumnNames).toContain('session_request_count');
			expect(accountsColumnNames).toContain('paused');
		});

		it("should create schema using createInitialSchema", async () => {
			connection = DatabaseProviderFactory.createConnection({
				provider: 'sqlite',
				dbPath: testDbPath,
			});

			await createInitialSchema(connection, 'sqlite');

			// Verify schema exists
			const tables = await connection.query("SELECT name FROM sqlite_master WHERE type='table'");
			expect(tables.length).toBeGreaterThan(0);
		});
	});

	describe("Legacy Database Migration", () => {
		it("should detect legacy schema", async () => {
			// Create legacy database using old migration system
			const legacyDb = new Database(testDbPath, { create: true });
			ensureSchema(legacyDb);
			legacyDb.close();

			// Create connection to legacy database
			connection = DatabaseProviderFactory.createConnection({
				provider: 'sqlite',
				dbPath: testDbPath,
			});

			// Should detect legacy schema
			const hasLegacy = await MigrationCompatibility.hasLegacySchema(connection, 'sqlite');
			expect(hasLegacy).toBe(true);
		});

		it("should apply legacy migrations to bring old schema up to date", async () => {
			// Create minimal legacy database (missing newer columns)
			const legacyDb = new Database(testDbPath, { create: true });
			
			// Create basic accounts table without newer columns
			legacyDb.run(`
				CREATE TABLE accounts (
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
					account_tier INTEGER DEFAULT 1
				)
			`);

			// Create basic requests table without newer columns
			legacyDb.run(`
				CREATE TABLE requests (
					id TEXT PRIMARY KEY,
					timestamp INTEGER NOT NULL,
					method TEXT NOT NULL,
					path TEXT NOT NULL,
					account_used TEXT,
					status_code INTEGER,
					success BOOLEAN,
					error_message TEXT,
					response_time_ms INTEGER,
					failover_attempts INTEGER DEFAULT 0
				)
			`);

			legacyDb.close();

			// Create connection and apply legacy migrations
			connection = DatabaseProviderFactory.createConnection({
				provider: 'sqlite',
				dbPath: testDbPath,
			});

			await MigrationCompatibility.applyLegacyMigrations(connection, 'sqlite');

			// Verify missing columns were added
			const accountsColumns = await connection.query("PRAGMA table_info(accounts)");
			const accountsColumnNames = accountsColumns.map((col: any) => col.name);

			expect(accountsColumnNames).toContain('rate_limited_until');
			expect(accountsColumnNames).toContain('session_start');
			expect(accountsColumnNames).toContain('session_request_count');
			expect(accountsColumnNames).toContain('paused');
			expect(accountsColumnNames).toContain('rate_limit_reset');
			expect(accountsColumnNames).toContain('rate_limit_status');
			expect(accountsColumnNames).toContain('rate_limit_remaining');

			const requestsColumns = await connection.query("PRAGMA table_info(requests)");
			const requestsColumnNames = requestsColumns.map((col: any) => col.name);

			expect(requestsColumnNames).toContain('model');
			expect(requestsColumnNames).toContain('prompt_tokens');
			expect(requestsColumnNames).toContain('completion_tokens');
			expect(requestsColumnNames).toContain('total_tokens');
			expect(requestsColumnNames).toContain('cost_usd');
			expect(requestsColumnNames).toContain('agent_used');

			// Verify missing tables were created
			const tables = await connection.query("SELECT name FROM sqlite_master WHERE type='table'");
			const tableNames = tables.map((t: any) => t.name);

			expect(tableNames).toContain('oauth_sessions');
			expect(tableNames).toContain('agent_preferences');
			expect(tableNames).toContain('request_payloads');

			// NOTE: strategies table is intentionally not created following upstream maintainer's decision
			expect(tableNames).not.toContain('strategies');
		});

		it("should handle full legacy migration through runDrizzleMigrations", async () => {
			// Create legacy database using old system
			const legacyDb = new Database(testDbPath, { create: true });
			ensureSchema(legacyDb);
			runMigrations(legacyDb);
			legacyDb.close();

			// Create connection and run Drizzle migrations
			connection = DatabaseProviderFactory.createConnection({
				provider: 'sqlite',
				dbPath: testDbPath,
			});

			// Should detect legacy and apply compatibility migrations
			await runDrizzleMigrations(connection, 'sqlite');

			// Verify all expected tables and columns exist
			const tables = await connection.query("SELECT name FROM sqlite_master WHERE type='table'");
			const tableNames = tables.map((t: any) => t.name);

			expect(tableNames).toContain('accounts');
			expect(tableNames).toContain('requests');
			expect(tableNames).toContain('oauth_sessions');
			expect(tableNames).toContain('agent_preferences');
			expect(tableNames).toContain('request_payloads');

			// NOTE: strategies table is intentionally NOT created for legacy databases
			// This follows the upstream maintainer's decision not to implement it in the old system
			expect(tableNames).not.toContain('strategies');

			// Verify all modern columns exist
			const accountsColumns = await connection.query("PRAGMA table_info(accounts)");
			const accountsColumnNames = accountsColumns.map((col: any) => col.name);

			expect(accountsColumnNames).toContain('rate_limited_until');
			expect(accountsColumnNames).toContain('session_request_count');
			expect(accountsColumnNames).toContain('paused');
		});
	});

	describe("Migration Compatibility", () => {
		it("should not detect legacy schema on fresh database", async () => {
			connection = DatabaseProviderFactory.createConnection({
				provider: 'sqlite',
				dbPath: testDbPath,
			});

			const hasLegacy = await MigrationCompatibility.hasLegacySchema(connection, 'sqlite');
			expect(hasLegacy).toBe(false);
		});

		it("should preserve existing data during migration", async () => {
			// Create legacy database with test data
			const legacyDb = new Database(testDbPath, { create: true });
			ensureSchema(legacyDb);
			
			// Insert test account
			legacyDb.run(`
				INSERT INTO accounts (id, name, provider, refresh_token, created_at)
				VALUES ('test-id', 'test-account', 'anthropic', 'test-token', ${Date.now()})
			`);

			legacyDb.close();

			// Apply migrations
			connection = DatabaseProviderFactory.createConnection({
				provider: 'sqlite',
				dbPath: testDbPath,
			});

			await runDrizzleMigrations(connection, 'sqlite');

			// Verify data is preserved
			const accounts = await connection.query("SELECT * FROM accounts WHERE id = 'test-id'");
			expect(accounts.length).toBe(1);
			expect(accounts[0].name).toBe('test-account');
			expect(accounts[0].provider).toBe('anthropic');
		});
	});
});
