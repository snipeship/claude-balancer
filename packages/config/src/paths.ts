import { join } from "node:path";
import { getPlatformConfigDir } from "./paths-common";

export function resolveConfigPath(): string {
	// Check for explicit config path from environment
	const explicitPath = process.env.ccflare_CONFIG_PATH;
	if (explicitPath) {
		return explicitPath;
	}

	// Use common platform config directory
	const configDir = getPlatformConfigDir();
	return join(configDir, "ccflare.json");
}
