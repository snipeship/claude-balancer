import type { AccountListItem } from "@ccflare/cli-commands";
import * as cliCommands from "@ccflare/cli-commands";
import { openBrowser } from "@ccflare/cli-commands";
import { Config } from "@ccflare/config";
import { DatabaseFactory } from "@ccflare/database";
import {
	generatePKCE,
	getOAuthProvider,
	type OAuthConfig,
} from "@ccflare/providers";

export interface AddAccountOptions {
	name: string;
	mode?: "max" | "console";
	tier?: 1 | 5 | 20;
}

export interface OAuthFlowResult {
	authUrl: string;
	pkce: { verifier: string; challenge: string };
	oauthConfig: OAuthConfig;
}

/**
 * Begin OAuth flow for adding an account (TUI version)
 * Returns the auth URL and PKCE data needed to complete the flow
 */
export async function beginAddAccount(
	options: AddAccountOptions,
): Promise<OAuthFlowResult> {
	const { name, mode = "max" } = options;
	const config = new Config();
	const runtime = config.getRuntime();
	const dbOps = DatabaseFactory.getInstance();

	// Check if account exists
	const existingAccounts = dbOps.getAllAccounts();
	if (existingAccounts.some((a) => a.name === name)) {
		throw new Error(`Account with name '${name}' already exists`);
	}

	// Get provider
	const oauthProvider = getOAuthProvider("anthropic");
	if (!oauthProvider) {
		throw new Error("Anthropic OAuth provider not found");
	}

	// Generate PKCE
	const pkce = await generatePKCE();
	const oauthConfig = oauthProvider.getOAuthConfig(mode);
	oauthConfig.clientId = runtime.clientId;

	// Generate auth URL
	const authUrl = oauthProvider.generateAuthUrl(oauthConfig, pkce);

	// Open browser
	console.log(`\nOpening browser to authenticate...`);
	const browserOpened = await openBrowser(authUrl);
	if (!browserOpened) {
		console.log(`Please open the following URL in your browser:\n${authUrl}`);
	}

	return { authUrl, pkce, oauthConfig };
}

/**
 * Complete OAuth flow after receiving authorization code
 */
export async function completeAddAccount(
	options: AddAccountOptions & { code: string; flowData: OAuthFlowResult },
): Promise<void> {
	const { name, mode = "max", tier = 1, code, flowData } = options;
	const dbOps = DatabaseFactory.getInstance();

	// Get provider
	const oauthProvider = getOAuthProvider("anthropic");
	if (!oauthProvider) {
		throw new Error("Anthropic OAuth provider not found");
	}

	// Exchange code for tokens
	console.log("\nExchanging code for tokens...");
	const tokens = await oauthProvider.exchangeCode(
		code,
		flowData.pkce.verifier,
		flowData.oauthConfig,
	);

	// Create account
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
			tier,
		],
	);

	console.log(`\nAccount '${name}' added successfully!`);
	console.log(`Type: ${mode === "max" ? "Claude Max" : "Claude Console"}`);
	console.log(`Tier: ${tier}x`);
}

/**
 * Legacy function for non-TUI usage
 */
export async function addAccount(options: AddAccountOptions): Promise<void> {
	const dbOps = DatabaseFactory.getInstance();
	const config = new Config();
	await cliCommands.addAccount(dbOps, config, options);
}

export async function getAccounts(): Promise<AccountListItem[]> {
	const dbOps = DatabaseFactory.getInstance();
	return await cliCommands.getAccountsList(dbOps);
}

export async function removeAccount(name: string): Promise<void> {
	const dbOps = DatabaseFactory.getInstance();
	await cliCommands.removeAccount(dbOps, name);
}
