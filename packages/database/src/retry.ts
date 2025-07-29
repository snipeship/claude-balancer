import { Logger } from "@ccflare/logger";
import type { DatabaseRetryConfig } from "./index";

const logger = new Logger("db-retry");

/**
 * Error codes that indicate database lock contention and should trigger retries
 */
const RETRYABLE_SQLITE_ERRORS = [
	"SQLITE_BUSY",
	"SQLITE_LOCKED",
	"database is locked",
	"database table is locked",
];

/**
 * Check if an error is retryable (indicates database lock contention)
 */
function isRetryableError(error: unknown): boolean {
	if (!error) return false;
	
	const errorMessage = error instanceof Error ? error.message : String(error);
	const errorCode = (error as any)?.code;
	
	return RETRYABLE_SQLITE_ERRORS.some(retryableError => 
		errorMessage.includes(retryableError) || errorCode === retryableError
	);
}

/**
 * Calculate delay for exponential backoff with jitter
 */
function calculateDelay(attempt: number, config: Required<DatabaseRetryConfig>): number {
	const baseDelay = config.delayMs * Math.pow(config.backoff, attempt);
	const jitter = Math.random() * 0.1 * baseDelay; // Add 10% jitter
	const delayWithJitter = baseDelay + jitter;
	
	return Math.min(delayWithJitter, config.maxDelayMs);
}

/**
 * Sleep for the specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry wrapper for database operations with exponential backoff
 */
export async function withDatabaseRetry<T>(
	operation: () => T | Promise<T>,
	config: DatabaseRetryConfig = {},
	operationName = "database operation"
): Promise<T> {
	const retryConfig: Required<DatabaseRetryConfig> = {
		attempts: 3,
		delayMs: 100,
		backoff: 2,
		maxDelayMs: 5000,
		...config,
	};

	let lastError: unknown;
	
	for (let attempt = 0; attempt < retryConfig.attempts; attempt++) {
		try {
			const result = await operation();
			
			// Log successful retry if this wasn't the first attempt
			if (attempt > 0) {
				logger.info(`${operationName} succeeded after ${attempt + 1} attempts`);
			}
			
			return result;
		} catch (error) {
			lastError = error;
			
			// Check if this is a retryable error
			if (!isRetryableError(error)) {
				logger.debug(`${operationName} failed with non-retryable error:`, error);
				throw error;
			}
			
			// If this was the last attempt, throw the error
			if (attempt === retryConfig.attempts - 1) {
				logger.error(`${operationName} failed after ${retryConfig.attempts} attempts:`, error);
				throw error;
			}
			
			// Calculate delay and wait before retry
			const delay = calculateDelay(attempt, retryConfig);
			logger.warn(
				`${operationName} failed (attempt ${attempt + 1}/${retryConfig.attempts}), retrying in ${delay.toFixed(0)}ms:`,
				error instanceof Error ? error.message : String(error)
			);
			
			await sleep(delay);
		}
	}
	
	// This should never be reached, but TypeScript requires it
	throw lastError;
}

/**
 * Synchronous retry wrapper for database operations
 */
export function withDatabaseRetrySync<T>(
	operation: () => T,
	config: DatabaseRetryConfig = {},
	operationName = "database operation"
): T {
	const retryConfig: Required<DatabaseRetryConfig> = {
		attempts: 3,
		delayMs: 100,
		backoff: 2,
		maxDelayMs: 5000,
		...config,
	};

	let lastError: unknown;
	
	for (let attempt = 0; attempt < retryConfig.attempts; attempt++) {
		try {
			const result = operation();
			
			// Log successful retry if this wasn't the first attempt
			if (attempt > 0) {
				logger.info(`${operationName} succeeded after ${attempt + 1} attempts`);
			}
			
			return result;
		} catch (error) {
			lastError = error;
			
			// Check if this is a retryable error
			if (!isRetryableError(error)) {
				logger.debug(`${operationName} failed with non-retryable error:`, error);
				throw error;
			}
			
			// If this was the last attempt, throw the error
			if (attempt === retryConfig.attempts - 1) {
				logger.error(`${operationName} failed after ${retryConfig.attempts} attempts:`, error);
				throw error;
			}
			
			// Calculate delay and wait before retry (synchronous sleep)
			const delay = calculateDelay(attempt, retryConfig);
			logger.warn(
				`${operationName} failed (attempt ${attempt + 1}/${retryConfig.attempts}), retrying in ${delay.toFixed(0)}ms:`,
				error instanceof Error ? error.message : String(error)
			);
			
			// Synchronous sleep using Bun.sleepSync if available, otherwise busy wait
			if (typeof Bun !== 'undefined' && Bun.sleepSync) {
				Bun.sleepSync(delay);
			} else {
				// Fallback busy wait (not ideal but necessary for sync operations)
				const start = Date.now();
				while (Date.now() - start < delay) {
					// Busy wait
				}
			}
		}
	}
	
	// This should never be reached, but TypeScript requires it
	throw lastError;
}
