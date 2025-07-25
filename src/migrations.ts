import type { Database } from "bun:sqlite";

export function ensureSchema(db: Database): void {
	// Create accounts table
	db.run(`
		CREATE TABLE IF NOT EXISTS accounts (
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

	// Create requests table
	db.run(`
		CREATE TABLE IF NOT EXISTS requests (
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

	// Create index for faster queries
	db.run(
		`CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON requests(timestamp DESC)`,
	);
}

export function runMigrations(db: Database): void {
	// Ensure base schema exists first
	ensureSchema(db);
	// Check if columns exist before adding them
	const accountsInfo = db
		.prepare("PRAGMA table_info(accounts)")
		.all() as Array<{
		cid: number;
		name: string;
		type: string;
		notnull: number;
		// biome-ignore lint/suspicious/noExplicitAny: SQLite pragma can return various default value types
		dflt_value: any;
		pk: number;
	}>;

	const columnNames = accountsInfo.map((col) => col.name);

	// Add rate_limited_until column if it doesn't exist
	if (!columnNames.includes("rate_limited_until")) {
		db.prepare(
			"ALTER TABLE accounts ADD COLUMN rate_limited_until INTEGER",
		).run();
		console.log("Added rate_limited_until column to accounts table");
	}

	// Add session_start column if it doesn't exist
	if (!columnNames.includes("session_start")) {
		db.prepare("ALTER TABLE accounts ADD COLUMN session_start INTEGER").run();
		console.log("Added session_start column to accounts table");
	}

	// Add session_request_count column if it doesn't exist
	if (!columnNames.includes("session_request_count")) {
		db.prepare(
			"ALTER TABLE accounts ADD COLUMN session_request_count INTEGER DEFAULT 0",
		).run();
		console.log("Added session_request_count column to accounts table");
	}

	// Add account_tier column if it doesn't exist
	if (!columnNames.includes("account_tier")) {
		db.prepare(
			"ALTER TABLE accounts ADD COLUMN account_tier INTEGER DEFAULT 1",
		).run();
		console.log("Added account_tier column to accounts table");
	}
}
