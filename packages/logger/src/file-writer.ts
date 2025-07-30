import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	BUFFER_SIZES,
	type Disposable,
	LIMITS,
	registerDisposable,
} from "@ccflare/core";
import type { LogEvent } from "@ccflare/types";

export class LogFileWriter implements Disposable {
	private logDir: string;
	private logFile: string;
	private stream: ReturnType<typeof createWriteStream> | null = null;
	private maxFileSize = BUFFER_SIZES.LOG_FILE_MAX_SIZE;

	constructor() {
		// Create log directory in tmp folder
		this.logDir = join(tmpdir(), "ccflare-logs");
		if (!existsSync(this.logDir)) {
			mkdirSync(this.logDir, { recursive: true });
		}

		this.logFile = join(this.logDir, "app.log");
		this.initStream();
	}

	private initStream(): void {
		// Check if we need to rotate
		if (existsSync(this.logFile)) {
			const stats = statSync(this.logFile);
			if (stats.size > this.maxFileSize) {
				this.rotateLog();
			}
		}

		// Create write stream with append mode
		this.stream = createWriteStream(this.logFile, { flags: "a" });
	}

	private rotateLog(): void {
		if (this.stream) {
			this.stream.end();
		}

		// Simple rotation: just delete old log
		// In production, you might want to keep a few rotated files
		if (existsSync(this.logFile)) {
			// For now, just delete the old file
			// In a production system, you'd rename it to keep history
			try {
				require("node:fs").unlinkSync(this.logFile);
			} catch (_e) {
				console.error("Failed to rotate log:", _e);
			}
		}
	}

	write(event: LogEvent): void {
		if (!this.stream || this.stream.destroyed) {
			this.initStream();
		}

		const line = `${JSON.stringify(event)}\n`;
		if (this.stream) {
			this.stream.write(line);
		}
	}

	async readLogs(limit: number = LIMITS.LOG_READ_DEFAULT): Promise<LogEvent[]> {
		if (!existsSync(this.logFile)) {
			return [];
		}

		try {
			const content = await Bun.file(this.logFile).text();
			const lines = content.trim().split("\n").filter(Boolean);

			// Return the last N logs
			return lines
				.slice(-limit)
				.map((line) => {
					try {
						return JSON.parse(line);
					} catch {
						return null;
					}
				})
				.filter((log): log is LogEvent => log !== null);
		} catch (_e) {
			console.error("Failed to read logs:", _e);
			return [];
		}
	}

	close(): void {
		if (this.stream) {
			this.stream.end();
			this.stream = null;
		}
	}

	dispose(): void {
		this.close();
	}
}

// Singleton instance
export const logFileWriter = new LogFileWriter();

// Register with lifecycle manager
registerDisposable(logFileWriter);
