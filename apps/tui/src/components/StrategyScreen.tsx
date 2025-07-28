import * as tuiCore from "@ccflare/tui-core";
import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import { useCallback, useEffect, useState } from "react";

interface StrategyScreenProps {
	onBack: () => void;
}

type Mode = "view" | "select";

export function StrategyScreen({ onBack }: StrategyScreenProps) {
	const [mode, setMode] = useState<Mode>("view");
	const [currentStrategy, setCurrentStrategy] = useState<string>("");
	const [strategies, setStrategies] = useState<string[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);

	const loadData = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const [current, list] = await Promise.all([
				tuiCore.getStrategy(),
				tuiCore.listStrategies(),
			]);
			setCurrentStrategy(current);
			setStrategies(list);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load data");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadData();
	}, [loadData]);

	useInput((input, key) => {
		if (key.escape || input === "q") {
			if (mode === "select") {
				setMode("view");
			} else {
				onBack();
			}
		} else if (key.return && mode === "view") {
			setMode("select");
			setMessage(null);
		}
	});

	const handleStrategySelect = useCallback(async (item: { value: string }) => {
		try {
			setError(null);
			await tuiCore.setStrategy(item.value);
			setCurrentStrategy(item.value);
			setMessage(`Strategy changed to: ${item.value}`);
			setMode("view");
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to update strategy",
			);
		}
	}, []);

	if (loading) {
		return (
			<Box flexDirection="column">
				<Text>Loading strategies...</Text>
			</Box>
		);
	}

	if (mode === "select") {
		const items = strategies.map((strategy) => ({
			label: strategy === currentStrategy ? `${strategy} (current)` : strategy,
			value: strategy,
		}));

		return (
			<Box flexDirection="column">
				<Box marginBottom={1}>
					<Text bold>Select Load Balancer Strategy</Text>
				</Box>
				<SelectInput items={items} onSelect={handleStrategySelect} />
				<Box marginTop={1}>
					<Text dimColor>Press ESC to cancel</Text>
				</Box>
				{error && (
					<Box marginTop={1}>
						<Text color="red">Error: {error}</Text>
					</Box>
				)}
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold>⚖️ Load Balancer Strategy</Text>
			</Box>

			{message && (
				<Box marginBottom={1}>
					<Text color="green">✓ {message}</Text>
				</Box>
			)}

			<Box marginBottom={1}>
				<Text>Current Strategy: </Text>
				<Text color="yellow" bold>
					{currentStrategy}
				</Text>
			</Box>

			<Box marginBottom={1}>
				<Text bold>Available Strategies:</Text>
			</Box>

			{strategies.map((strategy) => (
				<Box key={strategy} paddingLeft={2}>
					<Text color={strategy === currentStrategy ? "yellow" : undefined}>
						{strategy === currentStrategy ? "→ " : "  "}
						{strategy}
					</Text>
				</Box>
			))}

			<Box marginTop={1} flexDirection="column">
				<Text dimColor>Press ENTER to change strategy</Text>
				<Text dimColor>Press ESC or q to go back</Text>
			</Box>

			{error && (
				<Box marginTop={1}>
					<Text color="red">Error: {error}</Text>
				</Box>
			)}
		</Box>
	);
}
