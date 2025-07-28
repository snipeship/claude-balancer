import type { Config } from "@ccflare/config";
import type { DatabaseOperations } from "@ccflare/database";
import { generatePKCE, getOAuthProvider } from "@ccflare/providers";
import {
	type PromptAdapter,
	promptAccountRemovalConfirmation,
	stdPromptAdapter,
} from "../prompts/index";
import { openBrowser } from "../utils/browser";

export interface AddAccountOptions {
	name: string;
	mode?: "max" | "console";
	tier?: 1 | 5 | 20;
	adapter?: PromptAdapter;
}

export interface AccountListItem {
	id: string;
	name: string;
	provider: string;
	tierDisplay: string;
	created: Date;
	lastUsed: Date | null;
	requestCount: number;
	totalRequests: number;
	paused: boolean;
	tokenStatus: "valid" | "expired";
	rateLimitStatus: string;
	sessionInfo: string;
	tier: number;
	mode: "max" | "console";
}

/**
 * Add a new account using OAuth flow
 */
export async function addAccount(
	dbOps: DatabaseOperations,
	config: Config,
	options: AddAccountOptions,
): Promise<void> {
	const {
		name,
		mode: providedMode,
		tier: providedTier,
		adapter = stdPromptAdapter,
	} = options;
	const runtime = config.getRuntime();

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

	// Prompt for mode if not provided
	const mode =
		providedMode ||
		(await adapter.select("What type of account would you like to add?", [
			{ label: "Claude Max account", value: "max" },
			{ label: "Claude Console account", value: "console" },
		]));

	// Generate PKCE
	const pkce = await generatePKCE();
	const oauthConfig = oauthProvider.getOAuthConfig(mode);
	oauthConfig.clientId = runtime.clientId;

	// Generate auth URL
	const authUrl = oauthProvider.generateAuthUrl(oauthConfig, pkce);

	// Open browser and prompt for code
	console.log(`\nOpening browser to authenticate...`);
	const browserOpened = await openBrowser(authUrl);
	if (!browserOpened) {
		console.log(`Please open the following URL in your browser:\n${authUrl}`);
	}

	// Get authorization code
	const code = await adapter.input("\nEnter the authorization code: ");

	// Exchange code for tokens
	console.log("\nExchanging code for tokens...");
	const tokens = await oauthProvider.exchangeCode(
		code,
		pkce.verifier,
		oauthConfig,
	);

	// Get tier for Max accounts
	const tier =
		mode === "max"
			? providedTier ||
				(await adapter.select(
					"Select the tier for this account (used for weighted load balancing):",
					[
						{ label: "1x tier (default free account)", value: 1 },
						{ label: "5x tier (paid account)", value: 5 },
						{ label: "20x tier (enterprise account)", value: 20 },
					],
				))
			: 1;

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
 * Get list of all accounts with formatted information
 */
export function getAccountsList(dbOps: DatabaseOperations): AccountListItem[] {
	const accounts = dbOps.getAllAccounts();
	const now = Date.now();

	return accounts.map((account) => {
		const tierDisplay = `${account.account_tier}x`;
		const tokenStatus =
			account.expires_at && account.expires_at > now ? "valid" : "expired";

		let rateLimitStatus = "OK";
		if (account.paused) {
			rateLimitStatus = "Paused";
		} else if (account.rate_limited_until && account.rate_limited_until > now) {
			const minutesLeft = Math.ceil((account.rate_limited_until - now) / 60000);
			rateLimitStatus = `Rate limited (${minutesLeft}m)`;
		}

		let sessionInfo = "-";
		if (account.session_start) {
			const sessionAge = Math.floor((now - account.session_start) / 60000);
			sessionInfo = `${account.session_request_count} reqs, ${sessionAge}m ago`;
		}

		return {
			id: account.id,
			name: account.name,
			provider: account.provider,
			tierDisplay,
			created: new Date(account.created_at),
			lastUsed: account.last_used ? new Date(account.last_used) : null,
			requestCount: account.request_count,
			totalRequests: account.total_requests,
			paused: account.paused,
			tokenStatus,
			rateLimitStatus,
			sessionInfo,
			tier: account.account_tier || 1,
			mode: account.account_tier > 1 ? "max" : "console",
		};
	});
}

/**
 * Remove an account by name
 */
export function removeAccount(
	dbOps: DatabaseOperations,
	name: string,
): { success: boolean; message: string } {
	const db = dbOps.getDatabase();
	const result = db.run("DELETE FROM accounts WHERE name = ?", [name]);

	if (result.changes === 0) {
		return {
			success: false,
			message: `Account '${name}' not found`,
		};
	}

	return {
		success: true,
		message: `Account '${name}' removed successfully`,
	};
}

/**
 * Remove an account by name with confirmation prompt (for CLI)
 */
export async function removeAccountWithConfirmation(
	dbOps: DatabaseOperations,
	name: string,
	force?: boolean,
): Promise<{ success: boolean; message: string }> {
	// Check if account exists first
	const accounts = dbOps.getAllAccounts();
	const exists = accounts.some((a) => a.name === name);

	if (!exists) {
		return {
			success: false,
			message: `Account '${name}' not found`,
		};
	}

	// Skip confirmation if force flag is set
	if (!force) {
		const confirmed = await promptAccountRemovalConfirmation(name);
		if (!confirmed) {
			return {
				success: false,
				message: "Account removal cancelled",
			};
		}
	}

	return removeAccount(dbOps, name);
}

/**
 * Pause an account by name
 */
export function pauseAccount(
	dbOps: DatabaseOperations,
	name: string,
): { success: boolean; message: string } {
	const db = dbOps.getDatabase();

	// Get account ID by name
	const account = db
		.query<{ id: string; paused: 0 | 1 }, [string]>(
			"SELECT id, COALESCE(paused, 0) as paused FROM accounts WHERE name = ?",
		)
		.get(name);

	if (!account) {
		return {
			success: false,
			message: `Account '${name}' not found`,
		};
	}

	if (account.paused === 1) {
		return {
			success: false,
			message: `Account '${name}' is already paused`,
		};
	}

	dbOps.pauseAccount(account.id);

	return {
		success: true,
		message: `Account '${name}' paused successfully`,
	};
}

/**
 * Resume a paused account by name
 */
export function resumeAccount(
	dbOps: DatabaseOperations,
	name: string,
): { success: boolean; message: string } {
	const db = dbOps.getDatabase();

	// Get account ID by name
	const account = db
		.query<{ id: string; paused: 0 | 1 }, [string]>(
			"SELECT id, COALESCE(paused, 0) as paused FROM accounts WHERE name = ?",
		)
		.get(name);

	if (!account) {
		return {
			success: false,
			message: `Account '${name}' not found`,
		};
	}

	if (account.paused === 0) {
		return {
			success: false,
			message: `Account '${name}' is not paused`,
		};
	}

	dbOps.resumeAccount(account.id);

	return {
		success: true,
		message: `Account '${name}' resumed successfully`,
	};
}
