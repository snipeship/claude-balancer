import { processTokenUsage } from "@ccflare/ui-common";
import type { RequestSummary } from "../api";

interface TokenUsageDisplayProps {
	summary: RequestSummary | undefined;
}

export function TokenUsageDisplay({ summary }: TokenUsageDisplayProps) {
	// Convert RequestSummary to TokenUsageData format, handling null -> undefined conversion
	const tokenData = summary
		? {
				inputTokens: summary.inputTokens,
				outputTokens: summary.outputTokens,
				cacheReadInputTokens: summary.cacheReadInputTokens,
				cacheCreationInputTokens: summary.cacheCreationInputTokens,
				totalTokens: summary.totalTokens,
				costUsd: summary.costUsd,
				responseTimeMs: summary.responseTimeMs ?? undefined,
				tokensPerSecond: summary.tokensPerSecond,
			}
		: undefined;

	const usage = processTokenUsage(tokenData);

	if (!usage.hasData) {
		return (
			<div className="text-center text-muted-foreground py-8">
				<p>No token usage data available</p>
			</div>
		);
	}

	const { sections } = usage;

	return (
		<div className="space-y-4">
			<div className="grid grid-cols-2 gap-4">
				{sections.inputTokens && (
					<div className="bg-muted p-4 rounded-lg">
						<h4 className="font-semibold mb-2">{sections.inputTokens.label}</h4>
						<p className="text-2xl font-mono">{sections.inputTokens.value}</p>
					</div>
				)}

				{sections.outputTokens && (
					<div className="bg-muted p-4 rounded-lg">
						<h4 className="font-semibold mb-2">
							{sections.outputTokens.label}
						</h4>
						<p className="text-2xl font-mono">{sections.outputTokens.value}</p>
					</div>
				)}

				{sections.cacheReadTokens && (
					<div className="bg-muted p-4 rounded-lg">
						<h4 className="font-semibold mb-2">
							{sections.cacheReadTokens.label}
						</h4>
						<p className="text-2xl font-mono">
							{sections.cacheReadTokens.value}
						</p>
					</div>
				)}

				{sections.cacheCreationTokens && (
					<div className="bg-muted p-4 rounded-lg">
						<h4 className="font-semibold mb-2">
							{sections.cacheCreationTokens.label}
						</h4>
						<p className="text-2xl font-mono">
							{sections.cacheCreationTokens.value}
						</p>
					</div>
				)}
			</div>

			{sections.totalTokens && (
				<div className="bg-primary/10 p-4 rounded-lg">
					<h4 className="font-semibold mb-2">{sections.totalTokens.label}</h4>
					<p className="text-3xl font-mono font-bold">
						{sections.totalTokens.value}
					</p>
					{sections.cost && (
						<p className="mt-2 text-lg text-muted-foreground">
							{sections.cost.label}: {sections.cost.value}
						</p>
					)}
				</div>
			)}

			{sections.responseTime && (
				<div className="bg-muted p-4 rounded-lg">
					<h4 className="font-semibold mb-2">{sections.responseTime.label}</h4>
					<p className="text-2xl font-mono">{sections.responseTime.value}</p>
				</div>
			)}

			{sections.tokensPerSecond && (
				<div className="bg-muted p-4 rounded-lg">
					<h4 className="font-semibold mb-2">
						{sections.tokensPerSecond.label}
					</h4>
					<p className="text-2xl font-mono">{sections.tokensPerSecond.value}</p>
				</div>
			)}
		</div>
	);
}
