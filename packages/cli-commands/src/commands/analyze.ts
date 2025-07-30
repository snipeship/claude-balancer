import type { Database } from "bun:sqlite";
import { TIME_CONSTANTS } from "@ccflare/core";
import { analyzeIndexUsage } from "@ccflare/database";

/**
 * Analyze query performance and index usage
 */
export function analyzePerformance(db: Database): void {
	console.log("\n=== Database Performance Analysis ===\n");

	// Basic index usage analysis
	analyzeIndexUsage(db);

	// Show detailed query performance for common patterns
	console.log("\n=== Query Performance Metrics ===\n");

	const performanceQueries = [
		{
			name: "Recent requests (last 24h)",
			query: `
				SELECT COUNT(*) as count 
				FROM requests 
				WHERE timestamp > ?
			`,
			params: [Date.now() - TIME_CONSTANTS.DAY],
		},
		{
			name: "Active accounts",
			query: `
				SELECT COUNT(*) as count 
				FROM accounts 
				WHERE paused = 0
			`,
			params: [],
		},
		{
			name: "Model usage distribution",
			query: `
				SELECT model, COUNT(*) as count 
				FROM requests 
				WHERE model IS NOT NULL AND timestamp > ? 
				GROUP BY model 
				ORDER BY count DESC 
				LIMIT 5
			`,
			params: [Date.now() - TIME_CONSTANTS.DAY],
		},
	];

	for (const test of performanceQueries) {
		try {
			const start = performance.now();
			const stmt = db.prepare(test.query);
			const result = stmt.all(...test.params);
			const duration = performance.now() - start;

			console.log(`${test.name}:`);
			console.log(`  Time: ${duration.toFixed(2)}ms`);
			console.log(`  Results: ${JSON.stringify(result)}\n`);
		} catch (error) {
			console.error(`${test.name}: Error - ${error}`);
		}
	}

	// Check if statistics need updating
	console.log("=== Index Optimization Status ===\n");

	// Get last ANALYZE time
	const lastAnalyze = db
		.prepare(`
		SELECT * FROM sqlite_stat1 LIMIT 1
	`)
		.get();

	if (!lastAnalyze) {
		console.log("⚠️  No index statistics found. Running ANALYZE...");
		db.exec("ANALYZE");
		console.log("✓ Index statistics updated");
	} else {
		console.log("✓ Index statistics are available");
	}

	// Show index coverage
	const indexedColumns = db
		.prepare(`
		SELECT 
			m.tbl_name as table_name,
			COUNT(DISTINCT m.name) as index_count
		FROM sqlite_master m
		WHERE m.type = 'index' 
			AND m.name NOT LIKE 'sqlite_%'
			AND m.sql IS NOT NULL
		GROUP BY m.tbl_name
	`)
		.all() as Array<{ table_name: string; index_count: number }>;

	console.log("\n=== Index Coverage ===\n");
	for (const table of indexedColumns) {
		console.log(`${table.table_name}: ${table.index_count} indexes`);
	}

	console.log("\n✓ Analysis complete");
}
