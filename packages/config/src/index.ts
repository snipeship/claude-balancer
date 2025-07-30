import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
	DEFAULT_STRATEGY,
	isValidStrategy,
	NETWORK,
	type StrategyName,
	TIME_CONSTANTS,
} from "@ccflare/core";
import { Logger } from "@ccflare/logger";
import { resolveConfigPath } from "./paths";

const log = new Logger("Config");

export interface RuntimeConfig {
	clientId: string;
	retry: { attempts: number; delayMs: number; backoff: number };
	sessionDurationMs: number;
	port: number;
	database?: {
		walMode?: boolean;
		busyTimeoutMs?: number;
		cacheSize?: number;
		synchronous?: 'OFF' | 'NORMAL' | 'FULL';
		mmapSize?: number;
		retry?: {
			attempts?: number;
			delayMs?: number;
			backoff?: number;
			maxDelayMs?: number;
		};
	};
}

export interface ConfigData {
	lb_strategy?: StrategyName;
	client_id?: string;
	retry_attempts?: number;
	retry_delay_ms?: number;
	retry_backoff?: number;
	session_duration_ms?: number;
	port?: number;
	// Database configuration
	db_wal_mode?: boolean;
	db_busy_timeout_ms?: number;
	db_cache_size?: number;
	db_synchronous?: 'OFF' | 'NORMAL' | 'FULL';
	db_mmap_size?: number;
	db_retry_attempts?: number;
	db_retry_delay_ms?: number;
	db_retry_backoff?: number;
	db_retry_max_delay_ms?: number;
	[key: string]: string | number | boolean | undefined;
}

export class Config extends EventEmitter {
	private configPath: string;
	private data: ConfigData = {};

	constructor(configPath?: string) {
		super();
		this.configPath = configPath ?? resolveConfigPath();
		this.loadConfig();
	}

	private loadConfig(): void {
		if (existsSync(this.configPath)) {
			try {
				const content = readFileSync(this.configPath, "utf8");
				this.data = JSON.parse(content) as ConfigData;
			} catch (error) {
				log.error(`Failed to parse config file: ${error}`);
				this.data = {};
			}
		} else {
			// Create config directory if it doesn't exist
			const dir = dirname(this.configPath);
			mkdirSync(dir, { recursive: true });

			// Initialize with default config
			this.data = {
				lb_strategy: DEFAULT_STRATEGY,
			};
			this.saveConfig();
		}
	}

	private saveConfig(): void {
		try {
			const content = JSON.stringify(this.data, null, 2);
			writeFileSync(this.configPath, content, "utf8");
		} catch (error) {
			log.error(`Failed to save config file: ${error}`);
		}
	}

	get(
		key: string,
		defaultValue?: string | number | boolean,
	): string | number | boolean | undefined {
		if (key in this.data) {
			return this.data[key];
		}

		if (defaultValue !== undefined) {
			this.set(key, defaultValue);
			return defaultValue;
		}

		return undefined;
	}

	set(key: string, value: string | number | boolean): void {
		const oldValue = this.data[key];
		this.data[key] = value;
		this.saveConfig();

		// Emit change event
		this.emit("change", { key, oldValue, newValue: value });
	}

	getStrategy(): StrategyName {
		// First check environment variable
		const envStrategy = process.env.LB_STRATEGY;
		if (envStrategy && isValidStrategy(envStrategy)) {
			return envStrategy;
		}

		// Then check config file
		const configStrategy = this.data.lb_strategy;
		if (configStrategy && isValidStrategy(configStrategy)) {
			return configStrategy;
		}

		return DEFAULT_STRATEGY;
	}

	setStrategy(strategy: StrategyName): void {
		if (!isValidStrategy(strategy)) {
			throw new Error(`Invalid strategy: ${strategy}`);
		}
		this.set("lb_strategy", strategy);
	}

	getAllSettings(): Record<string, string | number | boolean | undefined> {
		// Include current strategy (which might come from env)
		return {
			...this.data,
			lb_strategy: this.getStrategy(),
		};
	}

	getRuntime(): RuntimeConfig {
		// Default values
		const defaults: RuntimeConfig = {
			clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
			retry: {
				attempts: 3,
				delayMs: TIME_CONSTANTS.RETRY_DELAY_DEFAULT,
				backoff: 2,
			},
			sessionDurationMs: TIME_CONSTANTS.SESSION_DURATION_DEFAULT,
			port: NETWORK.DEFAULT_PORT,
			database: {
				walMode: true,
				busyTimeoutMs: 5000,
				cacheSize: -20000, // 20MB cache
				synchronous: 'NORMAL',
				mmapSize: 268435456, // 256MB
				retry: {
					attempts: 3,
					delayMs: 100,
					backoff: 2,
					maxDelayMs: 5000,
				},
			},
		};

		// Override with environment variables if present
		if (process.env.CLIENT_ID) {
			defaults.clientId = process.env.CLIENT_ID;
		}
		if (process.env.RETRY_ATTEMPTS) {
			defaults.retry.attempts = parseInt(process.env.RETRY_ATTEMPTS);
		}
		if (process.env.RETRY_DELAY_MS) {
			defaults.retry.delayMs = parseInt(process.env.RETRY_DELAY_MS);
		}
		if (process.env.RETRY_BACKOFF) {
			defaults.retry.backoff = parseFloat(process.env.RETRY_BACKOFF);
		}
		if (process.env.SESSION_DURATION_MS) {
			defaults.sessionDurationMs = parseInt(process.env.SESSION_DURATION_MS);
		}
		if (process.env.PORT) {
			defaults.port = parseInt(process.env.PORT);
		}

		// Override with config file settings if present
		if (this.data.client_id) {
			defaults.clientId = this.data.client_id;
		}
		if (typeof this.data.retry_attempts === "number") {
			defaults.retry.attempts = this.data.retry_attempts;
		}
		if (typeof this.data.retry_delay_ms === "number") {
			defaults.retry.delayMs = this.data.retry_delay_ms;
		}
		if (typeof this.data.retry_backoff === "number") {
			defaults.retry.backoff = this.data.retry_backoff;
		}
		if (typeof this.data.session_duration_ms === "number") {
			defaults.sessionDurationMs = this.data.session_duration_ms;
		}
		if (typeof this.data.port === "number") {
			defaults.port = this.data.port;
		}

		// Database configuration overrides
		if (typeof this.data.db_wal_mode === "boolean") {
			defaults.database!.walMode = this.data.db_wal_mode;
		}
		if (typeof this.data.db_busy_timeout_ms === "number") {
			defaults.database!.busyTimeoutMs = this.data.db_busy_timeout_ms;
		}
		if (typeof this.data.db_cache_size === "number") {
			defaults.database!.cacheSize = this.data.db_cache_size;
		}
		if (typeof this.data.db_synchronous === "string") {
			defaults.database!.synchronous = this.data.db_synchronous as 'OFF' | 'NORMAL' | 'FULL';
		}
		if (typeof this.data.db_mmap_size === "number") {
			defaults.database!.mmapSize = this.data.db_mmap_size;
		}
		if (typeof this.data.db_retry_attempts === "number") {
			defaults.database!.retry!.attempts = this.data.db_retry_attempts;
		}
		if (typeof this.data.db_retry_delay_ms === "number") {
			defaults.database!.retry!.delayMs = this.data.db_retry_delay_ms;
		}
		if (typeof this.data.db_retry_backoff === "number") {
			defaults.database!.retry!.backoff = this.data.db_retry_backoff;
		}
		if (typeof this.data.db_retry_max_delay_ms === "number") {
			defaults.database!.retry!.maxDelayMs = this.data.db_retry_max_delay_ms;
		}

		return defaults;
	}
}

// Re-export types
export type { StrategyName } from "@ccflare/core";
export { resolveConfigPath } from "./paths";
export { getPlatformConfigDir } from "./paths-common";
