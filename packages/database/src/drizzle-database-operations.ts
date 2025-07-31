import type { Disposable } from "@ccflare/core";
import type { RuntimeConfig, DatabaseProvider } from "@ccflare/config";
import type { Account, StrategyStore } from "@ccflare/types";
import type { DatabaseConnection, DatabaseConnectionConfig } from "./providers/database-provider";
import { DatabaseProviderFactory } from "./providers/database-factory";
import { createInitialSchema } from "./migrations/drizzle-migrations";
import { SchemaValidator } from "./validation/schema-validator";
import { resolveDbPath } from "./paths";
import { Logger } from "@ccflare/logger";
import { DrizzleAccountRepository } from "./repositories/drizzle-account.repository";
import { DrizzleOAuthRepository } from "./repositories/drizzle-oauth.repository";
import { DrizzleStrategyRepository } from "./repositories/drizzle-strategy.repository";
import { DrizzleAgentPreferenceRepository } from "./repositories/drizzle-agent-preference.repository";
import { DrizzleStatsRepository } from "./repositories/drizzle-stats.repository";
import { DrizzleRequestRepository } from "./repositories/drizzle-request.repository";
import type { RequestData } from "./repositories/drizzle-request.repository";
// DrizzleORM imports for future implementation
// import { eq, desc } from "drizzle-orm";
// import { accountsSqlite, accountsPostgreSQL, accountsMySQL } from "./schema/accounts";
// import { requestsSqlite, requestsPostgreSQL, requestsMySQL } from "./schema/requests";
// import { requestPayloadsSqlite, requestPayloadsPostgreSQL, requestPayloadsMySQL } from "./schema/request-payloads";

const log = new Logger("DrizzleDatabaseOperations");

/**
 * Database operations using the new provider factory pattern with Drizzle ORM
 * This will eventually replace the existing DatabaseOperations class
 */
export class DrizzleDatabaseOperations implements StrategyStore, Disposable {
	private connection: DatabaseConnection;
	private provider: DatabaseProvider;
	private runtime?: RuntimeConfig;
	private initPromise: Promise<void>;

	// Repositories
	private accountRepo?: DrizzleAccountRepository;
	private oauthRepo?: DrizzleOAuthRepository;
	private strategyRepo?: DrizzleStrategyRepository;
	private agentPreferenceRepo?: DrizzleAgentPreferenceRepository;
	private statsRepo?: DrizzleStatsRepository;
	private requestRepo?: DrizzleRequestRepository;

	constructor(config?: DatabaseConnectionConfig, runtimeConfig?: RuntimeConfig) {
		this.runtime = runtimeConfig;
		
		// Build configuration from environment variables, runtime config, or defaults
		if (!config) {
			const envProvider = process.env.DATABASE_PROVIDER;
			const envUrl = process.env.DATABASE_URL;
			const dbConfig = runtimeConfig?.database;

			const provider = envProvider || dbConfig?.provider || 'sqlite';
			const url = envUrl || dbConfig?.url;

			config = {
				provider: provider as any,
				url: url,
				dbPath: !url && provider === 'sqlite' ? resolveDbPath() : undefined,
				walMode: dbConfig?.walMode,
				busyTimeoutMs: dbConfig?.busyTimeoutMs,
				cacheSize: dbConfig?.cacheSize,
				synchronous: dbConfig?.synchronous,
				mmapSize: dbConfig?.mmapSize,
			};
		}

		// Default to SQLite if no config provided
		if (!config) {
			config = {
				provider: 'sqlite',
				dbPath: resolveDbPath(),
				walMode: true,
				busyTimeoutMs: 10000,
				cacheSize: -10000,
				synchronous: 'FULL',
				mmapSize: 0,
			};
		}

		// Validate configuration
		DatabaseProviderFactory.validateConfig(config);

		this.provider = config.provider;
		this.connection = DatabaseProviderFactory.createConnection(config);

		// Initialize schema asynchronously and store the promise
		this.initPromise = this.initializeSchema();

		// Initialize repositories
		this.accountRepo = new DrizzleAccountRepository(this.connection, this.provider);
		this.oauthRepo = new DrizzleOAuthRepository(this.connection, this.provider);
		this.strategyRepo = new DrizzleStrategyRepository(this.connection, this.provider);
		this.agentPreferenceRepo = new DrizzleAgentPreferenceRepository(this.connection, this.provider);
		this.statsRepo = new DrizzleStatsRepository(this.connection, this.provider);
		this.requestRepo = new DrizzleRequestRepository(this.connection, this.provider);
	}

	private async initializeSchema(): Promise<void> {
		try {
			log.info(`Initializing schema for ${this.provider} database`);
			
			// Create initial schema if needed
			await createInitialSchema(this.connection, this.provider);
			
			// Validate schema
			const validator = new SchemaValidator();
			const validationResult = await validator.validateSchema(this.connection, this.provider);
			
			if (!validationResult.isValid) {
				log.warn(`Schema validation issues found:`, validationResult.errors);
				// In production, you might want to auto-fix or fail here
			}
			
			log.info(`Schema initialization completed for ${this.provider}`);
		} catch (error) {
			log.error(`Failed to initialize schema for ${this.provider}:`, error);
			throw error;
		}
	}

	/**
	 * Wait for database initialization to complete
	 */
	async waitForInitialization(): Promise<void> {
		await this.initPromise;
	}

	/**
	 * Get the underlying database connection
	 */
	getConnection(): DatabaseConnection {
		return this.connection;
	}

	/**
	 * Get the database provider type
	 */
	getProvider(): DatabaseProvider {
		return this.provider;
	}

	/**
	 * Set runtime configuration
	 */
	setRuntimeConfig(config: RuntimeConfig): void {
		this.runtime = config;
	}

	/**
	 * Get runtime configuration
	 */
	getRuntimeConfig(): RuntimeConfig | undefined {
		return this.runtime;
	}

	// StrategyStore implementation
	resetAccountSession(accountId: string, timestamp: number): void {
		if (!this.accountRepo) {
			log.error("Account repository not initialized");
			return;
		}

		// Use async operation but don't wait for it (fire and forget for sync compatibility)
		this.accountRepo.update(accountId, {
			session_start: timestamp,
			session_request_count: 0
		}).catch(error => {
			log.error(`Failed to reset account session for ${accountId}:`, error);
		});
	}

	/**
	 * Get all accounts - async version using proper repository pattern
	 */
	async getAllAccountsAsync(): Promise<Account[]> {
		try {
			if (!this.accountRepo) {
				log.error("Account repository not initialized");
				return [];
			}

			return await this.accountRepo.findAll();
		} catch (error) {
			log.error("Error in getAllAccountsAsync:", error);
			return [];
		}
	}

	/**
	 * Get all accounts - sync compatibility method
	 * This is a temporary bridge until HTTP API is updated to be async
	 */
	getAllAccounts(): Account[] {
		// For immediate compatibility, we'll use a simple approach:
		// Return empty array and log that this should be updated
		log.warn("getAllAccounts (sync) called - this should be updated to use getAllAccountsAsync()");
		return [];
	}

	updateAccountRequestCount(accountId: string, count: number): void {
		// This should be async, but for compatibility with existing sync API, we'll handle it
		if (!this.accountRepo) {
			log.error("Account repository not initialized");
			return;
		}

		// Use async operation but don't wait for it (fire and forget for sync compatibility)
		this.accountRepo.update(accountId, { session_request_count: count })
			.catch(error => {
				log.error(`Failed to update account request count for ${accountId}:`, error);
			});
	}



	/**
	 * Close the database connection
	 */
	async close(): Promise<void> {
		try {
			await this.connection.close();
			log.info(`Database connection closed for ${this.provider}`);
		} catch (error) {
			log.error(`Error closing database connection:`, error);
			throw error;
		}
	}

	/**
	 * Dispose of resources
	 */
	dispose(): void {
		// Close connection asynchronously
		this.close().catch(error => {
			log.error("Error during disposal:", error);
		});
	}

	/**
	 * Test database connectivity
	 */
	async testConnection(): Promise<boolean> {
		try {
			// Simple query to test connectivity
			switch (this.provider) {
				case 'sqlite':
					await this.connection.get("SELECT 1");
					break;
				case 'postgresql':
					await this.connection.get("SELECT 1");
					break;
				case 'mysql':
					await this.connection.get("SELECT 1");
					break;
			}
			return true;
		} catch (error) {
			log.error(`Database connectivity test failed for ${this.provider}:`, error);
			return false;
		}
	}

	/**
	 * Get database statistics
	 */
	async getDatabaseStats(): Promise<{
		provider: DatabaseProvider;
		tablesCount: number;
		connectionStatus: boolean;
	}> {
		const connectionStatus = await this.testConnection();
		
		let tablesCount = 0;
		if (connectionStatus) {
			try {
				let query: string;
				switch (this.provider) {
					case 'sqlite':
						query = "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'";
						break;
					case 'postgresql':
						query = "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema='public'";
						break;
					case 'mysql':
						query = "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema=DATABASE()";
						break;
					default:
						query = "SELECT 0 as count";
				}
				
				const result = await this.connection.get<{ count: number }>(query);
				tablesCount = result?.count || 0;
			} catch (error) {
				log.error("Error getting table count:", error);
			}
		}

		return {
			provider: this.provider,
			tablesCount,
			connectionStatus,
		};
	}



	/**
	 * Get database connection - compatibility method for server
	 * For SQLite, returns the raw Database object for backward compatibility
	 * For other providers, returns a mock object that will cause graceful failures
	 */
	getDatabase(): any {
		if (this.provider === 'sqlite') {
			// For SQLite, return the raw database from the connection
			const drizzleDb = this.connection.getDrizzle();
			// The SQLite provider should expose the raw database
			if ('run' in drizzleDb && 'query' in drizzleDb) {
				return drizzleDb;
			}
		}

		// For non-SQLite providers, return a mock that will fail gracefully
		log.warn(`getDatabase() called for ${this.provider} provider - returning mock object`);
		return {
			query: () => { throw new Error(`Raw database queries not supported for ${this.provider} provider`); },
			run: () => { throw new Error(`Raw database queries not supported for ${this.provider} provider`); },
			get: () => { throw new Error(`Raw database queries not supported for ${this.provider} provider`); }
		};
	}

	/**
	 * Get stats repository - returns the DrizzleStatsRepository
	 */
	getStatsRepository(): DrizzleStatsRepository {
		if (!this.statsRepo) {
			throw new Error("Stats repository not initialized");
		}
		return this.statsRepo;
	}

	/**
	 * Get request summaries for TUI - async method
	 */
	async getRequestSummariesAsync(limit: number = 100): Promise<Array<{
		id: string;
		model?: string;
		inputTokens?: number;
		outputTokens?: number;
		totalTokens?: number;
		cacheReadInputTokens?: number;
		cacheCreationInputTokens?: number;
		costUsd?: number;
		responseTimeMs?: number;
	}>> {
		if (!this.requestRepo) {
			throw new Error("Request repository not initialized");
		}

		// Use the repository to get request summaries
		const requests = await this.requestRepo.getRequestSummaries(limit);

		// Map to the expected format for TUI
		return requests.map(req => ({
			id: req.id,
			model: req.model,
			inputTokens: req.input_tokens,
			outputTokens: req.output_tokens,
			totalTokens: req.total_tokens,
			cacheReadInputTokens: req.cache_read_input_tokens,
			cacheCreationInputTokens: req.cache_creation_input_tokens,
			costUsd: req.cost_usd,
			responseTimeMs: req.response_time_ms
		}));
	}

	/**
	 * Get requests with account names for HTTP API - async method
	 */
	async getRequestsWithAccountNamesAsync(limit: number = 50): Promise<Array<{
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
		if (!this.requestRepo) {
			throw new Error("Request repository not initialized");
		}

		// Use the repository to get requests with account names
		return await this.requestRepo.getRequestsWithAccountNames(limit);
	}

	/**
	 * Get request payload by ID for TUI - async method
	 */
	async getRequestPayloadAsync(requestId: string): Promise<unknown | null> {
		if (!this.requestRepo) {
			throw new Error("Request repository not initialized");
		}

		return await this.requestRepo.getPayload(requestId);
	}

	/**
	 * List request payloads with account names - async version using DrizzleORM
	 */
	async listRequestPayloadsWithAccountNamesAsync(limit = 50): Promise<Array<{ id: string; json: string; account_name: string | null }>> {
		try {
			if (!this.requestRepo) {
				log.error("Request repository not initialized");
				return [];
			}
			return await this.requestRepo.listPayloadsWithAccountNames(limit);
		} catch (error) {
			log.error("Error in listRequestPayloadsWithAccountNamesAsync:", error);
			return [];
		}
	}

	/**
	 * List request payloads with account names - sync compatibility method
	 */
	listRequestPayloadsWithAccountNames(_limit = 50): Array<{ id: string; json: string; account_name: string | null }> {
		log.warn(`listRequestPayloadsWithAccountNames (sync) called - this should be updated to use listRequestPayloadsWithAccountNamesAsync()`);
		return [];
	}

	/**
	 * Save request metadata - async version
	 */
	async saveRequestMetaAsync(
		id: string,
		method: string,
		path: string,
		accountUsed: string | null,
		statusCode: number | null,
		timestamp?: number
	): Promise<void> {
		if (!this.requestRepo) {
			throw new Error("Request repository not initialized");
		}
		await this.requestRepo.saveMeta(id, method, path, accountUsed, statusCode, timestamp);
	}

	/**
	 * Clear all requests - async version for TUI core
	 */
	async clearAllRequestsAsync(): Promise<void> {
		if (!this.requestRepo) {
			throw new Error("Request repository not initialized");
		}
		await this.requestRepo.clearAll();
	}

	/**
	 * Reset account statistics - async version for TUI core
	 */
	async resetAccountStatsAsync(): Promise<void> {
		if (!this.accountRepo) {
			throw new Error("Account repository not initialized");
		}
		await this.accountRepo.resetAllStats();
	}

	/**
	 * Remove account by name - async version for CLI commands
	 */
	async removeAccountByNameAsync(name: string): Promise<boolean> {
		if (!this.accountRepo) {
			throw new Error("Account repository not initialized");
		}

		try {
			// Find account by name first
			const account = await this.accountRepo.findByName(name);
			if (!account) {
				return false;
			}

			// Remove the account
			await this.accountRepo.remove(account.id);
			return true;
		} catch (error) {
			log.error(`Error removing account '${name}':`, error);
			return false;
		}
	}

	/**
	 * Save complete request data - async version
	 */
	async saveRequestAsync(data: RequestData): Promise<void> {
		if (!this.requestRepo) {
			throw new Error("Request repository not initialized");
		}
		await this.requestRepo.save(data);
	}

	/**
	 * Save request payload - async version
	 */
	async saveRequestPayloadAsync(id: string, data: unknown): Promise<void> {
		if (!this.requestRepo) {
			throw new Error("Request repository not initialized");
		}
		await this.requestRepo.savePayload(id, data);
	}

	/**
	 * Get account by ID - async version using proper repository pattern
	 */
	async getAccountAsync(accountId: string): Promise<Account | null> {
		try {
			if (!this.accountRepo) {
				log.error("Account repository not initialized");
				return null;
			}

			return await this.accountRepo.findById(accountId);
		} catch (error) {
			log.error(`Error in getAccountAsync for ${accountId}:`, error);
			return null;
		}
	}

	/**
	 * Get account by ID - sync compatibility method
	 */
	getAccount(accountId: string): Account | null {
		log.warn(`getAccount (sync) called for ${accountId} - this should be updated to use getAccountAsync()`);
		return null;
	}


}
