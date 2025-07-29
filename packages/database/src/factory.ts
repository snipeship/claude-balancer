import { registerDisposable, unregisterDisposable } from "@ccflare/core";
import type { RuntimeConfig as ConfigRuntimeConfig } from "@ccflare/config";
import { DatabaseOperations, type DatabaseConfig, type DatabaseRetryConfig } from "./index";

let instance: DatabaseOperations | null = null;
let dbPath: string | undefined;
let runtimeConfig: ConfigRuntimeConfig | undefined;

export function initialize(
	dbPathParam?: string,
	runtimeConfigParam?: ConfigRuntimeConfig,
): void {
	dbPath = dbPathParam;
	runtimeConfig = runtimeConfigParam;
}

export function getInstance(): DatabaseOperations {
	if (!instance) {
		// Extract database configuration from runtime config
		const dbConfig: DatabaseConfig | undefined = runtimeConfig?.database ? {
			walMode: runtimeConfig.database.walMode,
			busyTimeoutMs: runtimeConfig.database.busyTimeoutMs,
			cacheSize: runtimeConfig.database.cacheSize,
			synchronous: runtimeConfig.database.synchronous,
			mmapSize: runtimeConfig.database.mmapSize,
		} : undefined;

		const retryConfig: DatabaseRetryConfig | undefined = runtimeConfig?.database?.retry;

		instance = new DatabaseOperations(dbPath, dbConfig, retryConfig);
		if (runtimeConfig) {
			instance.setRuntimeConfig(runtimeConfig);
		}
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
