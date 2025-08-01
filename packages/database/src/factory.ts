import { registerDisposable, unregisterDisposable } from "@ccflare/core";
import type { RuntimeConfig, DatabaseProvider } from "@ccflare/config";
import { DatabaseOperations } from "./database-operations";
import { DrizzleDatabaseOperations } from "./drizzle-database-operations";
import { resolveDbPath } from "./paths";

let instance: DatabaseOperations | DrizzleDatabaseOperations | null = null;
let dbPath: string | undefined;
let runtimeConfig: RuntimeConfig | undefined;

export function initialize(
	dbPathParam?: string,
	runtimeConfigParam?: RuntimeConfig,
): void {
	dbPath = dbPathParam;
	runtimeConfig = runtimeConfigParam;
}

export function getInstance(): DatabaseOperations | DrizzleDatabaseOperations {
	if (!instance) {
		// Check environment variables first
		const envProvider = process.env.DATABASE_PROVIDER;
		const envUrl = process.env.DATABASE_URL;

		// Determine provider from environment or config
		const provider = envProvider || runtimeConfig?.database?.provider || 'sqlite';

		// Always use DrizzleDatabaseOperations for consistency
		// Build configuration for DrizzleDatabaseOperations
		const dbConfig = {
			provider: provider as DatabaseProvider,
			url: envUrl || runtimeConfig?.database?.url,
			dbPath: !envUrl && provider === 'sqlite' ? (dbPath || resolveDbPath()) : undefined,
			walMode: runtimeConfig?.database?.walMode,
			busyTimeoutMs: runtimeConfig?.database?.busyTimeoutMs,
			cacheSize: runtimeConfig?.database?.cacheSize,
			synchronous: runtimeConfig?.database?.synchronous,
			mmapSize: runtimeConfig?.database?.mmapSize,
		};

		instance = new DrizzleDatabaseOperations(dbConfig, runtimeConfig);

		// Register with lifecycle manager
		registerDisposable(instance);
	}
	return instance;
}

export function closeAll(): void {
	if (instance) {
		unregisterDisposable(instance);
		instance.close();
		instance = null;
	}
}



export function reset(): void {
	closeAll();
}

export const DatabaseFactory = {
	initialize,
	getInstance,
	closeAll,
	reset,
};
