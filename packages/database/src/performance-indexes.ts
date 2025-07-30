import type { Database } from "bun:sqlite";
import { Logger } from "@ccflare/logger";

const log = new Logger("PerformanceIndexes");

/**
 * Add performance indexes to improve query performance
 * This migration adds indexes based on common query patterns in the application
 */
export function addPerformanceIndexes(db: Database): void {
	log.info("Adding performance indexes...");

	// 1. Composite index on requests(timestamp, account_used) for time-based account queries
	// Used in analytics for filtering by time range and account
	db.run(`
		CREATE INDEX IF NOT EXISTS idx_requests_timestamp_account 
		ON requests(timestamp DESC, account_used)
	`);
	log.info("Added index: idx_requests_timestamp_account");

	// 2. Index on requests(model, timestamp) for model analytics
	// Used in model distribution and performance queries
	db.run(`
		CREATE INDEX IF NOT EXISTS idx_requests_model_timestamp 
		ON requests(model, timestamp DESC) 
		WHERE model IS NOT NULL
	`);
	log.info("Added index: idx_requests_model_timestamp");

	// 3. Index on requests(success, timestamp) for success rate calculations
	// Used in analytics for calculating success rates over time
	db.run(`
		CREATE INDEX IF NOT EXISTS idx_requests_success_timestamp 
		ON requests(success, timestamp DESC)
	`);
	log.info("Added index: idx_requests_success_timestamp");

	// 4. Index on accounts(paused) for finding active accounts
	// Used in load balancer to quickly filter active accounts
	db.run(`
		CREATE INDEX IF NOT EXISTS idx_accounts_paused 
		ON accounts(paused) 
		WHERE paused = 0
	`);
	log.info("Added index: idx_accounts_paused");

	// 5. Index on requests(account_used, timestamp) for per-account analytics
	// Used in account performance queries
	db.run(`
		CREATE INDEX IF NOT EXISTS idx_requests_account_timestamp 
		ON requests(account_used, timestamp DESC)
	`);
	log.info("Added index: idx_requests_account_timestamp");

	// 6. Additional indexes based on observed query patterns

	// Index for cost analysis queries
	db.run(`
		CREATE INDEX IF NOT EXISTS idx_requests_cost_model 
		ON requests(cost_usd, model, timestamp DESC) 
		WHERE cost_usd > 0 AND model IS NOT NULL
	`);
	log.info("Added index: idx_requests_cost_model");

	// Index for response time analysis (for p95 calculations)
	db.run(`
		CREATE INDEX IF NOT EXISTS idx_requests_response_time 
		ON requests(model, response_time_ms) 
		WHERE response_time_ms IS NOT NULL AND model IS NOT NULL
	`);
	log.info("Added index: idx_requests_response_time");

	// Index for token usage analysis
	db.run(`
		CREATE INDEX IF NOT EXISTS idx_requests_tokens 
		ON requests(timestamp DESC, total_tokens) 
		WHERE total_tokens > 0
	`);
	log.info("Added index: idx_requests_tokens");

	// Index for account name lookups (used in analytics joins)
	db.run(`
		CREATE INDEX IF NOT EXISTS idx_accounts_name 
		ON accounts(name)
	`);
	log.info("Added index: idx_accounts_name");

	// Index for rate limit checks
	db.run(`
		CREATE INDEX IF NOT EXISTS idx_accounts_rate_limited 
		ON accounts(rate_limited_until) 
		WHERE rate_limited_until IS NOT NULL
	`);
	log.info("Added index: idx_accounts_rate_limited");

	// Index for session management
	db.run(`
		CREATE INDEX IF NOT EXISTS idx_accounts_session 
		ON accounts(session_start, session_request_count) 
		WHERE session_start IS NOT NULL
	`);
	log.info("Added index: idx_accounts_session");

	// Composite index for account ordering in load balancer
	db.run(`
		CREATE INDEX IF NOT EXISTS idx_accounts_request_count 
		ON accounts(request_count DESC, last_used)
	`);
	log.info("Added index: idx_accounts_request_count");

	log.info("Performance indexes added successfully");
}

/**
 * Analyze current index usage and suggest optimizations
 */
export function analyzeIndexUsage(db: Database): void {
	log.info("\nAnalyzing index usage...");

	// Get all indexes
	const indexes = db
		.prepare(
			`SELECT name, tbl_name, sql 
			FROM sqlite_master 
			WHERE type = 'index' AND name NOT LIKE 'sqlite_%'
			ORDER BY tbl_name, name`,
		)
		.all() as Array<{ name: string; tbl_name: string; sql: string }>;

	log.info(`\nTotal indexes: ${indexes.length}`);
	for (const index of indexes) {
		log.info(`- ${index.name} on ${index.tbl_name}`);
	}

	// Analyze table statistics
	const tables = ["accounts", "requests", "request_payloads"];
	for (const table of tables) {
		const count = db
			.prepare(`SELECT COUNT(*) as count FROM ${table}`)
			.get() as { count: number };
		log.info(`\n${table} table: ${count.count} rows`);
	}
}
