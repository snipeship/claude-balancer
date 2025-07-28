import { homedir } from "node:os";
import { join } from "node:path";
import { platform } from "node:process";

/**
 * Get the platform-specific configuration directory for ccflare
 */
export function getPlatformConfigDir(): string {
	if (platform === "win32") {
		// Windows: Use LOCALAPPDATA or APPDATA
		const baseDir =
			process.env.LOCALAPPDATA ??
			process.env.APPDATA ??
			join(homedir(), "AppData", "Local");
		return join(baseDir, "ccflare");
	} else {
		// Linux/macOS: Follow XDG Base Directory specification
		const xdgConfig = process.env.XDG_CONFIG_HOME;
		const baseDir = xdgConfig ?? join(homedir(), ".config");
		return join(baseDir, "ccflare");
	}
}
