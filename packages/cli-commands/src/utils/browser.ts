import { spawn } from "node:child_process";
import open from "open";

/**
 * Try to open the user's default browser with the given URL.
 * Returns true on success, false otherwise.
 */
export async function openBrowser(url: string): Promise<boolean> {
	try {
		await open(url, { wait: false });
		return true;
	} catch (_err) {
		// Fallback – Windows quoting is critical!
		try {
			if (process.platform === "win32") {
				// Use powershell -Command Start-Process 'url'
				spawn(
					"powershell.exe",
					["-NoProfile", "-Command", "Start-Process", `'${url}'`],
					{
						detached: true,
						stdio: "ignore",
					},
				).unref();
			} else if (process.platform === "darwin") {
				spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
			} else {
				// Linux generic fallback
				spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
			}
			return true;
		} catch {
			return false;
		}
	}
}
