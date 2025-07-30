import { OAuthError } from "@ccflare/core";
import type {
	OAuthProvider,
	OAuthProviderConfig,
	PKCEChallenge,
	TokenResult,
} from "../../types";

export class AnthropicOAuthProvider implements OAuthProvider {
	getOAuthConfig(mode: "console" | "max" = "console"): OAuthProviderConfig {
		const baseUrl =
			mode === "console"
				? "https://console.anthropic.com"
				: "https://claude.ai";

		return {
			authorizeUrl: `${baseUrl}/oauth/authorize`,
			tokenUrl: "https://console.anthropic.com/v1/oauth/token",
			clientId: "", // Will be passed from config
			scopes: ["org:create_api_key", "user:profile", "user:inference"],
			redirectUri: "https://console.anthropic.com/oauth/code/callback",
			mode,
		};
	}

	generateAuthUrl(config: OAuthProviderConfig, pkce: PKCEChallenge): string {
		const url = new URL(config.authorizeUrl);
		url.searchParams.set("code", "true");
		url.searchParams.set("client_id", config.clientId);
		url.searchParams.set("response_type", "code");
		url.searchParams.set("redirect_uri", config.redirectUri);
		url.searchParams.set("scope", config.scopes.join(" "));
		url.searchParams.set("code_challenge", pkce.challenge);
		url.searchParams.set("code_challenge_method", "S256");
		url.searchParams.set("state", pkce.verifier);
		return url.toString();
	}

	async exchangeCode(
		code: string,
		verifier: string,
		config: OAuthProviderConfig,
	): Promise<TokenResult> {
		const splits = code.split("#");
		const response = await fetch(config.tokenUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				code: splits[0],
				state: splits[1],
				grant_type: "authorization_code",
				client_id: config.clientId,
				redirect_uri: config.redirectUri,
				code_verifier: verifier,
			}),
		});

		if (!response.ok) {
			let errorDetails: { error?: string; error_description?: string } | null =
				null;
			try {
				errorDetails = await response.json();
			} catch {
				// Failed to parse error response
			}

			const errorMessage =
				errorDetails?.error_description ||
				errorDetails?.error ||
				response.statusText ||
				"OAuth token exchange failed";

			throw new OAuthError(errorMessage, "anthropic", errorDetails?.error);
		}

		const json = (await response.json()) as {
			refresh_token: string;
			access_token: string;
			expires_in: number;
		};

		return {
			refreshToken: json.refresh_token,
			accessToken: json.access_token,
			expiresAt: Date.now() + json.expires_in * 1000,
		};
	}
}
