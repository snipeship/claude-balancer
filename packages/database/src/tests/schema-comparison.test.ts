import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { randomUUID } from "crypto";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseProviderFactory } from "../providers/database-factory";
import { runDrizzleMigrations } from "../migrations/drizzle-migrations";
import { ensureSchema, runMigrations } from "../migrations";

describe("Schema Comparison Tests", () => {
	let oldDbPath: string;
	let newDbPath: string;

	beforeEach(() => {
		oldDbPath = join(tmpdir(), `test-old-${randomUUID()}.db`);
		newDbPath = join(tmpdir(), `test-new-${randomUUID()}.db`);
	});

	afterEach(async () => {
		try {
			await unlink(oldDbPath);
			await unlink(newDbPath);
		} catch {
			// Ignore if files don't exist
		}
	});

	it("should compare old migration system vs new Drizzle schema", async () => {
		// Create database with OLD migration system
		const oldDb = new Database(oldDbPath, { create: true });
		ensureSchema(oldDb);
		runMigrations(oldDb);
		
		// Get old schema tables and columns
		const oldTables = oldDb.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as Array<{name: string}>;
		const oldTableNames = oldTables.map(t => t.name);
		
		console.log("OLD MIGRATION SYSTEM TABLES:", oldTableNames);
		
		// Get accounts table structure from old system
		const oldAccountsColumns = oldDb.prepare("PRAGMA table_info(accounts)").all() as Array<{name: string, type: string}>;
		console.log("OLD ACCOUNTS COLUMNS:", oldAccountsColumns.map(c => `${c.name}: ${c.type}`));
		
		// Get requests table structure from old system
		const oldRequestsColumns = oldDb.prepare("PRAGMA table_info(requests)").all() as Array<{name: string, type: string}>;
		console.log("OLD REQUESTS COLUMNS:", oldRequestsColumns.map(c => `${c.name}: ${c.type}`));
		
		oldDb.close();

		// Create database with NEW Drizzle migration system
		const newConnection = DatabaseProviderFactory.createConnection({
			provider: 'sqlite',
			dbPath: newDbPath,
		});

		await runDrizzleMigrations(newConnection, 'sqlite');

		// Get new schema tables and columns
		const newTables = await newConnection.query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
		const newTableNames = newTables.map((t: any) => t.name);
		
		console.log("NEW DRIZZLE SYSTEM TABLES:", newTableNames);
		
		// Get accounts table structure from new system
		const newAccountsColumns = await newConnection.query("PRAGMA table_info(accounts)");
		console.log("NEW ACCOUNTS COLUMNS:", newAccountsColumns.map((c: any) => `${c.name}: ${c.type}`));
		
		// Get requests table structure from new system
		const newRequestsColumns = await newConnection.query("PRAGMA table_info(requests)");
		console.log("NEW REQUESTS COLUMNS:", newRequestsColumns.map((c: any) => `${c.name}: ${c.type}`));

		await newConnection.close();

		// Compare table lists
		console.log("MISSING IN OLD:", newTableNames.filter(name => !oldTableNames.includes(name)));
		console.log("MISSING IN NEW:", oldTableNames.filter(name => !newTableNames.includes(name)));

		// Compare accounts columns
		const oldAccountsColumnNames = oldAccountsColumns.map(c => c.name);
		const newAccountsColumnNames = newAccountsColumns.map((c: any) => c.name);
		
		console.log("ACCOUNTS - MISSING IN OLD:", newAccountsColumnNames.filter(name => !oldAccountsColumnNames.includes(name)));
		console.log("ACCOUNTS - MISSING IN NEW:", oldAccountsColumnNames.filter(name => !newAccountsColumnNames.includes(name)));

		// Compare requests columns
		const oldRequestsColumnNames = oldRequestsColumns.map(c => c.name);
		const newRequestsColumnNames = newRequestsColumns.map((c: any) => c.name);
		
		console.log("REQUESTS - MISSING IN OLD:", newRequestsColumnNames.filter(name => !oldRequestsColumnNames.includes(name)));
		console.log("REQUESTS - MISSING IN NEW:", oldRequestsColumnNames.filter(name => !newRequestsColumnNames.includes(name)));

		// Verify critical tables exist in both
		expect(oldTableNames).toContain('accounts');
		expect(oldTableNames).toContain('requests');
		expect(oldTableNames).toContain('oauth_sessions');
		expect(oldTableNames).toContain('agent_preferences');
		expect(oldTableNames).toContain('request_payloads');
		
		expect(newTableNames).toContain('accounts');
		expect(newTableNames).toContain('requests');
		expect(newTableNames).toContain('oauth_sessions');
		expect(newTableNames).toContain('agent_preferences');
		expect(newTableNames).toContain('request_payloads');

		// NOTE: strategies table is intentionally excluded from both old and new systems
		expect(newTableNames).not.toContain('strategies');

		// Check if strategies table is missing from old system
		if (!oldTableNames.includes('strategies')) {
			console.log("⚠️  STRATEGIES TABLE MISSING FROM OLD MIGRATION SYSTEM!");
		}
	});
});
