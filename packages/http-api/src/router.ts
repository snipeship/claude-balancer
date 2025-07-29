import {
	createAccountAddHandler,
	createAccountPauseHandler,
	createAccountRemoveHandler,
	createAccountResumeHandler,
	createAccountsListHandler,
	createAccountTierUpdateHandler,
} from "./handlers/accounts";
import { createAnalyticsHandler } from "./handlers/analytics";
import { createConfigHandlers } from "./handlers/config";
import { createHealthHandler } from "./handlers/health";
import { createLogsStreamHandler } from "./handlers/logs";
import { createLogsHistoryHandler } from "./handlers/logs-history";
import {
	createRequestsDetailHandler,
	createRequestsSummaryHandler,
	createRequestPayloadHandler,
} from "./handlers/requests";
import { createStatsHandler, createStatsResetHandler } from "./handlers/stats";
import type { APIContext } from "./types";
import { errorResponse } from "./utils/http-error";

/**
 * API Router that handles all API endpoints
 */
export class APIRouter {
	private context: APIContext;
	private handlers: Map<
		string,
		(req: Request, url: URL) => Response | Promise<Response>
	>;

	constructor(context: APIContext) {
		this.context = context;
		this.handlers = new Map();
		this.registerHandlers();
	}

	private registerHandlers(): void {
		const { db, config, dbOps } = this.context;

		// Create handlers
		const healthHandler = createHealthHandler(db, config);
		const statsHandler = createStatsHandler(db);
		const statsResetHandler = createStatsResetHandler(dbOps);
		const accountsHandler = createAccountsListHandler(db);
		const accountAddHandler = createAccountAddHandler(dbOps);
		const _accountRemoveHandler = createAccountRemoveHandler(dbOps);
		const _accountTierHandler = createAccountTierUpdateHandler(dbOps);
		const requestsSummaryHandler = createRequestsSummaryHandler(db);
		const requestsDetailHandler = createRequestsDetailHandler(dbOps);
		const requestPayloadHandler = createRequestPayloadHandler(dbOps);
		const configHandlers = createConfigHandlers(config);
		const logsStreamHandler = createLogsStreamHandler();
		const logsHistoryHandler = createLogsHistoryHandler();
		const analyticsHandler = createAnalyticsHandler(this.context);

		// Register routes
		this.handlers.set("GET:/health", () => healthHandler());
		this.handlers.set("GET:/api/stats", () => statsHandler());
		this.handlers.set("POST:/api/stats/reset", () => statsResetHandler());
		this.handlers.set("GET:/api/accounts", () => accountsHandler());
		this.handlers.set("POST:/api/accounts", (req) => accountAddHandler(req));
		this.handlers.set("GET:/api/requests", (_req, url) => {
			const limit = parseInt(url.searchParams.get("limit") || "50");
			return requestsSummaryHandler(limit);
		});
		this.handlers.set("GET:/api/requests/detail", (_req, url) => {
			const limit = parseInt(url.searchParams.get("limit") || "100");
			return requestsDetailHandler(limit);
		});
		this.handlers.set("GET:/api/requests/payload/:id", (_req, url) => {
			const pathParts = url.pathname.split('/');
			const requestId = pathParts[pathParts.length - 1];
			return requestPayloadHandler(requestId);
		});
		this.handlers.set("GET:/api/config", () => configHandlers.getConfig());
		this.handlers.set("GET:/api/config/strategy", () =>
			configHandlers.getStrategy(),
		);
		this.handlers.set("POST:/api/config/strategy", (req) =>
			configHandlers.setStrategy(req),
		);
		this.handlers.set("GET:/api/strategies", () =>
			configHandlers.getStrategies(),
		);
		this.handlers.set("GET:/api/logs/stream", () => logsStreamHandler());
		this.handlers.set("GET:/api/logs/history", () => logsHistoryHandler());
		this.handlers.set("GET:/api/analytics", (_req, url) => {
			return analyticsHandler(url.searchParams);
		});
	}

	/**
	 * Wrap a handler with error handling
	 */
	private wrapHandler(
		handler: (req: Request, url: URL) => Response | Promise<Response>,
	): (req: Request, url: URL) => Promise<Response> {
		return async (req: Request, url: URL) => {
			try {
				return await handler(req, url);
			} catch (error) {
				return errorResponse(error);
			}
		};
	}

	/**
	 * Handle an incoming request
	 */
	async handleRequest(url: URL, req: Request): Promise<Response | null> {
		const path = url.pathname;
		const method = req.method;
		const key = `${method}:${path}`;

		// Check for exact match
		const handler = this.handlers.get(key);
		if (handler) {
			return await this.wrapHandler(handler)(req, url);
		}

		// Check for dynamic account endpoints
		if (path.startsWith("/api/accounts/")) {
			const parts = path.split("/");
			const accountId = parts[3];

			// Account tier update
			if (path.endsWith("/tier") && method === "POST") {
				const tierHandler = createAccountTierUpdateHandler(this.context.dbOps);
				return await this.wrapHandler((req) => tierHandler(req, accountId))(
					req,
					url,
				);
			}

			// Account pause
			if (path.endsWith("/pause") && method === "POST") {
				const pauseHandler = createAccountPauseHandler(this.context.dbOps);
				return await this.wrapHandler((req) => pauseHandler(req, accountId))(
					req,
					url,
				);
			}

			// Account resume
			if (path.endsWith("/resume") && method === "POST") {
				const resumeHandler = createAccountResumeHandler(this.context.dbOps);
				return await this.wrapHandler((req) => resumeHandler(req, accountId))(
					req,
					url,
				);
			}

			// Account removal
			if (parts.length === 4 && method === "DELETE") {
				const removeHandler = createAccountRemoveHandler(this.context.dbOps);
				return await this.wrapHandler((req) => removeHandler(req, accountId))(
					req,
					url,
				);
			}
		}

		// No matching route
		return null;
	}
}
