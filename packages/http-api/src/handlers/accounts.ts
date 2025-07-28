import type { Database } from "bun:sqlite";
import * as cliCommands from "@ccflare/cli-commands";
import { Config } from "@ccflare/config";
import type { DatabaseOperations } from "@ccflare/database";
import { generatePKCE, getOAuthProvider } from "@ccflare/providers";
import type { AccountDeleteRequest, AccountResponse } from "../types";

/**
 * Create an accounts list handler
 */
export function createAccountsListHandler(db: Database) {
	return (): Response => {
		const now = Date.now();
		const sessionDuration = 5 * 60 * 60 * 1000; // 5 hours

		const accounts = db
			.query(
				`
				SELECT 
					id,
					name,
					provider,
					request_count,
					total_requests,
					last_used,
					created_at,
					rate_limited_until,
					rate_limit_reset,
					rate_limit_status,
					rate_limit_remaining,
					session_start,
					session_request_count,
					COALESCE(account_tier, 1) as account_tier,
					COALESCE(paused, 0) as paused,
					CASE 
						WHEN expires_at > ?1 THEN 1 
						ELSE 0 
					END as token_valid,
					CASE 
						WHEN rate_limited_until > ?2 THEN 1
						ELSE 0
					END as rate_limited,
					CASE
						WHEN session_start IS NOT NULL AND ?3 - session_start < ?4 THEN
							'Active: ' || session_request_count || ' reqs'
						ELSE '-'
					END as session_info
				FROM accounts
				ORDER BY request_count DESC
			`,
			)
			.all(now, now, now, sessionDuration) as Array<{
			id: string;
			name: string;
			provider: string | null;
			request_count: number;
			total_requests: number;
			last_used: number | null;
			created_at: number;
			rate_limited_until: number | null;
			rate_limit_reset: number | null;
			rate_limit_status: string | null;
			rate_limit_remaining: number | null;
			session_start: number | null;
			session_request_count: number;
			account_tier: number;
			paused: 0 | 1;
			token_valid: 0 | 1;
			rate_limited: 0 | 1;
			session_info: string | null;
		}>;

		const response: AccountResponse[] = accounts.map((account) => {
			let rateLimitStatus = "OK";

			// Use unified rate limit status if available
			if (account.rate_limit_status) {
				rateLimitStatus = account.rate_limit_status;
				if (account.rate_limit_reset && account.rate_limit_reset > now) {
					const minutesLeft = Math.ceil(
						(account.rate_limit_reset - now) / 60000,
					);
					rateLimitStatus = `${account.rate_limit_status} (${minutesLeft}m)`;
				}
			} else if (
				account.rate_limited &&
				account.rate_limited_until &&
				account.rate_limited_until > now
			) {
				// Fall back to legacy rate limit check
				const minutesLeft = Math.ceil(
					(account.rate_limited_until - now) / 60000,
				);
				rateLimitStatus = `Rate limited (${minutesLeft}m)`;
			}

			return {
				id: account.id,
				name: account.name,
				provider: account.provider || "anthropic",
				requestCount: account.request_count,
				totalRequests: account.total_requests,
				lastUsed: account.last_used
					? new Date(account.last_used).toISOString()
					: null,
				created: new Date(account.created_at).toISOString(),
				tier: account.account_tier,
				paused: account.paused === 1,
				tokenStatus: account.token_valid ? "valid" : "expired",
				rateLimitStatus,
				rateLimitReset: account.rate_limit_reset
					? new Date(account.rate_limit_reset).toISOString()
					: null,
				rateLimitRemaining: account.rate_limit_remaining,
				sessionInfo: account.session_info || "",
			};
		});

		return new Response(JSON.stringify(response), {
			headers: { "Content-Type": "application/json" },
		});
	};
}

/**
 * Create an account tier update handler
 */
export function createAccountTierUpdateHandler(dbOps: DatabaseOperations) {
	return async (req: Request, accountId: string): Promise<Response> => {
		try {
			const body = (await req.json()) as { tier: number };
			const { tier } = body;

			if (!tier || ![1, 5, 20].includes(tier)) {
				return new Response(
					JSON.stringify({ error: "Invalid tier. Must be 1, 5, or 20" }),
					{
						status: 400,
						headers: { "Content-Type": "application/json" },
					},
				);
			}

			dbOps.updateAccountTier(accountId, tier);

			return new Response(JSON.stringify({ success: true, tier }), {
				headers: { "Content-Type": "application/json" },
			});
		} catch (_error) {
			return new Response(
				JSON.stringify({ error: "Failed to update account tier" }),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				},
			);
		}
	};
}

// Store PKCE verifiers temporarily (in production, use a proper cache)
const pkceStore = new Map<
	string,
	{ verifier: string; mode: "max" | "console"; tier: number }
>();

/**
 * Create an account add handler
 */
export function createAccountAddHandler(dbOps: DatabaseOperations) {
	return async (req: Request): Promise<Response> => {
		try {
			const body = (await req.json()) as {
				name: string;
				mode?: "max" | "console";
				tier?: number;
				code?: string;
				step?: "init" | "callback";
			};
			const { name, mode = "max", tier = 1, code, step = "init" } = body;

			if (!name || typeof name !== "string") {
				return new Response(
					JSON.stringify({ error: "Account name is required" }),
					{
						status: 400,
						headers: { "Content-Type": "application/json" },
					},
				);
			}

			// Step 1: Initialize OAuth flow
			if (step === "init") {
				// Check if account already exists
				const existingAccounts = dbOps.getAllAccounts();
				if (existingAccounts.some((a) => a.name === name)) {
					return new Response(
						JSON.stringify({
							error: `Account with name '${name}' already exists`,
						}),
						{
							status: 400,
							headers: { "Content-Type": "application/json" },
						},
					);
				}

				// Get OAuth provider
				const oauthProvider = getOAuthProvider("anthropic");
				if (!oauthProvider) {
					return new Response(
						JSON.stringify({ error: "OAuth provider not found" }),
						{
							status: 500,
							headers: { "Content-Type": "application/json" },
						},
					);
				}

				// Generate PKCE
				const pkce = await generatePKCE();
				const config = new Config();
				const runtime = config.getRuntime();
				const oauthConfig = oauthProvider.getOAuthConfig(mode);
				oauthConfig.clientId = runtime.clientId;

				// Generate auth URL
				const authUrl = oauthProvider.generateAuthUrl(oauthConfig, pkce);

				// Store PKCE verifier for later
				pkceStore.set(name, { verifier: pkce.verifier, mode, tier });

				// Clean up old entries after 10 minutes
				setTimeout(() => pkceStore.delete(name), 10 * 60 * 1000);

				return new Response(
					JSON.stringify({
						success: true,
						authUrl,
						step: "authorize",
					}),
					{
						headers: { "Content-Type": "application/json" },
					},
				);
			}

			// Step 2: Handle OAuth callback
			if (step === "callback") {
				if (!code) {
					return new Response(
						JSON.stringify({ error: "Authorization code is required" }),
						{
							status: 400,
							headers: { "Content-Type": "application/json" },
						},
					);
				}

				// Get stored PKCE verifier
				const pkceData = pkceStore.get(name);
				if (!pkceData) {
					return new Response(
						JSON.stringify({
							error: "OAuth session expired. Please try again.",
						}),
						{
							status: 400,
							headers: { "Content-Type": "application/json" },
						},
					);
				}

				const { verifier, mode: savedMode, tier: savedTier } = pkceData;

				// Get OAuth provider
				const oauthProvider = getOAuthProvider("anthropic");
				if (!oauthProvider) {
					return new Response(
						JSON.stringify({ error: "OAuth provider not found" }),
						{
							status: 500,
							headers: { "Content-Type": "application/json" },
						},
					);
				}

				const config = new Config();
				const runtime = config.getRuntime();
				const oauthConfig = oauthProvider.getOAuthConfig(savedMode);
				oauthConfig.clientId = runtime.clientId;

				// Exchange code for tokens
				const tokens = await oauthProvider.exchangeCode(
					code,
					verifier,
					oauthConfig,
				);

				// Create account in database
				const db = dbOps.getDatabase();
				const accountId = crypto.randomUUID();
				db.run(
					`
					INSERT INTO accounts (
						id, name, provider, refresh_token, access_token, expires_at, 
						created_at, request_count, total_requests, account_tier
					) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?)
					`,
					[
						accountId,
						name,
						"anthropic",
						tokens.refreshToken,
						tokens.accessToken,
						tokens.expiresAt,
						Date.now(),
						savedTier,
					],
				);

				// Clean up PKCE data
				pkceStore.delete(name);

				return new Response(
					JSON.stringify({
						success: true,
						message: `Account '${name}' added successfully!`,
						mode: savedMode === "max" ? "Claude Max" : "Claude Console",
						tier: savedTier,
					}),
					{
						headers: { "Content-Type": "application/json" },
					},
				);
			}

			return new Response(JSON.stringify({ error: "Invalid step" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		} catch (error) {
			console.error("Account add error:", error);
			return new Response(
				JSON.stringify({
					error:
						error instanceof Error ? error.message : "Failed to add account",
				}),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				},
			);
		}
	};
}

/**
 * Create an account remove handler
 */
export function createAccountRemoveHandler(dbOps: DatabaseOperations) {
	return async (req: Request, accountName: string): Promise<Response> => {
		const JSON_HEADERS = { "Content-Type": "application/json" };

		try {
			// Parse and validate confirmation
			const body = (await req.json()) as AccountDeleteRequest;
			if (!body.confirm || body.confirm !== accountName) {
				return new Response(
					JSON.stringify({
						error: "Confirmation string does not match account name",
						confirmationRequired: true,
					}),
					{
						status: 400,
						headers: JSON_HEADERS,
					},
				);
			}

			const result = cliCommands.removeAccount(dbOps, accountName);

			if (!result.success) {
				return new Response(JSON.stringify({ error: result.message }), {
					status: 404,
					headers: JSON_HEADERS,
				});
			}

			return new Response(
				JSON.stringify({
					success: true,
					message: result.message,
				}),
				{
					headers: JSON_HEADERS,
				},
			);
		} catch (error) {
			return new Response(
				JSON.stringify({
					error:
						error instanceof Error ? error.message : "Failed to remove account",
				}),
				{
					status: 500,
					headers: JSON_HEADERS,
				},
			);
		}
	};
}

/**
 * Create an account pause handler
 */
export function createAccountPauseHandler(dbOps: DatabaseOperations) {
	return async (_req: Request, accountId: string): Promise<Response> => {
		try {
			// Get account name by ID
			const db = dbOps.getDatabase();
			const account = db
				.query<{ name: string }, [string]>(
					"SELECT name FROM accounts WHERE id = ?",
				)
				.get(accountId);

			if (!account) {
				return new Response(JSON.stringify({ error: "Account not found" }), {
					status: 404,
					headers: { "Content-Type": "application/json" },
				});
			}

			const result = cliCommands.pauseAccount(dbOps, account.name);

			if (!result.success) {
				return new Response(JSON.stringify({ error: result.message }), {
					status: 400,
					headers: { "Content-Type": "application/json" },
				});
			}

			return new Response(
				JSON.stringify({
					success: true,
					message: result.message,
				}),
				{
					headers: { "Content-Type": "application/json" },
				},
			);
		} catch (error) {
			return new Response(
				JSON.stringify({
					error:
						error instanceof Error ? error.message : "Failed to pause account",
				}),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				},
			);
		}
	};
}

/**
 * Create an account resume handler
 */
export function createAccountResumeHandler(dbOps: DatabaseOperations) {
	return async (_req: Request, accountId: string): Promise<Response> => {
		try {
			// Get account name by ID
			const db = dbOps.getDatabase();
			const account = db
				.query<{ name: string }, [string]>(
					"SELECT name FROM accounts WHERE id = ?",
				)
				.get(accountId);

			if (!account) {
				return new Response(JSON.stringify({ error: "Account not found" }), {
					status: 404,
					headers: { "Content-Type": "application/json" },
				});
			}

			const result = cliCommands.resumeAccount(dbOps, account.name);

			if (!result.success) {
				return new Response(JSON.stringify({ error: result.message }), {
					status: 400,
					headers: { "Content-Type": "application/json" },
				});
			}

			return new Response(
				JSON.stringify({
					success: true,
					message: result.message,
				}),
				{
					headers: { "Content-Type": "application/json" },
				},
			);
		} catch (error) {
			return new Response(
				JSON.stringify({
					error:
						error instanceof Error ? error.message : "Failed to resume account",
				}),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				},
			);
		}
	};
}
