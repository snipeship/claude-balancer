import type { AgentWorkspace } from "@ccflare/types";
import { formatDistanceToNow } from "date-fns";
import { Folder, FolderOpen, Package } from "lucide-react";
import { Badge } from "../ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "../ui/card";

interface WorkspaceCardProps {
	workspace: AgentWorkspace & { agentCount?: number };
	isActive?: boolean;
}

export function WorkspaceCard({ workspace, isActive }: WorkspaceCardProps) {
	const Icon = isActive ? FolderOpen : Folder;

	return (
		<Card
			className={`transition-all ${isActive ? "ring-2 ring-primary shadow-lg" : "hover:shadow-md"}`}
		>
			<CardHeader>
				<div className="flex items-start justify-between">
					<div className="flex items-center gap-3">
						<div
							className={`p-2 rounded-lg ${isActive ? "bg-primary/10" : "bg-muted"}`}
						>
							<Icon
								className={`h-5 w-5 ${isActive ? "text-primary" : "text-muted-foreground"}`}
							/>
						</div>
						<div>
							<CardTitle className="text-lg font-semibold">
								{workspace.name}
							</CardTitle>
							<CardDescription className="text-xs mt-1">
								{workspace.path}
							</CardDescription>
						</div>
					</div>
					{workspace.agentCount !== undefined && workspace.agentCount > 0 && (
						<Badge variant="secondary" className="gap-1">
							<Package className="h-3 w-3" />
							{workspace.agentCount}
						</Badge>
					)}
				</div>
			</CardHeader>
			<CardContent>
				<p className="text-sm text-muted-foreground">
					Last seen{" "}
					{formatDistanceToNow(new Date(workspace.lastSeen), {
						addSuffix: true,
					})}
				</p>
			</CardContent>
		</Card>
	);
}
