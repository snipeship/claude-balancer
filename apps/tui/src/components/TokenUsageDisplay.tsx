import type { RequestSummary } from "@ccflare/tui-core";
import { processTokenUsage } from "@ccflare/ui-common";
import { Box, Text } from "ink";

interface TokenUsageDisplayProps {
	summary: RequestSummary;
}

export function TokenUsageDisplay({ summary }: TokenUsageDisplayProps) {
	const usage = processTokenUsage(summary);

	if (!usage.hasData) {
		return (
			<Box flexDirection="column" marginTop={1}>
				<Text dimColor>No token usage data available</Text>
			</Box>
		);
	}

	const { sections } = usage;

	return (
		<Box flexDirection="column" marginTop={1}>
			<Text bold>Token Usage:</Text>
			<Box marginLeft={2} flexDirection="column">
				{sections.inputTokens && (
					<Box>
						<Text>{sections.inputTokens.label}: </Text>
						<Text color="yellow" bold>
							{sections.inputTokens.value}
						</Text>
					</Box>
				)}

				{sections.outputTokens && (
					<Box>
						<Text>{sections.outputTokens.label}: </Text>
						<Text color="yellow" bold>
							{sections.outputTokens.value}
						</Text>
					</Box>
				)}

				{sections.cacheReadTokens && (
					<Box>
						<Text>{sections.cacheReadTokens.label}: </Text>
						<Text color="cyan" bold>
							{sections.cacheReadTokens.value}
						</Text>
					</Box>
				)}

				{sections.cacheCreationTokens && (
					<Box>
						<Text>{sections.cacheCreationTokens.label}: </Text>
						<Text color="cyan" bold>
							{sections.cacheCreationTokens.value}
						</Text>
					</Box>
				)}

				<Box marginTop={1}>
					<Text>─────────────────────</Text>
				</Box>

				{sections.totalTokens && (
					<Box>
						<Text bold>{sections.totalTokens.label}: </Text>
						<Text color="green" bold>
							{sections.totalTokens.value}
						</Text>
					</Box>
				)}

				{sections.cost && (
					<Box>
						<Text bold>{sections.cost.label}: </Text>
						<Text color="green" bold>
							{sections.cost.value}
						</Text>
					</Box>
				)}
			</Box>
		</Box>
	);
}
