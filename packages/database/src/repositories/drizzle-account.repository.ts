import { type Account } from "@ccflare/types";
import type { DatabaseProvider } from "@ccflare/config";
import type { DatabaseConnection } from "../providers/database-provider";
import { DrizzleBaseRepository } from "./drizzle-base.repository";
import { eq, and, isNull, lt, or, sql } from "drizzle-orm";
import { getAccountsTable } from "../schema/accounts";

/**
 * Drizzle-based Account Repository
 * This provides the same interface as the original AccountRepository but uses the new provider system
 */
export class DrizzleAccountRepository extends DrizzleBaseRepository<Account> {
	constructor(connection: DatabaseConnection, provider: DatabaseProvider) {
		super(connection, provider);
	}

	private mapToAccount(row: any): Account {
		return {
			id: row.id,
			name: row.name,
			provider: row.provider || 'anthropic',
			api_key: row.api_key || row.apiKey,
			refresh_token: row.refresh_token || row.refreshToken,
			access_token: row.access_token || row.accessToken,
			expires_at: row.expires_at || row.expiresAt,
			created_at: row.created_at || row.createdAt,
			last_used: row.last_used || row.lastUsed,
			request_count: row.request_count || row.requestCount || 0,
			total_requests: row.total_requests || row.totalRequests || 0,
			account_tier: row.account_tier || row.accountTier || 1,
			rate_limited_until: row.rate_limited_until || row.rateLimitedUntil,
			session_start: row.session_start || row.sessionStart,
			session_request_count: row.session_request_count || row.sessionRequestCount || 0,
			paused: Boolean(row.paused),
			rate_limit_reset: row.rate_limit_reset || row.rateLimitReset,
			rate_limit_status: row.rate_limit_status || row.rateLimitStatus,
			rate_limit_remaining: row.rate_limit_remaining || row.rateLimitRemaining,
		};
	}

	async findAll(): Promise<Account[]> {
		const accountsTable = getAccountsTable(this.provider);
		const rows = await (this.connection.getDrizzle() as any).select().from(accountsTable);
		return rows.map((row: any) => this.mapToAccount(row));
	}

	async findById(accountId: string): Promise<Account | null> {
		const accountsTable = getAccountsTable(this.provider);
		const rows = await (this.connection.getDrizzle() as any)
			.select()
			.from(accountsTable)
			.where(eq(accountsTable.id, accountId))
			.limit(1);

		return rows.length > 0 ? this.mapToAccount(rows[0]) : null;
	}

	async findByName(name: string): Promise<Account | null> {
		const accountsTable = getAccountsTable(this.provider);
		const rows = await (this.connection.getDrizzle() as any)
			.select()
			.from(accountsTable)
			.where(eq(accountsTable.name, name))
			.limit(1);

		return rows.length > 0 ? this.mapToAccount(rows[0]) : null;
	}

	async create(account: Omit<Account, 'id'>): Promise<Account> {
		const id = this.generateId();
		const now = this.getTimestamp();
		const accountsTable = getAccountsTable(this.provider);

		// Map account properties to schema column names (camelCase)
		const newAccount: any = {
			id,
			name: account.name,
			provider: account.provider || 'anthropic',
			apiKey: account.api_key || null,
			refreshToken: account.refresh_token,
			accessToken: account.access_token || null,
			expiresAt: account.expires_at || null,
			createdAt: now,
			lastUsed: account.last_used || null,
			requestCount: account.request_count || 0,
			totalRequests: account.total_requests || 0,
			accountTier: account.account_tier || 1,
			rateLimitedUntil: account.rate_limited_until || null,
			sessionStart: account.session_start || null,
			sessionRequestCount: account.session_request_count || 0,
			paused: this.adaptBoolean(account.paused || false),
			rateLimitReset: account.rate_limit_reset || null,
			rateLimitStatus: account.rate_limit_status || null,
			rateLimitRemaining: account.rate_limit_remaining || null,
		};

		await (this.connection.getDrizzle() as any).insert(accountsTable).values(newAccount);

		const createdAccount = await this.findById(id);
		if (!createdAccount) {
			throw new Error("Failed to create account");
		}

		return createdAccount;
	}

	async update(accountId: string, updates: Partial<Account>): Promise<Account | null> {
		const accountsTable = getAccountsTable(this.provider);

		// Build update object with only defined fields
		const updateData: any = {};

		if (updates.name !== undefined) updateData.name = updates.name;
		if (updates.provider !== undefined) updateData.provider = updates.provider;
		if (updates.api_key !== undefined) updateData.apiKey = updates.api_key;
		if (updates.refresh_token !== undefined) updateData.refreshToken = updates.refresh_token;
		if (updates.access_token !== undefined) updateData.accessToken = updates.access_token;
		if (updates.expires_at !== undefined) updateData.expiresAt = updates.expires_at;
		if (updates.last_used !== undefined) updateData.lastUsed = updates.last_used;
		if (updates.request_count !== undefined) updateData.requestCount = updates.request_count;
		if (updates.total_requests !== undefined) updateData.totalRequests = updates.total_requests;
		if (updates.account_tier !== undefined) updateData.accountTier = updates.account_tier;
		if (updates.rate_limited_until !== undefined) updateData.rateLimitedUntil = updates.rate_limited_until;
		if (updates.session_start !== undefined) updateData.sessionStart = updates.session_start;
		if (updates.session_request_count !== undefined) updateData.sessionRequestCount = updates.session_request_count;
		if (updates.paused !== undefined) updateData.paused = this.adaptBoolean(updates.paused);
		if (updates.rate_limit_reset !== undefined) updateData.rateLimitReset = updates.rate_limit_reset;
		if (updates.rate_limit_status !== undefined) updateData.rateLimitStatus = updates.rate_limit_status;
		if (updates.rate_limit_remaining !== undefined) updateData.rateLimitRemaining = updates.rate_limit_remaining;

		if (Object.keys(updateData).length === 0) {
			// No updates to apply
			return this.findById(accountId);
		}

		const result = await (this.db as any)
			.update(accountsTable)
			.set(updateData)
			.where(eq(accountsTable.id, accountId));

		if (result.changes === 0) {
			return null; // Account not found
		}

		return this.findById(accountId);
	}

	async delete(accountId: string): Promise<boolean> {
		const accountsTable = getAccountsTable(this.provider);

		const result = await (this.db as any)
			.delete(accountsTable)
			.where(eq(accountsTable.id, accountId));

		return result.changes > 0;
	}

	async incrementRequestCount(accountId: string): Promise<void> {
		const accountsTable = getAccountsTable(this.provider);
		const now = this.getTimestamp();

		const result = await (this.db as any)
			.update(accountsTable)
			.set({
				requestCount: sql`${accountsTable.requestCount} + 1`,
				totalRequests: sql`${accountsTable.totalRequests} + 1`,
				lastUsed: now,
			})
			.where(eq(accountsTable.id, accountId));

		if (result.changes === 0) {
			throw new Error(`Account not found: ${accountId}`);
		}
	}

	async resetSessionRequestCount(accountId: string): Promise<void> {
		const accountsTable = getAccountsTable(this.provider);
		const now = this.getTimestamp();

		const result = await (this.db as any)
			.update(accountsTable)
			.set({
				sessionRequestCount: 0,
				sessionStart: now,
			})
			.where(eq(accountsTable.id, accountId));

		if (result.changes === 0) {
			throw new Error(`Account not found: ${accountId}`);
		}
	}

	async setRateLimited(accountId: string, until: number | null): Promise<void> {
		const accountsTable = getAccountsTable(this.provider);

		const result = await (this.db as any)
			.update(accountsTable)
			.set({
				rateLimitedUntil: until,
			})
			.where(eq(accountsTable.id, accountId));

		if (result.changes === 0) {
			throw new Error(`Account not found: ${accountId}`);
		}
	}

	async setPaused(accountId: string, paused: boolean): Promise<void> {
		const accountsTable = getAccountsTable(this.provider);

		const result = await (this.db as any)
			.update(accountsTable)
			.set({
				paused: this.adaptBoolean(paused),
			})
			.where(eq(accountsTable.id, accountId));

		if (result.changes === 0) {
			throw new Error(`Account not found: ${accountId}`);
		}
	}

	async getAvailableAccounts(): Promise<Account[]> {
		const now = this.getTimestamp();
		const accountsTable = getAccountsTable(this.provider);

		const rows = await (this.connection.getDrizzle() as any)
			.select()
			.from(accountsTable)
			.where(
				and(
					or(
						eq(accountsTable.paused, this.provider === 'sqlite' ? 0 : false),
						isNull(accountsTable.paused)
					),
					or(
						isNull(accountsTable.rateLimitedUntil),
						lt(accountsTable.rateLimitedUntil, now)
					)
				)
			);

		return rows.map((row: any) => this.mapToAccount(row));
	}

	/**
	 * Reset all account statistics - for TUI core compatibility
	 */
	async resetAllStats(): Promise<void> {
		const accountsTable = getAccountsTable(this.provider);

		await (this.db as any)
			.update(accountsTable)
			.set({
				requestCount: 0,
				sessionRequestCount: 0,
				sessionStart: Date.now()
			});
	}

	/**
	 * Remove an account by ID - for CLI commands compatibility
	 */
	async remove(accountId: string): Promise<void> {
		const accountsTable = getAccountsTable(this.provider);

		const result = await (this.db as any)
			.delete(accountsTable)
			.where(eq(accountsTable.id, accountId));

		if (result.changes === 0) {
			throw new Error(`Account not found: ${accountId}`);
		}
	}
}
