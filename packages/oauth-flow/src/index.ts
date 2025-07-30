import type { Config } from "@ccflare/config";
import type { DatabaseOperations } from "@ccflare/database";
import {
	generatePKCE,
	getOAuthProvider,
	type OAuthProviderConfig,
	type OAuthTokens,
	type PKCEChallenge,
} from "@ccflare/providers";
import type { AccountTier } from "@ccflare/types";

export interface BeginOptions {
	name: string;
	mode: "max" | "console";
}

export interface BeginResult {
	sessionId: string;
	authUrl: string;
	pkce: PKCEChallenge;
	oauthConfig: OAuthProviderConfig;
}

export interface CompleteOptions {
	sessionId: string;
	code: string;
	tier?: AccountTier;
	name: string; // Required to properly create the account
}

export interface AccountCreated {
	id: string;
	name: string;
	tier: number;
	provider: "anthropic";
}

export interface OAuthFlowResult {
	success: boolean;
	message: string;
	data?: AccountCreated;
}

export class OAuthFlow {
	constructor(
		private dbOps: DatabaseOperations,
		private config: Config,
	) {}

	/**
	 * Begin OAuth flow - generates PKCE, creates session, returns auth URL
	 */
	async begin(opts: BeginOptions): Promise<BeginResult> {
		const { name, mode } = opts;

		// Check if account already exists
		const existingAccounts = this.dbOps.getAllAccounts();
		if (existingAccounts.some((a) => a.name === name)) {
			throw new Error(`Account with name '${name}' already exists`);
		}

		// Get OAuth provider
		const oauthProvider = getOAuthProvider("anthropic");
		if (!oauthProvider) {
			throw new Error("Anthropic OAuth provider not found");
		}

		// Generate PKCE challenge
		const pkce = await generatePKCE();

		// Get OAuth config with runtime client ID
		const runtime = this.config.getRuntime();
		const oauthConfig = oauthProvider.getOAuthConfig(mode);
		oauthConfig.clientId = runtime.clientId;

		// Generate auth URL
		const authUrl = oauthProvider.generateAuthUrl(oauthConfig, pkce);

		// Create session ID (could be stored in DB for multi-instance setups)
		const sessionId = crypto.randomUUID();

		// Store session data in memory or DB
		// For now, we'll return it to be passed back in complete()
		// In a production system, this would be stored in Redis or DB

		return {
			sessionId,
			authUrl,
			pkce,
			oauthConfig,
		};
	}

	/**
	 * Complete OAuth flow - exchanges code for tokens and creates account
	 */
	async complete(
		opts: CompleteOptions,
		flowData: BeginResult,
	): Promise<AccountCreated> {
		const { code, tier = 1 } = opts;

		// Get OAuth provider
		const oauthProvider = getOAuthProvider("anthropic");
		if (!oauthProvider) {
			throw new Error("Anthropic OAuth provider not found");
		}

		// Exchange authorization code for tokens
		const tokens = await oauthProvider.exchangeCode(
			code,
			flowData.pkce.verifier,
			flowData.oauthConfig,
		);

		// Create account in database
		const accountId = crypto.randomUUID();
		const account = this.createAccount(accountId, opts.name, tokens, tier);

		return account;
	}

	/**
	 * Create account in database
	 */
	private createAccount(
		id: string,
		name: string,
		tokens: OAuthTokens,
		tier: AccountTier,
	): AccountCreated {
		const db = this.dbOps.getDatabase();

		// Parse name from session data (in real implementation, this would be retrieved from session store)
		// For now, we'll need to pass the name through the complete method
		// This is a limitation of the current design that should be addressed

		db.run(
			`
			INSERT INTO accounts (
				id, name, provider, refresh_token, access_token, expires_at, 
				created_at, request_count, total_requests, account_tier
			) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?)
			`,
			[
				id,
				name, // This needs to be passed properly
				"anthropic",
				tokens.refreshToken || "",
				tokens.accessToken,
				tokens.expiresAt,
				Date.now(),
				tier,
			],
		);

		return {
			id,
			name,
			tier,
			provider: "anthropic",
		};
	}
}

// Helper function for simpler usage
export async function createOAuthFlow(
	dbOps: DatabaseOperations,
	config: Config,
): Promise<OAuthFlow> {
	return new OAuthFlow(dbOps, config);
}
