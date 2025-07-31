import { count, sum, avg, eq, desc, sql } from "drizzle-orm";
import type { DatabaseConnection } from "../providers/database-provider";
import type { DatabaseProvider } from "@ccflare/config";
import { DrizzleBaseRepository } from "./drizzle-base.repository";
import { requestsSqlite, requestsPostgreSQL, requestsMySQL } from "../schema/requests";
import { accountsSqlite, accountsPostgreSQL, accountsMySQL } from "../schema/accounts";
import { NO_ACCOUNT_ID } from "@ccflare/types";

export interface AccountStats {
	name: string;
	requestCount: number;
	successRate: number;
	totalRequests?: number;
}

export interface AggregatedStats {
	totalRequests: number;
	successfulRequests: number;
	avgResponseTime: number;
	totalTokens: number;
	totalCostUsd: number;
	inputTokens: number;
	outputTokens: number;
	cacheReadInputTokens: number;
	cacheCreationInputTokens: number;
	avgTokensPerSecond: number | null;
}

export class DrizzleStatsRepository extends DrizzleBaseRepository<any> {
	constructor(connection: DatabaseConnection, provider: DatabaseProvider) {
		super(connection, provider);
	}

	/**
	 * Get aggregated statistics for all requests
	 */
	async getAggregatedStats(): Promise<AggregatedStats> {
		const requestsTable = this.getRequestsTable();
		
		const result = await (this.db as any)
			.select({
				totalRequests: count(),
				successfulRequests: sum(sql`CASE WHEN ${requestsTable.success} = true THEN 1 ELSE 0 END`),
				avgResponseTime: avg(requestsTable.responseTimeMs),
				inputTokens: sum(requestsTable.inputTokens),
				outputTokens: sum(requestsTable.outputTokens),
				cacheCreationInputTokens: sum(requestsTable.cacheCreationInputTokens),
				cacheReadInputTokens: sum(requestsTable.cacheReadInputTokens),
				totalCostUsd: sum(requestsTable.costUsd),
				avgTokensPerSecond: avg(requestsTable.outputTokensPerSecond)
			})
			.from(requestsTable);

		const stats = result[0];
		
		// Calculate total tokens
		const totalTokens = 
			(Number(stats.inputTokens) || 0) +
			(Number(stats.outputTokens) || 0) +
			(Number(stats.cacheCreationInputTokens) || 0) +
			(Number(stats.cacheReadInputTokens) || 0);

		return {
			totalRequests: Number(stats.totalRequests) || 0,
			successfulRequests: Number(stats.successfulRequests) || 0,
			avgResponseTime: Number(stats.avgResponseTime) || 0,
			totalTokens,
			totalCostUsd: Number(stats.totalCostUsd) || 0,
			inputTokens: Number(stats.inputTokens) || 0,
			outputTokens: Number(stats.outputTokens) || 0,
			cacheReadInputTokens: Number(stats.cacheReadInputTokens) || 0,
			cacheCreationInputTokens: Number(stats.cacheCreationInputTokens) || 0,
			avgTokensPerSecond: stats.avgTokensPerSecond ? Number(stats.avgTokensPerSecond) : null,
		};
	}

	/**
	 * Get account statistics with success rates
	 * Maintains compatibility with legacy interface
	 */
	async getAccountStats(limit = 10, includeUnauthenticated = true): Promise<AccountStats[]> {
		const requestsTable = this.getRequestsTable();
		const accountsTable = this.getAccountsTable();

		// Build query based on includeUnauthenticated parameter
		let query;
		if (includeUnauthenticated) {
			// Include unauthenticated requests (similar to legacy behavior)
			query = (this.db as any)
				.select({
					id: sql`COALESCE(${accountsTable.id}, ${NO_ACCOUNT_ID})`.as('id'),
					name: sql`COALESCE(${accountsTable.name}, 'Unauthenticated')`.as('name'),
					requestCount: count(requestsTable.id),
					successfulRequests: sum(sql`CASE WHEN ${requestsTable.success} = true THEN 1 ELSE 0 END`),
					totalRequests: sql`COALESCE(${accountsTable.totalRequests}, 0)`.as('totalRequests')
				})
				.from(requestsTable)
				.leftJoin(accountsTable, eq(requestsTable.accountUsed, accountsTable.id))
				.groupBy(
					sql`COALESCE(${accountsTable.id}, ${NO_ACCOUNT_ID})`,
					sql`COALESCE(${accountsTable.name}, 'Unauthenticated')`,
					sql`COALESCE(${accountsTable.totalRequests}, 0)`
				)
				.having(sql`COUNT(${requestsTable.id}) > 0`)
				.orderBy(desc(count(requestsTable.id)))
				.limit(limit);
		} else {
			// Only authenticated accounts
			query = (this.db as any)
				.select({
					id: accountsTable.id,
					name: accountsTable.name,
					requestCount: accountsTable.requestCount,
					successfulRequests: sum(sql`CASE WHEN ${requestsTable.success} = true THEN 1 ELSE 0 END`),
					totalRequests: accountsTable.totalRequests
				})
				.from(accountsTable)
				.leftJoin(requestsTable, eq(requestsTable.accountUsed, accountsTable.id))
				.where(sql`${accountsTable.requestCount} > 0`)
				.groupBy(accountsTable.id, accountsTable.name, accountsTable.requestCount, accountsTable.totalRequests)
				.orderBy(desc(accountsTable.requestCount))
				.limit(limit);
		}

		const results = await query;

		return results.map((row: any) => ({
			name: row.name || 'Unauthenticated',
			requestCount: Number(row.requestCount) || 0,
			successRate: row.requestCount ?
				Math.round(((Number(row.successfulRequests) || 0) / Number(row.requestCount)) * 100) : 0,
			totalRequests: Number(row.totalRequests) || 0
		}));
	}

	/**
	 * Get active account count
	 */
	async getActiveAccountCount(): Promise<number> {
		const accountsTable = this.getAccountsTable();
		
		const result = await (this.db as any)
			.select({ count: count() })
			.from(accountsTable)
			.where(eq(accountsTable.paused, false));

		return Number(result[0]?.count) || 0;
	}

	/**
	 * Get recent errors
	 * Returns string array for compatibility with legacy interface
	 */
	async getRecentErrors(limit = 10): Promise<string[]> {
		const requestsTable = this.getRequestsTable();

		const results = await (this.db as any)
			.select({
				errorMessage: requestsTable.errorMessage
			})
			.from(requestsTable)
			.where(sql`${requestsTable.success} = false AND ${requestsTable.errorMessage} IS NOT NULL AND ${requestsTable.errorMessage} != ''`)
			.orderBy(desc(requestsTable.timestamp))
			.limit(limit);

		return results.map((row: any) => row.errorMessage || 'Unknown error');
	}

	/**
	 * Get top models by usage
	 */
	async getTopModels(limit = 5): Promise<Array<{
		model: string;
		requestCount: number;
		totalTokens: number;
	}>> {
		const requestsTable = this.getRequestsTable();

		const results = await (this.db as any)
			.select({
				model: requestsTable.model,
				requestCount: count(),
				totalTokens: sum(requestsTable.totalTokens)
			})
			.from(requestsTable)
			.where(sql`${requestsTable.model} IS NOT NULL`)
			.groupBy(requestsTable.model)
			.orderBy(desc(count()))
			.limit(limit);

		return results.map((row: any) => ({
			model: row.model || 'Unknown',
			requestCount: Number(row.requestCount) || 0,
			totalTokens: Number(row.totalTokens) || 0
		}));
	}

	/**
	 * Get the appropriate requests table for the current provider
	 */
	private getRequestsTable() {
		switch (this.provider) {
			case 'sqlite': return requestsSqlite;
			case 'postgresql': return requestsPostgreSQL;
			case 'mysql': return requestsMySQL;
			default: throw new Error(`Unsupported provider: ${this.provider}`);
		}
	}

	/**
	 * Get the appropriate accounts table for the current provider
	 */
	private getAccountsTable() {
		switch (this.provider) {
			case 'sqlite': return accountsSqlite;
			case 'postgresql': return accountsPostgreSQL;
			case 'mysql': return accountsMySQL;
			default: throw new Error(`Unsupported provider: ${this.provider}`);
		}
	}
}
