import { generatePKCE } from "./pkce";

export interface OAuthConfig {
	clientId: string;
	authorizationUrl: string;
	tokenUrl: string;
	redirectUri: string;
	scopes: string[];
}

export interface OAuthTokens {
	accessToken: string;
	refreshToken?: string;
	expiresAt: number;
}

/**
 * Base class for OAuth providers to reduce duplication
 */
export abstract class BaseOAuthProvider {
	protected config: OAuthConfig;

	constructor(config: OAuthConfig) {
		this.config = config;
	}

	/**
	 * Generate authorization URL with PKCE
	 */
	async generateAuthUrl(
		state: string,
	): Promise<{ url: string; verifier: string }> {
		const { challenge: codeChallenge, verifier: codeVerifier } =
			await generatePKCE();

		const params = new URLSearchParams({
			response_type: "code",
			client_id: this.config.clientId,
			redirect_uri: this.config.redirectUri,
			scope: this.config.scopes.join(" "),
			state,
			code_challenge: codeChallenge,
			code_challenge_method: "S256",
		});

		// Allow subclasses to add custom parameters
		this.addCustomAuthParams(params);

		const url = `${this.config.authorizationUrl}?${params.toString()}`;
		return { url, verifier: codeVerifier };
	}

	/**
	 * Exchange authorization code for tokens
	 */
	async exchangeCodeForTokens(
		code: string,
		verifier: string,
	): Promise<OAuthTokens> {
		const body = new URLSearchParams({
			grant_type: "authorization_code",
			client_id: this.config.clientId,
			code,
			redirect_uri: this.config.redirectUri,
			code_verifier: verifier,
		});

		// Allow subclasses to add custom token parameters
		this.addCustomTokenParams(body);

		const response = await fetch(this.config.tokenUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: body.toString(),
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Token exchange failed: ${error}`);
		}

		const data = await response.json();
		return this.parseTokenResponse(data);
	}

	/**
	 * Refresh tokens using refresh token
	 */
	async refreshTokens(refreshToken: string): Promise<OAuthTokens> {
		const body = new URLSearchParams({
			grant_type: "refresh_token",
			client_id: this.config.clientId,
			refresh_token: refreshToken,
		});

		const response = await fetch(this.config.tokenUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: body.toString(),
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Token refresh failed: ${error}`);
		}

		const data = await response.json();
		return this.parseTokenResponse(data);
	}

	/**
	 * Hook for subclasses to add custom authorization parameters
	 */
	protected addCustomAuthParams(_params: URLSearchParams): void {
		// Default implementation does nothing
	}

	/**
	 * Hook for subclasses to add custom token exchange parameters
	 */
	protected addCustomTokenParams(_params: URLSearchParams): void {
		// Default implementation does nothing
	}

	/**
	 * Parse token response - must be implemented by subclasses
	 */
	protected abstract parseTokenResponse(data: unknown): OAuthTokens;
}
