import { dirname } from "node:path";
import { Config } from "@ccflare/config";
import type { LoadBalancingStrategy } from "@ccflare/core";
import {
	DEFAULT_STRATEGY,
	registerDisposable,
	setPricingLogger,
	shutdown,
} from "@ccflare/core";
import { container, SERVICE_KEYS } from "@ccflare/core-di";
// Import React dashboard assets
import dashboardManifest from "@ccflare/dashboard-web/dist/manifest.json";
import { AsyncDbWriter, DatabaseFactory } from "@ccflare/database";
import { APIRouter } from "@ccflare/http-api";
import { SessionStrategy } from "@ccflare/load-balancer";
import { Logger } from "@ccflare/logger";
import { getProvider } from "@ccflare/providers";
import {
	getUsageWorker,
	handleProxy,
	type ProxyContext,
	terminateUsageWorker,
} from "@ccflare/proxy";
import { serve } from "bun";

// Initialize DI container
container.registerInstance(SERVICE_KEYS.Config, new Config());
container.registerInstance(SERVICE_KEYS.Logger, new Logger("Server"));

// Initialize components
const config = container.resolve<Config>(SERVICE_KEYS.Config);
const runtime = config.getRuntime();
DatabaseFactory.initialize(undefined, runtime);
const dbOps = DatabaseFactory.getInstance();
const db = dbOps.getDatabase();
container.registerInstance(SERVICE_KEYS.Database, dbOps);

// Initialize async DB writer
const asyncWriter = new AsyncDbWriter();
container.registerInstance(SERVICE_KEYS.AsyncWriter, asyncWriter);
registerDisposable(asyncWriter);

// Initialize pricing logger
const pricingLogger = new Logger("Pricing");
container.registerInstance(SERVICE_KEYS.PricingLogger, pricingLogger);
setPricingLogger(pricingLogger);

const apiRouter = new APIRouter({ db, config, dbOps });
const log = container.resolve<Logger>(SERVICE_KEYS.Logger);

log.info("Starting ccflare server...");
log.info(`Port: ${runtime.port}`);
log.info(`Session duration: ${runtime.sessionDurationMs}ms`);

// Load balancing strategy initialization
let strategy: LoadBalancingStrategy;

// Refresh token stampede prevention
const refreshInFlight = new Map<string, Promise<string>>();

// Get provider from registry (for now just Anthropic)
const provider = getProvider("anthropic");
if (!provider) {
	throw new Error("Anthropic provider not found in registry");
}

function initStrategy(): LoadBalancingStrategy {
	const strategyName = config.getStrategy();
	log.info(`Initializing load balancing strategy: ${strategyName}`);

	// Only session-based strategy is supported
	const sessionStrategy = new SessionStrategy(runtime.sessionDurationMs);
	sessionStrategy.initialize(dbOps);
	return sessionStrategy;
}

strategy = initStrategy();

// Create proxy context (without worker initially)
const proxyContext: ProxyContext = {
	strategy,
	dbOps,
	runtime,
	provider,
	refreshInFlight,
	asyncWriter,
	usageWorker: null as unknown as Worker, // Will be set below
};

// Initialize usage worker
proxyContext.usageWorker = getUsageWorker();

// Watch for strategy changes
config.on("change", ({ key }) => {
	if (key === "lb_strategy") {
		log.info(`Strategy changed to ${config.getStrategy()}`);
		strategy = initStrategy();
		// Update proxy context strategy
		proxyContext.strategy = strategy;
	}
});

// Main server
const server = serve({
	port: runtime.port,
	idleTimeout: 255, // Max allowed by Bun
	async fetch(req) {
		const url = new URL(req.url);

		// Try API routes first
		const apiResponse = await apiRouter.handleRequest(url, req);
		if (apiResponse) {
			return apiResponse;
		}

		// Check API key for auth protection
		const apiKey = process.env.API_KEY;

		// Dashboard routes
		if (url.pathname === "/" || url.pathname === "/dashboard" || 
			(apiKey && url.pathname === `/${apiKey}/`)) {
			
			// If API key is required, only allow /{key}/ access
			if (apiKey && url.pathname !== `/${apiKey}/`) {
				return new Response("Not Found", { status: 404 });
			}
			// Read the HTML file directly
			let dashboardPath: string;
			try {
				dashboardPath = Bun.resolveSync(
					"@ccflare/dashboard-web/dist/index.html",
					dirname(import.meta.path),
				);
			} catch {
				// Fallback to a relative path within the repo (development / mono-repo usage)
				dashboardPath = Bun.resolveSync(
					"../../../packages/dashboard-web/dist/index.html",
					dirname(import.meta.path),
				);
			}
			const file = Bun.file(dashboardPath);
			if (!file.exists()) {
				return new Response("Not Found", { status: 404 });
			}
			return new Response(file, {
				headers: { "Content-Type": "text/html" },
			});
		}

		// Serve dashboard static assets
		let assetPathname = url.pathname;
		let isAuthenticatedAssetRequest = false;
		
		// If API key is set, check for auth-prefixed asset paths
		if (apiKey && url.pathname.startsWith(`/${apiKey}/`)) {
			// Strip the key prefix for asset lookup
			assetPathname = url.pathname.substring(`/${apiKey}`.length);
			isAuthenticatedAssetRequest = true;
		}
		
		if ((dashboardManifest as Record<string, string>)[assetPathname]) {
			// If API key is required but request is not authenticated, block access
			if (apiKey && !isAuthenticatedAssetRequest) {
				return new Response("Not Found", { status: 404 });
			}
			
			try {
				let assetPath: string;
				try {
					assetPath = Bun.resolveSync(
						`@ccflare/dashboard-web/dist${assetPathname}`,
						dirname(import.meta.path),
					);
				} catch {
					// Fallback to relative path in mono-repo
					assetPath = Bun.resolveSync(
						`../../../packages/dashboard-web/dist${assetPathname}`,
						dirname(import.meta.path),
					);
				}

				const file = Bun.file(assetPath);
				if (!file.exists()) {
					return new Response("Not Found", { status: 404 });
				}
				const mimeType = file.type || "application/octet-stream";
				return new Response(file, {
					headers: {
						"Content-Type": mimeType,
						"Cache-Control": "public, max-age=31536000",
					},
				});
			} catch {
				// Asset not found
			}
		}

		// Handle API authentication and proxying
		if (apiKey) {
			// Auth required - check for /key/v1/ format
			const pathParts = url.pathname.split('/').filter(Boolean);
			if (pathParts[0] === apiKey && pathParts[1] === 'v1') {
				// Valid auth - rewrite path and proxy
				url.pathname = '/' + pathParts.slice(1).join('/');
				return handleProxy(req, url, proxyContext);
			}
			return new Response("Not Found", { status: 404 });
		} else {
			// No auth required - allow direct /v1/ access
			if (!url.pathname.startsWith("/v1/")) {
				return new Response("Not Found", { status: 404 });
			}
			return handleProxy(req, url, proxyContext);
		}
	},
});

console.log(`🚀 ccflare server running on http://localhost:${server.port}`);
console.log(`📊 Dashboard: http://localhost:${server.port}/dashboard`);
console.log(`🔍 Health check: http://localhost:${server.port}/health`);
console.log(
	`⚙️  Current strategy: ${config.getStrategy()} (default: ${DEFAULT_STRATEGY})`,
);

// Log initial account status
const accounts = dbOps.getAllAccounts();
const activeAccounts = accounts.filter(
	(a) => !a.paused && (!a.expires_at || a.expires_at > Date.now()),
);
log.info(
	`Loaded ${accounts.length} accounts (${activeAccounts.length} active)`,
);
if (activeAccounts.length === 0) {
	log.warn(
		"No active accounts available - requests will be forwarded without authentication",
	);
}

// Graceful shutdown
process.on("SIGINT", async () => {
	console.log("\n👋 Shutting down gracefully...");
	try {
		terminateUsageWorker();
		await shutdown();
		console.log("✅ Shutdown complete");
		process.exit(0);
	} catch (error) {
		console.error("❌ Error during shutdown:", error);
		process.exit(1);
	}
});

process.on("SIGTERM", async () => {
	console.log("\n👋 Shutting down gracefully...");
	try {
		terminateUsageWorker();
		await shutdown();
		console.log("✅ Shutdown complete");
		process.exit(0);
	} catch (error) {
		console.error("❌ Error during shutdown:", error);
		process.exit(1);
	}
});

// Export for programmatic use
export default function startServer(_options?: {
	port?: number;
	withDashboard?: boolean;
}) {
	// This is a placeholder for when the server needs to be started programmatically
	return {
		port: server.port,
		stop: () => {
			// Server stop logic
			server.stop();
		},
	};
}
