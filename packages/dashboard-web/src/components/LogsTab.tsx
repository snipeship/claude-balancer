import { Pause, Play, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type LogEntry } from "../api";
import { useLogHistory } from "../hooks/queries";
import { Button } from "./ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "./ui/card";

export function LogsTab() {
	const [logs, setLogs] = useState<LogEntry[]>([]);
	const [paused, setPaused] = useState(false);
	const [autoScroll, setAutoScroll] = useState(true);
	const eventSourceRef = useRef<EventSource | null>(null);
	const logsEndRef = useRef<HTMLDivElement>(null);

	const startStreaming = useCallback(() => {
		eventSourceRef.current = api.streamLogs((log: LogEntry) => {
			setLogs((prev) => [...prev.slice(-999), log]); // Keep last 1000 logs
		});
	}, []);

	const stopStreaming = useCallback(() => {
		if (eventSourceRef.current) {
			eventSourceRef.current.close();
			eventSourceRef.current = null;
		}
	}, []);

	// Load historical logs on mount
	const { data: history, isLoading: loading, error } = useLogHistory();

	useEffect(() => {
		if (history) {
			setLogs(history);
		}
	}, [history]);

	useEffect(() => {
		if (!paused && !loading) {
			startStreaming();
		}

		return () => {
			stopStreaming();
		};
	}, [paused, loading, startStreaming, stopStreaming]);

	useEffect(() => {
		if (autoScroll && logsEndRef.current) {
			logsEndRef.current.scrollIntoView({ behavior: "smooth" });
		}
	}, [autoScroll]);

	const clearLogs = () => {
		setLogs([]);
	};

	const togglePause = () => {
		setPaused(!paused);
	};

	const getLogColor = (level: string | undefined) => {
		if (!level) return "";
		switch (level.toUpperCase()) {
			case "ERROR":
				return "text-destructive";
			case "WARN":
				return "text-yellow-600";
			case "INFO":
				return "text-green-600";
			case "DEBUG":
				return "text-muted-foreground";
			default:
				return "";
		}
	};

	const formatTimestamp = (ts: number) => {
		return new Date(ts).toLocaleTimeString();
	};

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<div>
						<CardTitle>Live Logs</CardTitle>
						<CardDescription>
							Real-time log stream {paused && "(Paused)"}
						</CardDescription>
					</div>
					<div className="flex gap-2">
						<Button onClick={togglePause} variant="outline" size="sm">
							{paused ? (
								<>
									<Play className="mr-2 h-4 w-4" />
									Resume
								</>
							) : (
								<>
									<Pause className="mr-2 h-4 w-4" />
									Pause
								</>
							)}
						</Button>
						<Button onClick={clearLogs} variant="outline" size="sm">
							<Trash2 className="mr-2 h-4 w-4" />
							Clear
						</Button>
					</div>
				</div>
			</CardHeader>
			<CardContent>
				<div className="space-y-1 max-h-[500px] overflow-y-auto font-mono text-sm">
					{loading ? (
						<p className="text-muted-foreground">Loading logs...</p>
					) : error ? (
						<p className="text-destructive">
							Error: {error instanceof Error ? error.message : String(error)}
						</p>
					) : logs.length === 0 ? (
						<p className="text-muted-foreground">No logs yet...</p>
					) : (
						logs.map((log, i) => (
							<div key={`${log.ts}-${i}`} className="flex gap-2">
								<span className="text-muted-foreground">
									{formatTimestamp(log.ts)}
								</span>
								<span className={`font-medium ${getLogColor(log.level)}`}>
									[{log.level || "LOG"}]
								</span>
								<span className="flex-1">{log.msg}</span>
							</div>
						))
					)}
					<div ref={logsEndRef} />
				</div>
				<div className="mt-4 flex items-center gap-2">
					<input
						type="checkbox"
						id="autoscroll"
						checked={autoScroll}
						onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
							setAutoScroll((e.target as HTMLInputElement).checked)
						}
						className="rounded border-gray-300"
					/>
					<label htmlFor="autoscroll" className="text-sm text-muted-foreground">
						Auto-scroll to bottom
					</label>
				</div>
			</CardContent>
		</Card>
	);
}
