import type { Agent } from "@ccflare/types";
import { ALLOWED_MODELS } from "@ccflare/types";
import { Bot, Cpu, Folder, Globe, Sparkles } from "lucide-react";
import { Badge } from "../ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "../ui/card";
import { Label } from "../ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select";

interface AgentCardProps {
	agent: Agent;
	onModelChange?: (agentId: string, model: string) => void;
	isUpdating?: boolean;
}

export function AgentCard({
	agent,
	onModelChange,
	isUpdating,
}: AgentCardProps) {
	// Map color names to more sophisticated gradient classes
	const colorMap: Record<string, { border: string; bg: string; icon: string }> =
		{
			gray: {
				border: "border-gray-300 dark:border-gray-700",
				bg: "bg-gray-50 dark:bg-gray-900/50",
				icon: "text-gray-600 dark:text-gray-400",
			},
			blue: {
				border: "border-blue-300 dark:border-blue-700",
				bg: "bg-blue-50 dark:bg-blue-900/20",
				icon: "text-blue-600 dark:text-blue-400",
			},
			green: {
				border: "border-green-300 dark:border-green-700",
				bg: "bg-green-50 dark:bg-green-900/20",
				icon: "text-green-600 dark:text-green-400",
			},
			yellow: {
				border: "border-yellow-300 dark:border-yellow-700",
				bg: "bg-yellow-50 dark:bg-yellow-900/20",
				icon: "text-yellow-600 dark:text-yellow-400",
			},
			orange: {
				border: "border-orange-300 dark:border-orange-700",
				bg: "bg-orange-50 dark:bg-orange-900/20",
				icon: "text-orange-600 dark:text-orange-400",
			},
			red: {
				border: "border-red-300 dark:border-red-700",
				bg: "bg-red-50 dark:bg-red-900/20",
				icon: "text-red-600 dark:text-red-400",
			},
			purple: {
				border: "border-purple-300 dark:border-purple-700",
				bg: "bg-purple-50 dark:bg-purple-900/20",
				icon: "text-purple-600 dark:text-purple-400",
			},
			pink: {
				border: "border-pink-300 dark:border-pink-700",
				bg: "bg-pink-50 dark:bg-pink-900/20",
				icon: "text-pink-600 dark:text-pink-400",
			},
			indigo: {
				border: "border-indigo-300 dark:border-indigo-700",
				bg: "bg-indigo-50 dark:bg-indigo-900/20",
				icon: "text-indigo-600 dark:text-indigo-400",
			},
			cyan: {
				border: "border-cyan-300 dark:border-cyan-700",
				bg: "bg-cyan-50 dark:bg-cyan-900/20",
				icon: "text-cyan-600 dark:text-cyan-400",
			},
		};

	const colors = colorMap[agent.color] || colorMap.gray;
	const isWorkspaceAgent = agent.source === "workspace";
	const SourceIcon = isWorkspaceAgent ? Folder : Globe;

	// Get clean agent name (remove workspace prefix for workspace agents)
	const displayName =
		isWorkspaceAgent && agent.id.includes(":") ? agent.name : agent.name;

	// Get workspace name from ID if it's a workspace agent
	const workspaceName =
		isWorkspaceAgent && agent.id.includes(":") ? agent.id.split(":")[0] : null;

	return (
		<Card
			className={`group relative overflow-hidden transition-all hover:shadow-lg ${colors.border} border-2`}
		>
			{/* Gradient background overlay */}
			<div className={`absolute inset-0 ${colors.bg} opacity-50`} />

			<CardHeader className="relative">
				<div className="space-y-3">
					<div className="flex items-start justify-between">
						<div className="flex items-center gap-3">
							<div
								className={`p-2.5 rounded-xl ${colors.bg} ${colors.border} border backdrop-blur-sm`}
							>
								<Bot className={`h-5 w-5 ${colors.icon}`} />
							</div>
							<div className="flex-1">
								<CardTitle className="text-lg font-semibold flex items-center gap-2">
									{displayName}
									{agent.model.includes("opus") && (
										<Sparkles className="h-4 w-4 text-yellow-500" />
									)}
								</CardTitle>
								<div className="flex items-center gap-2 mt-1">
									<Badge variant="outline" className="text-xs gap-1">
										<SourceIcon className="h-3 w-3" />
										{isWorkspaceAgent ? workspaceName : "Global"}
									</Badge>
									{agent.model.includes("opus") && (
										<Badge variant="secondary" className="text-xs gap-1">
											<Cpu className="h-3 w-3" />
											Advanced
										</Badge>
									)}
								</div>
							</div>
						</div>
					</div>
					<CardDescription className="text-sm leading-relaxed line-clamp-3">
						{agent.description}
					</CardDescription>
				</div>
			</CardHeader>

			<CardContent className="relative space-y-4">
				<div className="space-y-2">
					<Label className="text-muted-foreground">Model Preference</Label>
					<Select
						value={agent.model}
						onValueChange={(value) => onModelChange?.(agent.id, value)}
						disabled={isUpdating}
					>
						<SelectTrigger className="w-full bg-background/60 backdrop-blur-sm">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{ALLOWED_MODELS.map((model) => (
								<SelectItem
									key={model}
									value={model}
									className="flex items-center"
								>
									<span className="flex items-center gap-2">
										{model.replace("claude-", "").replace("-20250514", "")}
										{model.includes("opus") && (
											<Badge variant="secondary" className="text-xs">
												Premium
											</Badge>
										)}
									</span>
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="pt-2 border-t">
					<p className="text-xs text-muted-foreground font-mono">{agent.id}</p>
				</div>
			</CardContent>
		</Card>
	);
}
