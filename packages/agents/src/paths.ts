import { homedir } from "node:os";
import { join } from "node:path";

export function getAgentsDirectory(): string {
	return join(homedir(), ".claude", "agents");
}
