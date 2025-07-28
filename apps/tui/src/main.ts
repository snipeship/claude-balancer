#!/usr/bin/env bun
import { Config } from "@ccflare/config";
import { shutdown } from "@ccflare/core";
import { container, SERVICE_KEYS } from "@ccflare/core-di";
import { DatabaseFactory } from "@ccflare/database";
import { Logger } from "@ccflare/logger";
import * as tuiCore from "@ccflare/tui-core";
import { parseArgs } from "@ccflare/tui-core";
import { render } from "ink";
import React from "react";
import { App } from "./App";

// Global singleton for auto-started server
let runningServer: tuiCore.ServeResult | null = null;

async function ensureServer(port: number) {
	if (!runningServer) {
		runningServer = await tuiCore.serve({ port, withDashboard: true });
	}
	return runningServer;
}

async function main() {
	// Initialize DI container and services
	container.registerInstance(SERVICE_KEYS.Config, new Config());
	container.registerInstance(SERVICE_KEYS.Logger, new Logger("TUI"));

	// Initialize database factory
	DatabaseFactory.initialize();
	const dbOps = DatabaseFactory.getInstance();
	container.registerInstance(SERVICE_KEYS.Database, dbOps);

	const args = process.argv.slice(2);
	const parsed = parseArgs(args);

	// Handle help
	if (parsed.help) {
		console.log(`
🎯 ccflare - Load Balancer for Claude

Usage: ccflare [options]

Options:
  --serve              Start API server with dashboard
  --logs [N]           Stream latest N lines then follow
  --stats              Show statistics (JSON output)
  --add-account <name> Add a new account
    --mode <max|console>  Account mode (default: max)
    --tier <1|5|20>       Account tier (default: 1)
  --list               List all accounts
  --remove <name>      Remove an account
  --reset-stats        Reset usage statistics
  --clear-history      Clear request history
  --help, -h           Show this help message

Interactive Mode:
  ccflare          Launch interactive TUI (default)

Examples:
  ccflare                        # Interactive mode
  ccflare --serve                # Start server
  ccflare --add-account work     # Add account
  ccflare --stats                # View stats
`);
		process.exit(0);
	}

	// Handle non-interactive commands
	if (parsed.serve) {
		await tuiCore.serve({ port: parsed.port });
		return;
	}

	if (parsed.logs !== undefined) {
		const _limit = typeof parsed.logs === "number" ? parsed.logs : 100;
		await tuiCore.streamLogs((log) => {
			console.log(`[${log.level}] ${log.msg}`);
		});
		return;
	}

	if (parsed.stats) {
		const stats = await tuiCore.getStats();
		console.log(JSON.stringify(stats, null, 2));
		return;
	}

	if (parsed.addAccount) {
		await tuiCore.addAccount({
			name: parsed.addAccount,
			mode: parsed.mode || "max",
			tier: parsed.tier || 1,
		});
		console.log(`✅ Account "${parsed.addAccount}" added successfully`);
		return;
	}

	if (parsed.list) {
		const accounts = await tuiCore.getAccounts();
		if (accounts.length === 0) {
			console.log("No accounts configured");
		} else {
			console.log("\nAccounts:");
			accounts.forEach((acc) => {
				console.log(`  - ${acc.name} (${acc.mode} mode, tier ${acc.tier})`);
			});
		}
		return;
	}

	if (parsed.remove) {
		await tuiCore.removeAccount(parsed.remove);
		console.log(`✅ Account "${parsed.remove}" removed successfully`);
		return;
	}

	if (parsed.resetStats) {
		await tuiCore.resetStats();
		console.log("✅ Statistics reset successfully");
		return;
	}

	if (parsed.clearHistory) {
		await tuiCore.clearHistory();
		console.log("✅ Request history cleared successfully");
		return;
	}

	// Default: Launch interactive TUI with auto-started server
	await ensureServer(parsed.port || 8080);
	const { waitUntilExit } = render(React.createElement(App));
	await waitUntilExit();

	// Cleanup server when TUI exits
	if (runningServer) {
		runningServer.cleanup();
	}

	// Shutdown all resources
	await shutdown();
}

// Run main and handle errors
main().catch(async (error) => {
	console.error("Error:", error.message);
	try {
		await shutdown();
	} catch (shutdownError) {
		console.error("Error during shutdown:", shutdownError);
	}
	process.exit(1);
});

// Handle process termination
process.on("SIGINT", async () => {
	try {
		await shutdown();
	} catch (error) {
		console.error("Error during shutdown:", error);
	}
	process.exit(0);
});

process.on("SIGTERM", async () => {
	try {
		await shutdown();
	} catch (error) {
		console.error("Error during shutdown:", error);
	}
	process.exit(0);
});
