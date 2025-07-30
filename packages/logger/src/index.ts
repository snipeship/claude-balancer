import { EventEmitter } from "node:events";
import type { LogEvent } from "@ccflare/types";
import { logFileWriter } from "./file-writer";

export enum LogLevel {
	DEBUG = 0,
	INFO = 1,
	WARN = 2,
	ERROR = 3,
}

export type LogFormat = "pretty" | "json";

// Event emitter for log streaming
export const logBus = new EventEmitter();

export class Logger {
	private level: LogLevel;
	private prefix: string;
	private format: LogFormat;
	private silentConsole: boolean;

	constructor(prefix: string = "", level: LogLevel = LogLevel.INFO) {
		this.prefix = prefix;
		this.level = this.getLogLevelFromEnv() || level;
		this.format = (process.env.LOG_FORMAT as LogFormat) || "pretty";
		// Only show console output in debug mode or if ccflare_DEBUG is set
		this.silentConsole = !(
			process.env.ccflare_DEBUG === "1" || this.level === LogLevel.DEBUG
		);
	}

	private getLogLevelFromEnv(): LogLevel | null {
		const envLevel = process.env.LOG_LEVEL?.toUpperCase();
		if (envLevel && envLevel in LogLevel) {
			return LogLevel[envLevel as keyof typeof LogLevel];
		}
		return null;
	}

	// biome-ignore lint/suspicious/noExplicitAny: Logger needs to accept any data type
	private formatMessage(level: string, message: string, data?: any): string {
		const timestamp = new Date().toISOString();

		if (this.format === "json") {
			const logEntry = {
				ts: timestamp,
				level,
				prefix: this.prefix || undefined,
				msg: message,
				...(data && { data }),
			};
			return JSON.stringify(logEntry);
		} else {
			const prefix = this.prefix ? `[${this.prefix}] ` : "";
			const dataStr = data ? ` ${JSON.stringify(data)}` : "";
			return `[${timestamp}] ${level}: ${prefix}${message}${dataStr}`;
		}
	}

	// biome-ignore lint/suspicious/noExplicitAny: Logger needs to accept any data type
	debug(message: string, data?: any): void {
		if (this.level <= LogLevel.DEBUG) {
			const msg = this.formatMessage("DEBUG", message, data);
			const event: LogEvent = {
				ts: Date.now(),
				level: "DEBUG",
				msg: message,
			};
			logBus.emit("log", event);
			logFileWriter.write(event);
			if (!this.silentConsole) console.log(msg);
		}
	}

	// biome-ignore lint/suspicious/noExplicitAny: Logger needs to accept any data type
	info(message: string, data?: any): void {
		if (this.level <= LogLevel.INFO) {
			const msg = this.formatMessage("INFO", message, data);
			const event: LogEvent = {
				ts: Date.now(),
				level: "INFO",
				msg: message,
			};
			logBus.emit("log", event);
			logFileWriter.write(event);
			if (!this.silentConsole) console.log(msg);
		}
	}

	// biome-ignore lint/suspicious/noExplicitAny: Logger needs to accept any data type
	warn(message: string, data?: any): void {
		if (this.level <= LogLevel.WARN) {
			const msg = this.formatMessage("WARN", message, data);
			const event: LogEvent = {
				ts: Date.now(),
				level: "WARN",
				msg: message,
			};
			logBus.emit("log", event);
			logFileWriter.write(event);
			if (!this.silentConsole) console.warn(msg);
		}
	}

	// biome-ignore lint/suspicious/noExplicitAny: Logger needs to accept any error type
	error(message: string, error?: any): void {
		if (this.level <= LogLevel.ERROR) {
			const msg = this.formatMessage("ERROR", message, error);
			const event: LogEvent = {
				ts: Date.now(),
				level: "ERROR",
				msg: message,
			};
			logBus.emit("log", event);
			logFileWriter.write(event);
			if (!this.silentConsole) console.error(msg);
		}
	}

	setLevel(level: LogLevel): void {
		this.level = level;
		// Update silentConsole when level changes
		this.silentConsole = !(
			process.env.ccflare_DEBUG === "1" || this.level === LogLevel.DEBUG
		);
	}

	getLevel(): LogLevel {
		return this.level;
	}
}

// Default logger instance
export const log = new Logger();
export { logFileWriter } from "./file-writer";
