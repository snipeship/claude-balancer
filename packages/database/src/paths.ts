import { join } from "node:path";
import { getPlatformConfigDir } from "@ccflare/config";

export function resolveDbPath(): string {
	// Check for explicit DB path from environment
	const explicitPath = process.env.ccflare_DB_PATH;
	if (explicitPath) {
		return explicitPath;
	}

	// Use common platform config directory
	const configDir = getPlatformConfigDir();
	return join(configDir, "ccflare.db");
}
