import { eq, desc, count, sum, avg, sql } from "drizzle-orm";
import type { DatabaseConnection } from "../providers/database-provider";
import type { DatabaseProvider } from "@ccflare/config";
import { DrizzleBaseRepository } from "./drizzle-base.repository";
import { requestsSqlite, requestsPostgreSQL, requestsMySQL } from "../schema/requests";
import { requestPayloadsSqlite, requestPayloadsPostgreSQL, requestPayloadsMySQL } from "../schema/request-payloads";
import { accountsSqlite, accountsPostgreSQL, accountsMySQL } from "../schema/accounts";

export interface RequestData {
	id: string;
	method: string;
	path: string;
	accountUsed: string | null;
	statusCode: number | null;
	success: boolean;
	errorMessage: string | null;
	responseTime: number;
	failoverAttempts: number;
	agentUsed?: string;
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
		tokensPerSecond?: number;
	};
}

export class DrizzleRequestRepository extends DrizzleBaseRepository<any> {
	constructor(connection: DatabaseConnection, provider: DatabaseProvider) {
		super(connection, provider);
	}

	/**
	 * Save request metadata
	 */
	async saveMeta(
		id: string,
		method: string,
		path: string,
		accountUsed: string | null,
		statusCode: number | null,
		timestamp?: number
	): Promise<void> {
		const requestsTable = this.getRequestsTable();
		
		await (this.db as any).insert(requestsTable).values({
			id,
			timestamp: timestamp ? new Date(timestamp) : new Date(),
			method,
			path,
			accountUsed,
			statusCode,
			success: false, // Will be updated later
			errorMessage: null,
			responseTimeMs: 0,
			failoverAttempts: 0
		});
	}

	/**
	 * Save complete request data
	 */
	async save(data: RequestData): Promise<void> {
		const requestsTable = this.getRequestsTable();
		const { usage } = data;
		
		await (this.db as any).insert(requestsTable).values({
			id: data.id,
			timestamp: new Date(),
			method: data.method,
			path: data.path,
			accountUsed: data.accountUsed,
			statusCode: data.statusCode,
			success: data.success,
			errorMessage: data.errorMessage,
			responseTimeMs: data.responseTime,
			failoverAttempts: data.failoverAttempts,
			model: usage?.model || null,
			promptTokens: usage?.promptTokens || 0,
			completionTokens: usage?.completionTokens || 0,
			totalTokens: usage?.totalTokens || 0,
			costUsd: usage?.costUsd || 0,
			inputTokens: usage?.inputTokens || 0,
			cacheReadInputTokens: usage?.cacheReadInputTokens || 0,
			cacheCreationInputTokens: usage?.cacheCreationInputTokens || 0,
			outputTokens: usage?.outputTokens || 0,
			agentUsed: data.agentUsed || null,
			outputTokensPerSecond: usage?.tokensPerSecond || null,
		}).onConflictDoUpdate({
			target: [requestsTable.id],
			set: {
				statusCode: data.statusCode,
				success: data.success,
				errorMessage: data.errorMessage,
				responseTimeMs: data.responseTime,
				failoverAttempts: data.failoverAttempts,
				model: usage?.model || null,
				promptTokens: usage?.promptTokens || 0,
				completionTokens: usage?.completionTokens || 0,
				totalTokens: usage?.totalTokens || 0,
				costUsd: usage?.costUsd || 0,
				inputTokens: usage?.inputTokens || 0,
				cacheReadInputTokens: usage?.cacheReadInputTokens || 0,
				cacheCreationInputTokens: usage?.cacheCreationInputTokens || 0,
				outputTokens: usage?.outputTokens || 0,
				agentUsed: data.agentUsed || null,
				outputTokensPerSecond: usage?.tokensPerSecond || null,
			}
		});
	}

	/**
	 * Update request usage information
	 */
	async updateUsage(requestId: string, usage: RequestData["usage"]): Promise<void> {
		if (!usage) return;
		
		const requestsTable = this.getRequestsTable();
		
		await (this.db as any).update(requestsTable)
			.set({
				model: usage.model || null,
				promptTokens: usage.promptTokens || 0,
				completionTokens: usage.completionTokens || 0,
				totalTokens: usage.totalTokens || 0,
				costUsd: usage.costUsd || 0,
				inputTokens: usage.inputTokens || 0,
				cacheReadInputTokens: usage.cacheReadInputTokens || 0,
				cacheCreationInputTokens: usage.cacheCreationInputTokens || 0,
				outputTokens: usage.outputTokens || 0,
				outputTokensPerSecond: usage.tokensPerSecond || null,
			})
			.where(eq(requestsTable.id, requestId));
	}

	/**
	 * Save request payload
	 */
	async savePayload(id: string, data: unknown): Promise<void> {
		const payloadsTable = this.getRequestPayloadsTable();
		const json = JSON.stringify(data);
		
		await (this.db as any).insert(payloadsTable).values({
			id,
			json
		}).onConflictDoUpdate({
			target: [payloadsTable.id],
			set: { json }
		});
	}

	/**
	 * Get request payload
	 */
	async getPayload(id: string): Promise<unknown | null> {
		const payloadsTable = this.getRequestPayloadsTable();
		
		const result = await this.db
			.select({ json: payloadsTable.json })
			.from(payloadsTable)
			.where(eq(payloadsTable.id, id))
			.limit(1);

		if (!result[0]) return null;

		try {
			return JSON.parse(result[0].json);
		} catch {
			return null;
		}
	}

	/**
	 * List request payloads
	 */
	async listPayloads(limit = 50): Promise<Array<{ id: string; json: string }>> {
		const payloadsTable = this.getRequestPayloadsTable();
		const requestsTable = this.getRequestsTable();
		
		const results = await (this.db as any)
			.select({
				id: payloadsTable.id,
				json: payloadsTable.json
			})
			.from(payloadsTable)
			.innerJoin(requestsTable, eq(payloadsTable.id, requestsTable.id))
			.orderBy(desc(requestsTable.timestamp))
			.limit(limit);

		return results;
	}

	/**
	 * List request payloads with account names
	 */
	async listPayloadsWithAccountNames(limit = 50): Promise<Array<{ id: string; json: string; account_name: string | null }>> {
		const payloadsTable = this.getRequestPayloadsTable();
		const requestsTable = this.getRequestsTable();
		const accountsTable = this.getAccountsTable();
		
		const results = await (this.db as any)
			.select({
				id: payloadsTable.id,
				json: payloadsTable.json,
				account_name: accountsTable.name
			})
			.from(payloadsTable)
			.innerJoin(requestsTable, eq(payloadsTable.id, requestsTable.id))
			.leftJoin(accountsTable, eq(requestsTable.accountUsed, accountsTable.id))
			.orderBy(desc(requestsTable.timestamp))
			.limit(limit);

		return results.map((row: any) => ({
			id: row.id,
			json: row.json,
			account_name: row.account_name
		}));
	}

	/**
	 * Get recent requests
	 */
	async getRecentRequests(limit = 100): Promise<Array<{
		id: string;
		timestamp: number;
		method: string;
		path: string;
		account_used: string | null;
		status_code: number | null;
		success: boolean;
		response_time_ms: number | null;
	}>> {
		const requestsTable = this.getRequestsTable();
		
		const results = await (this.db as any)
			.select({
				id: requestsTable.id,
				timestamp: requestsTable.timestamp,
				method: requestsTable.method,
				path: requestsTable.path,
				account_used: requestsTable.accountUsed,
				status_code: requestsTable.statusCode,
				success: requestsTable.success,
				response_time_ms: requestsTable.responseTimeMs
			})
			.from(requestsTable)
			.orderBy(desc(requestsTable.timestamp))
			.limit(limit);

		return results.map((row: any) => ({
			id: row.id,
			timestamp: this.provider === 'sqlite' ? Number(row.timestamp) : new Date(row.timestamp as any).getTime(),
			method: row.method,
			path: row.path,
			account_used: row.account_used,
			status_code: row.status_code,
			success: Boolean(row.success),
			response_time_ms: row.response_time_ms
		}));
	}

	/**
	 * Get request summaries for TUI display
	 */
	async getRequestSummaries(limit: number = 100): Promise<Array<{
		id: string;
		model?: string;
		input_tokens?: number;
		output_tokens?: number;
		total_tokens?: number;
		cache_read_input_tokens?: number;
		cache_creation_input_tokens?: number;
		cost_usd?: number;
		response_time_ms?: number;
	}>> {
		const requestsTable = this.getRequestsTable();

		const results = await (this.db as any)
			.select({
				id: requestsTable.id,
				model: requestsTable.model,
				input_tokens: requestsTable.inputTokens,
				output_tokens: requestsTable.outputTokens,
				total_tokens: requestsTable.totalTokens,
				cache_read_input_tokens: requestsTable.cacheReadInputTokens,
				cache_creation_input_tokens: requestsTable.cacheCreationInputTokens,
				cost_usd: requestsTable.costUsd,
				response_time_ms: requestsTable.responseTimeMs
			})
			.from(requestsTable)
			.orderBy(desc(requestsTable.timestamp))
			.limit(limit);

		return results.map((row: any) => ({
			id: row.id,
			model: row.model,
			input_tokens: row.input_tokens,
			output_tokens: row.output_tokens,
			total_tokens: row.total_tokens,
			cache_read_input_tokens: row.cache_read_input_tokens,
			cache_creation_input_tokens: row.cache_creation_input_tokens,
			cost_usd: row.cost_usd,
			response_time_ms: row.response_time_ms
		}));
	}

	/**
	 * Get requests with account names for HTTP API
	 */
	async getRequestsWithAccountNames(limit: number = 50): Promise<Array<{
		id: string;
		timestamp: number;
		method: string;
		path: string;
		account_used: string | null;
		account_name: string | null;
		status_code: number | null;
		success: 0 | 1;
		error_message: string | null;
		response_time_ms: number | null;
		failover_attempts: number;
		model: string | null;
		prompt_tokens: number | null;
		completion_tokens: number | null;
		total_tokens: number | null;
		input_tokens: number | null;
		cache_read_input_tokens: number | null;
		cache_creation_input_tokens: number | null;
		output_tokens: number | null;
		cost_usd: number | null;
		agent_used: string | null;
		output_tokens_per_second: number | null;
	}>> {
		const requestsTable = this.getRequestsTable();
		const accountsTable = this.getAccountsTable();

		const results = await (this.db as any)
			.select({
				id: requestsTable.id,
				timestamp: requestsTable.timestamp,
				method: requestsTable.method,
				path: requestsTable.path,
				account_used: requestsTable.accountUsed,
				account_name: accountsTable.name,
				status_code: requestsTable.statusCode,
				success: requestsTable.success,
				error_message: requestsTable.errorMessage,
				response_time_ms: requestsTable.responseTimeMs,
				failover_attempts: requestsTable.failoverAttempts,
				model: requestsTable.model,
				prompt_tokens: requestsTable.promptTokens,
				completion_tokens: requestsTable.completionTokens,
				total_tokens: requestsTable.totalTokens,
				input_tokens: requestsTable.inputTokens,
				cache_read_input_tokens: requestsTable.cacheReadInputTokens,
				cache_creation_input_tokens: requestsTable.cacheCreationInputTokens,
				output_tokens: requestsTable.outputTokens,
				cost_usd: requestsTable.costUsd,
				agent_used: requestsTable.agentUsed,
				output_tokens_per_second: requestsTable.outputTokensPerSecond
			})
			.from(requestsTable)
			.leftJoin(accountsTable, eq(requestsTable.accountUsed, accountsTable.id))
			.orderBy(desc(requestsTable.timestamp))
			.limit(limit);

		return results.map((row: any) => ({
			id: row.id,
			timestamp: row.timestamp,
			method: row.method,
			path: row.path,
			account_used: row.account_used,
			account_name: row.account_name,
			status_code: row.status_code,
			success: row.success,
			error_message: row.error_message,
			response_time_ms: row.response_time_ms,
			failover_attempts: row.failover_attempts,
			model: row.model,
			prompt_tokens: row.prompt_tokens,
			completion_tokens: row.completion_tokens,
			total_tokens: row.total_tokens,
			input_tokens: row.input_tokens,
			cache_read_input_tokens: row.cache_read_input_tokens,
			cache_creation_input_tokens: row.cache_creation_input_tokens,
			output_tokens: row.output_tokens,
			cost_usd: row.cost_usd,
			agent_used: row.agent_used,
			output_tokens_per_second: row.output_tokens_per_second
		}));
	}

	/**
	 * Get the appropriate tables for the current provider
	 */
	private getRequestsTable() {
		switch (this.provider) {
			case 'sqlite': return requestsSqlite;
			case 'postgresql': return requestsPostgreSQL;
			case 'mysql': return requestsMySQL;
			default: throw new Error(`Unsupported provider: ${this.provider}`);
		}
	}

	private getRequestPayloadsTable() {
		switch (this.provider) {
			case 'sqlite': return requestPayloadsSqlite;
			case 'postgresql': return requestPayloadsPostgreSQL;
			case 'mysql': return requestPayloadsMySQL;
			default: throw new Error(`Unsupported provider: ${this.provider}`);
		}
	}

	private getAccountsTable() {
		switch (this.provider) {
			case 'sqlite': return accountsSqlite;
			case 'postgresql': return accountsPostgreSQL;
			case 'mysql': return accountsMySQL;
			default: throw new Error(`Unsupported provider: ${this.provider}`);
		}
	}

	/**
	 * Clear all requests - for TUI core compatibility
	 */
	async clearAll(): Promise<void> {
		const requestsTable = this.getRequestsTable();
		const requestPayloadsTable = this.getRequestPayloadsTable();

		// Delete from request_payloads first (foreign key constraint)
		await (this.db as any).delete(requestPayloadsTable);

		// Then delete from requests
		await (this.db as any).delete(requestsTable);
	}
}
