import { type Account, StrategyName } from "@ccflare/types";

// Array of all strategies for backwards compatibility
export const STRATEGIES = Object.values(StrategyName);

export function isValidStrategy(strategy: string): strategy is StrategyName {
	return Object.values(StrategyName).includes(strategy as StrategyName);
}

// Default load balancing strategy
export const DEFAULT_STRATEGY = StrategyName.Session;

// Helper to check if an account is available (not rate-limited or paused)
export function isAccountAvailable(
	account: Account,
	now = Date.now(),
): boolean {
	return (
		!account.paused &&
		(!account.rate_limited_until || account.rate_limited_until < now)
	);
}

// Re-export from types package for backwards compatibility
export { StrategyName } from "@ccflare/types";
