import { Config } from "@ccflare/config";
import { patterns, validateNumber, validateString } from "@ccflare/core";
import type { DatabaseOperations } from "@ccflare/database";
import {
	BadRequest,
	errorResponse,
	InternalServerError,
	jsonResponse,
} from "@ccflare/http-common";
import { Logger } from "@ccflare/logger";
import { createOAuthFlow } from "@ccflare/oauth-flow";

const log = new Logger("OAuthHandler");

/**
 * Create an OAuth initialization handler
 */
export function createOAuthInitHandler(dbOps: DatabaseOperations) {
	return async (req: Request): Promise<Response> => {
		try {
			const body = await req.json();

			// Validate account name
			const name = validateString(body.name, "name", {
				required: true,
				minLength: 1,
				maxLength: 100,
				pattern: patterns.accountName,
			});

			if (!name) {
				return errorResponse(BadRequest("Valid account name is required"));
			}

			// Validate mode
			const mode = (validateString(body.mode, "mode", {
				allowedValues: ["max", "console"] as const,
			}) || "max") as "max" | "console";

			// Validate tier
			const tier =
				validateNumber(body.tier, "tier", {
					allowedValues: [1, 5, 20] as const,
				}) || 1;

			const config = new Config();
			const oauthFlow = await createOAuthFlow(dbOps, config);

			try {
				// Begin OAuth flow using consolidated logic
				const flowResult = await oauthFlow.begin({
					name,
					mode,
				});

				// Store tier in session for later use
				dbOps.createOAuthSession(
					flowResult.sessionId,
					name,
					flowResult.pkce.verifier,
					mode,
					tier,
					10, // 10 minute TTL
				);

				return jsonResponse({
					success: true,
					authUrl: flowResult.authUrl,
					sessionId: flowResult.sessionId,
					step: "authorize",
				});
			} catch (error) {
				if (
					error instanceof Error &&
					error.message.includes("already exists")
				) {
					return errorResponse(BadRequest(error.message));
				}
				return errorResponse(InternalServerError((error as Error).message));
			}
		} catch (error) {
			log.error("OAuth init error:", error);
			return errorResponse(
				error instanceof Error
					? error
					: new Error("Failed to initialize OAuth"),
			);
		}
	};
}

/**
 * Create an OAuth callback handler
 */
export function createOAuthCallbackHandler(dbOps: DatabaseOperations) {
	return async (req: Request): Promise<Response> => {
		try {
			const body = await req.json();

			// Validate session ID
			const sessionId = validateString(body.sessionId, "sessionId", {
				required: true,
				pattern: patterns.uuid,
			});

			if (!sessionId) {
				return errorResponse(BadRequest("Session ID is required"));
			}

			// Validate code
			const code = validateString(body.code, "code", {
				required: true,
				minLength: 1,
			});

			if (!code) {
				return errorResponse(BadRequest("Authorization code is required"));
			}

			// Get stored PKCE verifier from database
			const oauthSession = dbOps.getOAuthSession(sessionId);
			if (!oauthSession) {
				return errorResponse(
					BadRequest("OAuth session expired or invalid. Please try again."),
				);
			}

			const {
				accountName: name,
				verifier,
				mode: savedMode,
				tier: savedTier,
			} = oauthSession;

			try {
				// Create OAuth flow instance
				const config = new Config();
				const oauthFlow = await createOAuthFlow(dbOps, config);

				// We need to reconstruct the flow data since we can't pass the full BeginResult through HTTP
				// The OAuth flow will handle the token exchange and account creation
				const oauthProvider = await import("@ccflare/providers").then((m) =>
					m.getOAuthProvider("anthropic"),
				);
				if (!oauthProvider) {
					throw new Error("OAuth provider not found");
				}
				const runtime = config.getRuntime();
				const oauthConfig = oauthProvider.getOAuthConfig(savedMode);
				oauthConfig.clientId = runtime.clientId;

				const flowData = {
					sessionId,
					authUrl: "", // Not needed for complete
					pkce: { verifier, challenge: "" }, // Only verifier is needed
					oauthConfig,
				};

				await oauthFlow.complete(
					{ sessionId, code, tier: savedTier, name },
					flowData,
				);

				// Clean up OAuth session from database
				dbOps.deleteOAuthSession(sessionId);

				return jsonResponse({
					success: true,
					message: `Account '${name}' added successfully!`,
					mode: savedMode === "max" ? "Claude Max" : "Claude Console",
					tier: savedTier,
				});
			} catch (error) {
				return errorResponse(
					error instanceof Error
						? error
						: new Error("Failed to complete OAuth flow"),
				);
			}
		} catch (error) {
			log.error("OAuth callback error:", error);
			return errorResponse(
				error instanceof Error
					? error
					: new Error("Failed to process OAuth callback"),
			);
		}
	};
}
