import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
	type Account,
	type AccountRow,
	type Disposable,
	type StrategyStore,
	toAccount,
} from "@ccflare/core";
import { ensureSchema, runMigrations } from "./migrations";
import { resolveDbPath } from "./paths";

export interface RuntimeConfig {
	sessionDurationMs?: number;
}

export class DatabaseOperations implements StrategyStore, Disposable {
	private db: Database;
	private runtime?: RuntimeConfig;

	constructor(dbPath?: string) {
		const resolvedPath = dbPath ?? resolveDbPath();

		// Ensure the directory exists
		const dir = dirname(resolvedPath);
		mkdirSync(dir, { recursive: true });

		this.db = new Database(resolvedPath, { create: true });
		ensureSchema(this.db);
		runMigrations(this.db);
	}

	setRuntimeConfig(runtime: RuntimeConfig): void {
		this.runtime = runtime;
	}

	getDatabase(): Database {
		return this.db;
	}

	getAllAccounts(): Account[] {
		const rows = this.db
			.query<AccountRow, []>(`
      SELECT 
        id,
        name,
        provider,
        api_key,
        refresh_token,
        access_token,
        expires_at,
        created_at,
        last_used,
        request_count,
        total_requests,
        rate_limited_until,
        session_start,
        session_request_count,
        COALESCE(account_tier, 1) as account_tier,
        COALESCE(paused, 0) as paused,
        rate_limit_reset,
        rate_limit_status,
        rate_limit_remaining
      FROM accounts
    `)
			.all();

		return rows.map(toAccount);
	}

	updateAccountTokens(
		accountId: string,
		accessToken: string,
		expiresAt: number,
		refreshToken?: string,
	): void {
		if (refreshToken) {
			this.db.run(
				`UPDATE accounts SET access_token = ?, expires_at = ?, refresh_token = ? WHERE id = ?`,
				[accessToken, expiresAt, refreshToken, accountId],
			);
		} else {
			this.db.run(
				`UPDATE accounts SET access_token = ?, expires_at = ? WHERE id = ?`,
				[accessToken, expiresAt, accountId],
			);
		}
	}

	updateAccountUsage(accountId: string): void {
		const now = Date.now();
		const sessionDuration =
			this.runtime?.sessionDurationMs || 5 * 60 * 60 * 1000; // fallback to 5 hours

		this.db.run(
			`
      UPDATE accounts 
      SET 
        last_used = ?,
        request_count = request_count + 1,
        total_requests = total_requests + 1,
        session_start = CASE
          WHEN session_start IS NULL OR ? - session_start >= ? THEN ?
          ELSE session_start
        END,
        session_request_count = CASE
          WHEN session_start IS NULL OR ? - session_start >= ? THEN 1
          ELSE session_request_count + 1
        END
      WHERE id = ?
    `,
			[now, now, sessionDuration, now, now, sessionDuration, accountId],
		);
	}

	markAccountRateLimited(accountId: string, until: number): void {
		this.db.run(`UPDATE accounts SET rate_limited_until = ? WHERE id = ?`, [
			until,
			accountId,
		]);
	}

	updateAccountRateLimitMeta(
		accountId: string,
		status: string,
		reset: number | null,
		remaining?: number | null,
	): void {
		this.db.run(
			`UPDATE accounts SET rate_limit_status = ?, rate_limit_reset = ?, rate_limit_remaining = ? WHERE id = ?`,
			[status, reset, remaining ?? null, accountId],
		);
	}

	updateAccountTier(accountId: string, tier: number): void {
		this.db.run(`UPDATE accounts SET account_tier = ? WHERE id = ?`, [
			tier,
			accountId,
		]);
	}

	saveRequestMeta(
		id: string,
		method: string,
		path: string,
		accountUsed: string | null,
		statusCode: number | null,
		timestamp?: number,
	): void {
		this.db.run(
			`
      INSERT INTO requests (
        id, timestamp, method, path, account_used, 
        status_code, success, error_message, response_time_ms, failover_attempts
      )
      VALUES (?, ?, ?, ?, ?, ?, 0, NULL, 0, 0)
    `,
			[id, timestamp || Date.now(), method, path, accountUsed, statusCode],
		);
	}

	saveRequest(
		id: string,
		method: string,
		path: string,
		accountUsed: string | null,
		statusCode: number | null,
		success: boolean,
		errorMessage: string | null,
		responseTime: number,
		failoverAttempts: number,
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
		},
	): void {
		this.db.run(
			`
      INSERT OR REPLACE INTO requests (
        id, timestamp, method, path, account_used, 
        status_code, success, error_message, response_time_ms, failover_attempts,
        model, prompt_tokens, completion_tokens, total_tokens, cost_usd,
        input_tokens, cache_read_input_tokens, cache_creation_input_tokens, output_tokens
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
			[
				id,
				Date.now(),
				method,
				path,
				accountUsed,
				statusCode,
				success ? 1 : 0,
				errorMessage,
				responseTime,
				failoverAttempts,
				usage?.model || null,
				usage?.promptTokens || null,
				usage?.completionTokens || null,
				usage?.totalTokens || null,
				usage?.costUsd || null,
				usage?.inputTokens || null,
				usage?.cacheReadInputTokens || null,
				usage?.cacheCreationInputTokens || null,
				usage?.outputTokens || null,
			],
		);
	}

	// StrategyStore implementation
	resetAccountSession(accountId: string, timestamp: number): void {
		this.db.run(
			`UPDATE accounts SET session_start = ?, session_request_count = 0 WHERE id = ?`,
			[timestamp, accountId],
		);
	}

	getAccount(accountId: string): Account | null {
		const row = this.db
			.query<AccountRow, [string]>(`
				SELECT 
					id,
					name,
					provider,
					api_key,
					refresh_token,
					access_token,
					expires_at,
					created_at,
					last_used,
					request_count,
					total_requests,
					rate_limited_until,
					session_start,
					session_request_count,
					COALESCE(account_tier, 1) as account_tier,
					COALESCE(paused, 0) as paused,
					rate_limit_reset,
					rate_limit_status,
					rate_limit_remaining
				FROM accounts
				WHERE id = ?
			`)
			.get(accountId);

		return row ? toAccount(row) : null;
	}

	updateAccountRequestCount(accountId: string, count: number): void {
		this.db.run(`UPDATE accounts SET session_request_count = ? WHERE id = ?`, [
			count,
			accountId,
		]);
	}

	// Request payload methods
	saveRequestPayload(id: string, data: unknown): void {
		const json = JSON.stringify(data);
		this.db.run(
			`INSERT OR REPLACE INTO request_payloads (id, json) VALUES (?, ?)`,
			[id, json],
		);
	}

	getRequestPayload(id: string): unknown | null {
		const row = this.db
			.query<{ json: string }, [string]>(
				`SELECT json FROM request_payloads WHERE id = ?`,
			)
			.get(id);

		if (!row) return null;

		try {
			return JSON.parse(row.json);
		} catch {
			return null;
		}
	}

	listRequestPayloads(limit = 50): Array<{ id: string; json: string }> {
		return this.db
			.query<{ id: string; json: string }, [number]>(`
				SELECT rp.id, rp.json 
				FROM request_payloads rp
				JOIN requests r ON rp.id = r.id
				ORDER BY r.timestamp DESC
				LIMIT ?
			`)
			.all(limit);
	}

	listRequestPayloadsWithAccountNames(
		limit = 50,
	): Array<{ id: string; json: string; account_name: string | null }> {
		return this.db
			.query<
				{ id: string; json: string; account_name: string | null },
				[number]
			>(`
				SELECT rp.id, rp.json, a.name as account_name
				FROM request_payloads rp
				JOIN requests r ON rp.id = r.id
				LEFT JOIN accounts a ON r.account_used = a.id
				ORDER BY r.timestamp DESC
				LIMIT ?
			`)
			.all(limit);
	}

	pauseAccount(accountId: string): void {
		this.db.run(`UPDATE accounts SET paused = 1 WHERE id = ?`, [accountId]);
	}

	resumeAccount(accountId: string): void {
		this.db.run(`UPDATE accounts SET paused = 0 WHERE id = ?`, [accountId]);
	}

	updateRequestUsage(
		requestId: string,
		usage: {
			model?: string;
			promptTokens?: number;
			completionTokens?: number;
			totalTokens?: number;
			costUsd?: number;
			inputTokens?: number;
			cacheReadInputTokens?: number;
			cacheCreationInputTokens?: number;
			outputTokens?: number;
		},
	): void {
		this.db.run(
			`
			UPDATE requests
			SET 
				model = COALESCE(?, model),
				prompt_tokens = COALESCE(?, prompt_tokens),
				completion_tokens = COALESCE(?, completion_tokens),
				total_tokens = COALESCE(?, total_tokens),
				cost_usd = COALESCE(?, cost_usd),
				input_tokens = COALESCE(?, input_tokens),
				cache_read_input_tokens = COALESCE(?, cache_read_input_tokens),
				cache_creation_input_tokens = COALESCE(?, cache_creation_input_tokens),
				output_tokens = COALESCE(?, output_tokens)
			WHERE id = ?
			`,
			[
				usage.model || null,
				usage.promptTokens || null,
				usage.completionTokens || null,
				usage.totalTokens || null,
				usage.costUsd || null,
				usage.inputTokens || null,
				usage.cacheReadInputTokens || null,
				usage.cacheCreationInputTokens || null,
				usage.outputTokens || null,
				requestId,
			],
		);
	}

	close(): void {
		this.db.close();
	}

	dispose(): void {
		this.close();
	}
}

export { AsyncDbWriter } from "./async-writer";
export { DatabaseFactory } from "./factory";
// Re-export migrations for convenience
export { ensureSchema, runMigrations } from "./migrations";
export { resolveDbPath } from "./paths";
