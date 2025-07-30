import { registerDisposable, unregisterDisposable } from "@ccflare/core";
import { DatabaseOperations, type RuntimeConfig } from "./index";

let instance: DatabaseOperations | null = null;
let dbPath: string | undefined;
let runtimeConfig: RuntimeConfig | undefined;

export function initialize(
	dbPathParam?: string,
	runtimeConfigParam?: RuntimeConfig,
): void {
	dbPath = dbPathParam;
	runtimeConfig = runtimeConfigParam;
}

export function getInstance(): DatabaseOperations {
	if (!instance) {
		instance = new DatabaseOperations(dbPath);
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
