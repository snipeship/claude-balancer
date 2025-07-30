import { parseArgs as nodeParseArgs } from "node:util";

export interface ParsedArgs {
	help?: boolean;
	serve?: boolean;
	port?: number;
	logs?: boolean | number;
	stats?: boolean;
	addAccount?: string;
	mode?: "max" | "console";
	tier?: 1 | 5 | 20;
	list?: boolean;
	remove?: string;
	pause?: string;
	resume?: string;
	analyze?: boolean;
	resetStats?: boolean;
	clearHistory?: boolean;
}

export function parseArgs(args: string[]): ParsedArgs {
	try {
		const { values } = nodeParseArgs({
			args,
			options: {
				help: { type: "boolean", short: "h" },
				serve: { type: "boolean" },
				port: { type: "string" },
				logs: { type: "string" },
				stats: { type: "boolean" },
				"add-account": { type: "string" },
				mode: { type: "string" },
				tier: { type: "string" },
				list: { type: "boolean" },
				remove: { type: "string" },
				pause: { type: "string" },
				resume: { type: "string" },
				analyze: { type: "boolean" },
				"reset-stats": { type: "boolean" },
				"clear-history": { type: "boolean" },
			},
			allowPositionals: true,
		});

		const result: ParsedArgs = {};

		if (values.help) result.help = true;
		if (values.serve) result.serve = true;
		if (values.port) result.port = parseInt(values.port, 10);
		if (values.logs !== undefined) {
			result.logs = values.logs ? parseInt(values.logs, 10) : true;
		}
		if (values.stats) result.stats = true;
		if (values["add-account"]) result.addAccount = values["add-account"];
		if (values.mode) result.mode = values.mode as "max" | "console";
		if (values.tier) result.tier = parseInt(values.tier, 10) as 1 | 5 | 20;
		if (values.list) result.list = true;
		if (values.remove) result.remove = values.remove;
		if (values.pause) result.pause = values.pause;
		if (values.resume) result.resume = values.resume;
		if (values.analyze) result.analyze = true;
		if (values["reset-stats"]) result.resetStats = true;
		if (values["clear-history"]) result.clearHistory = true;

		return result;
	} catch (error) {
		console.error("Error parsing arguments:", error);
		return { help: true };
	}
}
