import type { Database } from "bun:sqlite";
import type { Config } from "@ccflare/config";
import type { DatabaseOperations } from "@ccflare/database";
import { jsonResponse } from "@ccflare/http-common";
import type { HealthResponse, DatabaseHealthResponse } from "../types";

/**
 * Create a health check handler (legacy - works with SQLite Database)
 * @deprecated Use createDatabaseHealthHandler instead for better database provider support
 */
export function createHealthHandler(db: Database, config: Config) {
	return (): Response => {
		try {
			// Use a simple query to test database connectivity
			const accountCount = db
				.query("SELECT COUNT(*) as count FROM accounts")
				.get() as { count: number } | undefined;

			const response: HealthResponse = {
				status: "ok",
				accounts: accountCount?.count || 0,
				timestamp: new Date().toISOString(),
				strategy: config.getStrategy(),
			};

			return jsonResponse(response);
		} catch (error) {
			const response: HealthResponse = {
				status: "error",
				accounts: 0,
				timestamp: new Date().toISOString(),
				strategy: config.getStrategy(),
			};

			return jsonResponse(response, 503);
		}
	};
}

/**
 * Create a database health check handler (works with new database provider system)
 */
export function createDatabaseHealthHandler(dbOps: DatabaseOperations) {
	return async (): Promise<Response> => {
		try {
			// Get database statistics
			const stats = await (dbOps as any).getDatabaseStats?.();

			// Fallback for legacy DatabaseOperations
			if (!stats) {
				const accounts = dbOps.getAllAccounts?.() || [];
				const response: DatabaseHealthResponse = {
					status: "healthy",
					provider: "sqlite", // Legacy system uses SQLite
					connectionStatus: true,
					tablesCount: 6, // Known table count for legacy system
					accounts: accounts.length,
					timestamp: new Date().toISOString(),
				};
				return jsonResponse(response);
			}

			const response: DatabaseHealthResponse = {
				status: stats.connectionStatus ? "healthy" : "unhealthy",
				provider: stats.provider,
				connectionStatus: stats.connectionStatus,
				tablesCount: stats.tablesCount,
				accounts: 0, // Will be populated if we can query accounts
				timestamp: new Date().toISOString(),
			};

			// Try to get account count if connection is healthy
			if (stats.connectionStatus) {
				try {
					const accounts = dbOps.getAllAccounts?.() || [];
					response.accounts = accounts.length;
				} catch (error) {
					// Account query failed, but database connection is still considered healthy
					response.accounts = 0;
				}
			}

			return jsonResponse(response);
		} catch (error) {
			const response: DatabaseHealthResponse = {
				status: "unhealthy",
				provider: "unknown",
				connectionStatus: false,
				tablesCount: 0,
				accounts: 0,
				timestamp: new Date().toISOString(),
				error: error instanceof Error ? error.message : "Unknown error",
			};

			return jsonResponse(response, 503);
		}
	};
}
