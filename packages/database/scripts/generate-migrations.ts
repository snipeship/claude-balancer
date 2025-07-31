#!/usr/bin/env bun

/**
 * Generate Drizzle migration files for all supported database providers
 * This script creates migration files for SQLite, PostgreSQL, and MySQL
 */

import { execSync } from "child_process";
import { Logger } from "@ccflare/logger";

const log = new Logger("MigrationGenerator");

async function generateMigrations() {
	log.info("Generating Drizzle migration files for all providers...");

	try {
		// Generate SQLite migrations
		log.info("Generating SQLite migrations...");
		execSync("bunx drizzle-kit generate --config=drizzle.config.ts", {
			cwd: process.cwd(),
			stdio: "inherit",
		});

		// Generate PostgreSQL migrations
		log.info("Generating PostgreSQL migrations...");
		execSync("bunx drizzle-kit generate --config=drizzle.config.postgresql.ts", {
			cwd: process.cwd(),
			stdio: "inherit",
		});

		// Generate MySQL migrations
		log.info("Generating MySQL migrations...");
		execSync("bunx drizzle-kit generate --config=drizzle.config.mysql.ts", {
			cwd: process.cwd(),
			stdio: "inherit",
		});

		log.info("✅ All migration files generated successfully!");
		log.info("Migration files created in:");
		log.info("  - src/migrations/generated (SQLite)");
		log.info("  - src/migrations/generated-postgresql (PostgreSQL)");
		log.info("  - src/migrations/generated-mysql (MySQL)");

	} catch (error) {
		log.error("❌ Failed to generate migration files:", error);
		process.exit(1);
	}
}

// Run if called directly
if (import.meta.main) {
	generateMigrations();
}
