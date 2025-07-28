import * as tuiCore from "@ccflare/tui-core";
import { Box, Text, useInput } from "ink";
import { useEffect, useState } from "react";

interface LogsScreenProps {
	onBack: () => void;
}

interface LogEntry {
	ts: number;
	level: string;
	msg: string;
}

export function LogsScreen({ onBack }: LogsScreenProps) {
	const [logs, setLogs] = useState<LogEntry[]>([]);
	const [paused, setPaused] = useState(false);
	const [loading, setLoading] = useState(true);

	useInput((input, key) => {
		if (key.escape || input === "q") {
			onBack();
		}
		if (input === " ") {
			setPaused(!paused);
		}
		if (input === "c") {
			setLogs([]);
		}
	});

	// Load historical logs on mount
	useEffect(() => {
		const loadHistory = async () => {
			try {
				const history = await tuiCore.getLogHistory();
				setLogs(history.slice(-200)); // Keep last 200 logs
			} catch (error) {
				console.error("Failed to load log history:", error);
			} finally {
				setLoading(false);
			}
		};
		loadHistory();
	}, []);

	useEffect(() => {
		if (!paused && !loading) {
			const unsubscribe = tuiCore.streamLogs((log) => {
				setLogs((prev) => [...prev.slice(-200), log]); // Keep last 200 logs
			});

			return () => {
				unsubscribe();
			};
		}
	}, [paused, loading]);

	const getLogColor = (level: string) => {
		switch (level.toUpperCase()) {
			case "ERROR":
				return "red";
			case "WARN":
				return "yellow";
			case "INFO":
				return "green";
			case "DEBUG":
				return "gray";
			default:
				return "white";
		}
	};

	return (
		<Box flexDirection="column" padding={1} height="100%">
			<Box marginBottom={1}>
				<Text color="cyan" bold>
					📜 Logs {paused && <Text color="yellow">(PAUSED)</Text>}
				</Text>
			</Box>

			<Box flexDirection="column" flexGrow={1}>
				{loading ? (
					<Text dimColor>Loading logs...</Text>
				) : logs.length === 0 ? (
					<Text dimColor>No logs yet...</Text>
				) : (
					logs.map((log, i) => (
						<Box key={`${log.ts}-${i}`}>
							<Text color={getLogColor(log.level)}>
								[{log.level}] {log.msg}
							</Text>
						</Box>
					))
				)}
			</Box>

			<Box marginTop={1}>
				<Text dimColor>
					SPACE: {paused ? "Resume" : "Pause"} • 'c': Clear • 'q'/ESC: Back
				</Text>
			</Box>
		</Box>
	);
}
