import { NETWORK } from "@ccflare/core";
import { Box, Text, useInput } from "ink";

interface ServerScreenProps {
	onBack: () => void;
}

export function ServerScreen({ onBack }: ServerScreenProps) {
	// Server is auto-started now, so just show the running status
	const port = NETWORK.DEFAULT_PORT;
	const url = `http://localhost:${port}`;

	useInput((input, key) => {
		if (key.escape || input === "q") {
			onBack();
		}
		if (input === "d") {
			// Open dashboard in browser
			import("open")
				.then((module) => {
					const open = module.default as (url: string) => Promise<void>;
					open(url);
				})
				.catch(() => {
					// Fallback if open package is not available
					console.log(`\nOpen dashboard at: ${url}`);
				});
		}
	});

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text color="cyan" bold>
					🚀 Server
				</Text>
			</Box>

			<Box flexDirection="column">
				<Text color="green">✓ Server running at {url}</Text>
				<Box marginTop={1}>
					<Text dimColor>Press 'd' to open dashboard in browser</Text>
				</Box>
			</Box>

			<Box marginTop={2}>
				<Text dimColor>Press 'q' or ESC to go back</Text>
			</Box>
		</Box>
	);
}
