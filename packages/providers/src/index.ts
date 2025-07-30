// Export all types

// Export base provider class
export { BaseProvider } from "./base";
// Export OAuth utilities
export * from "./oauth";
// Export providers
export * from "./providers/index";
// Export registry functions
export {
	getOAuthProvider,
	getProvider,
	listOAuthProviders,
	listProviders,
	registerProvider,
} from "./registry";
export * from "./types";

import { AnthropicProvider } from "./providers/anthropic/provider";
// Auto-register built-in providers
import { registry } from "./registry";

registry.registerProvider(new AnthropicProvider());
